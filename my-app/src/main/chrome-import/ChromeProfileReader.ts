import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { mainLogger } from '../logger';

export interface ChromeProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  profilePath: string;
  browserName: string;
  browserPath: string;
  displayName: string;
}

interface BrowserInstall {
  name: string;
  browserPath: string;
  userDataDir: string;
}

interface LocalStateProfile {
  name?: string;
  user_name?: string;
  last_downloaded_gaia_picture_url_with_size?: string;
}

interface LocalStateData {
  profile?: {
    info_cache?: Record<string, LocalStateProfile>;
  };
}

function uniqueInstalls(installs: BrowserInstall[]): BrowserInstall[] {
  const seen = new Set<string>();
  return installs.filter((install) => {
    const key = `${install.name}:${install.browserPath}:${install.userDataDir}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function macCandidates(): BrowserInstall[] {
  const home = os.homedir();
  return [
    {
      name: 'Google Chrome',
      browserPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
    },
    {
      name: 'Brave',
      browserPath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      userDataDir: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
    },
    {
      name: 'Microsoft Edge',
      browserPath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      userDataDir: path.join(home, 'Library', 'Application Support', 'Microsoft Edge'),
    },
    {
      name: 'Chromium',
      browserPath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      userDataDir: path.join(home, 'Library', 'Application Support', 'Chromium'),
    },
    {
      name: 'Arc',
      browserPath: '/Applications/Arc.app/Contents/MacOS/Arc',
      userDataDir: path.join(home, 'Library', 'Application Support', 'Arc'),
    },
    {
      name: 'Vivaldi',
      browserPath: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
      userDataDir: path.join(home, 'Library', 'Application Support', 'Vivaldi'),
    },
  ];
}

function windowsCandidates(): BrowserInstall[] {
  const home = os.homedir();
  const programFiles = process.env.ProgramFiles ?? '';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? '';
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');

  return [
    {
      name: 'Google Chrome',
      browserPath: path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      userDataDir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    },
    {
      name: 'Google Chrome',
      browserPath: path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      userDataDir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    },
    {
      name: 'Brave',
      browserPath: path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      userDataDir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    },
    {
      name: 'Microsoft Edge',
      browserPath: path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      userDataDir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
    },
    {
      name: 'Chromium',
      browserPath: path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
      userDataDir: path.join(localAppData, 'Chromium', 'User Data'),
    },
  ];
}

function linuxCandidates(): BrowserInstall[] {
  const home = os.homedir();
  return [
    {
      name: 'Google Chrome',
      browserPath: '/usr/bin/google-chrome',
      userDataDir: path.join(home, '.config', 'google-chrome'),
    },
    {
      name: 'Google Chrome',
      browserPath: '/usr/bin/google-chrome-stable',
      userDataDir: path.join(home, '.config', 'google-chrome'),
    },
    {
      name: 'Brave',
      browserPath: '/usr/bin/brave-browser',
      userDataDir: path.join(home, '.config', 'BraveSoftware', 'Brave-Browser'),
    },
    {
      name: 'Microsoft Edge',
      browserPath: '/usr/bin/microsoft-edge',
      userDataDir: path.join(home, '.config', 'microsoft-edge'),
    },
    {
      name: 'Chromium',
      browserPath: '/usr/bin/chromium',
      userDataDir: path.join(home, '.config', 'chromium'),
    },
    {
      name: 'Chromium',
      browserPath: '/usr/bin/chromium-browser',
      userDataDir: path.join(home, '.config', 'chromium'),
    },
  ];
}

function detectBrowserInstalls(): BrowserInstall[] {
  const candidates = process.platform === 'darwin'
    ? macCandidates()
    : process.platform === 'win32'
      ? windowsCandidates()
      : linuxCandidates();

  return uniqueInstalls(
    candidates.filter((candidate) =>
      fs.existsSync(candidate.browserPath) && fs.existsSync(candidate.userDataDir),
    ),
  );
}

function loadProfileMetadata(userDataDir: string): Record<string, LocalStateProfile> {
  const localStatePath = path.join(userDataDir, 'Local State');
  if (!fs.existsSync(localStatePath)) return {};

  try {
    const parsed = JSON.parse(fs.readFileSync(localStatePath, 'utf-8')) as LocalStateData;
    return parsed.profile?.info_cache ?? {};
  } catch (err) {
    mainLogger.warn('ChromeProfileReader.localState.parseFailed', {
      userDataDir,
      error: (err as Error).message,
    });
    return {};
  }
}

function isValidProfile(profilePath: string): boolean {
  return (
    fs.existsSync(path.join(profilePath, 'Preferences')) ||
    fs.existsSync(path.join(profilePath, 'Cookies')) ||
    fs.existsSync(path.join(profilePath, 'Bookmarks'))
  );
}

export function listChromeProfiles(): ChromeProfile[] {
  const profiles: ChromeProfile[] = [];

  for (const browser of detectBrowserInstalls()) {
    const infoCache = loadProfileMetadata(browser.userDataDir);
    let dirEntries: fs.Dirent[] = [];

    try {
      dirEntries = fs.readdirSync(browser.userDataDir, { withFileTypes: true });
    } catch (err) {
      mainLogger.warn('ChromeProfileReader.readdirFailed', {
        browserName: browser.name,
        userDataDir: browser.userDataDir,
        error: (err as Error).message,
      });
      continue;
    }

    for (const entry of dirEntries) {
      if (!entry.isDirectory()) continue;

      const profileDirName = entry.name;
      const profilePath = path.join(browser.userDataDir, profileDirName);
      if (!isValidProfile(profilePath)) continue;

      const info = infoCache[profileDirName] ?? {};
      const profileName = info.name || profileDirName;
      profiles.push({
        id: `${browser.name}:${profileDirName}`,
        name: profileName,
        email: info.user_name ?? '',
        avatarUrl: info.last_downloaded_gaia_picture_url_with_size ?? '',
        profilePath,
        browserName: browser.name,
        browserPath: browser.browserPath,
        displayName: `${browser.name} - ${profileName}`,
      });
    }
  }

  profiles.sort((a, b) => {
    if (a.browserName !== b.browserName) return a.browserName.localeCompare(b.browserName);
    if (a.name === 'Default') return -1;
    if (b.name === 'Default') return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  mainLogger.info('ChromeProfileReader.listProfiles', {
    count: profiles.length,
    browserCount: new Set(profiles.map((profile) => profile.browserName)).size,
  });

  return profiles;
}
