import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

import { session } from 'electron';

import { cdpForWsUrl } from '../hl/cdp';
import { mainLogger } from '../logger';
import { readChromeBookmarks } from './ChromeBookmarkImporter';

export interface ChromeImportResult {
  cookies: { imported: number; failed: number; total: number };
  bookmarks: { imported: number; folders: number };
}

interface ImportedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
  session?: boolean;
}

const SKIP_DIRS = new Set([
  'Service Worker',
  'Extensions',
  'IndexedDB',
  'Local Extension Settings',
  'Local Storage',
  'GPUCache',
  'Shared Dictionary',
  'SharedCache',
]);

const SKIP_FILES = new Set([
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie',
  'lockfile',
  'RunningChromeVersion',
  'History',
]);

function copyProfileToTemp(srcProfilePath: string): { tempDir: string; tempProfilePath: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-profile-'));
  const tempProfilePath = path.join(tempDir, 'Default');

  fs.mkdirSync(tempProfilePath, { recursive: true });

  const walk = (srcDir: string, destDir: string): void => {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        fs.mkdirSync(destPath, { recursive: true });
        walk(srcPath, destPath);
        continue;
      }

      if (SKIP_FILES.has(entry.name)) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  };

  walk(srcProfilePath, tempProfilePath);
  return { tempDir, tempProfilePath };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a free port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function launchBrowser(browserPath: string, userDataDir: string, debugPort: number): ChildProcess {
  return spawn(
    browserPath,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--profile-directory=Default',
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-startup-window',
    ],
    {
      stdio: 'ignore',
      detached: false,
    },
  );
}

async function getWebSocketDebuggerUrl(baseUrl: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/json/version`);
      if (!response.ok) {
        throw new Error(`CDP endpoint returned ${response.status}`);
      }
      const data = await response.json() as { webSocketDebuggerUrl?: string };
      if (!data.webSocketDebuggerUrl) {
        throw new Error('Missing webSocketDebuggerUrl');
      }
      return data.webSocketDebuggerUrl;
    } catch (err) {
      lastError = err as Error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw lastError ?? new Error('Could not resolve WebSocket debugger URL');
}

async function extractCookiesFromBrowser(baseUrl: string): Promise<ImportedCookie[]> {
  const wsUrl = await getWebSocketDebuggerUrl(baseUrl);
  const cdp = await cdpForWsUrl(wsUrl);

  try {
    const result = await cdp.send('Storage.getCookies', {});
    const cookies = (result as { cookies?: ImportedCookie[] }).cookies ?? [];
    return cookies;
  } finally {
    await cdp.close();
  }
}

function toElectronSameSite(value: string | undefined): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
  switch (value) {
    case 'Strict':
      return 'strict';
    case 'Lax':
      return 'lax';
    case 'None':
      return 'no_restriction';
    default:
      return 'unspecified';
  }
}

async function importCookiesToSession(
  cookies: ImportedCookie[],
  onProgress?: (imported: number, total: number) => void,
): Promise<{ imported: number; failed: number; total: number }> {
  const total = cookies.length;
  let imported = 0;
  let failed = 0;

  for (const cookie of cookies) {
    try {
      const hostname = cookie.domain.replace(/^\./, '');
      const url = `http${cookie.secure ? 's' : ''}://${hostname}${cookie.path || '/'}`;
      await session.defaultSession.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: !!cookie.secure,
        httpOnly: !!cookie.httpOnly,
        sameSite: toElectronSameSite(cookie.sameSite),
        expirationDate: !cookie.session && cookie.expires ? cookie.expires : undefined,
      });
      imported += 1;
    } catch {
      failed += 1;
    }

    onProgress?.(imported, total);
  }

  return { imported, failed, total };
}

export async function importChromeCookes(
  browserPath: string,
  profilePath: string,
  onProgress?: (imported: number, total: number) => void,
): Promise<ChromeImportResult> {
  mainLogger.info('ChromeCookieImporter.start', { browserPath, profilePath });

  const { tempDir, tempProfilePath } = copyProfileToTemp(profilePath);
  const debugPort = await getFreePort();
  const browser = launchBrowser(browserPath, tempDir, debugPort);

  try {
    const cookies = await extractCookiesFromBrowser(`http://127.0.0.1:${debugPort}`);
    const cookieResult = await importCookiesToSession(cookies, onProgress);
    const { bookmarks, folders } = readChromeBookmarks(tempProfilePath);

    const result: ChromeImportResult = {
      cookies: cookieResult,
      bookmarks: { imported: bookmarks.length, folders },
    };

    mainLogger.info('ChromeCookieImporter.complete', {
      browserPath,
      profilePath,
      cookiesImported: cookieResult.imported,
      bookmarkCount: bookmarks.length,
    });

    return result;
  } finally {
    browser.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
