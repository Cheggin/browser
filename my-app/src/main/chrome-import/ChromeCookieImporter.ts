import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { session } from 'electron';
import { mainLogger } from '../logger';

const SALT = 'saltysalt';
const ITERATIONS_MAC = 1003;
const KEY_LENGTH = 16;
const IV = Buffer.alloc(16, ' '.charCodeAt(0));

interface RawCookie {
  host_key: string;
  name: string;
  path: string;
  encrypted_value: Buffer;
  expires_utc: number;
  is_secure: number;
  is_httponly: number;
  samesite: number;
}

function deriveKey(chromePassword: string): Buffer {
  return crypto.pbkdf2Sync(chromePassword, SALT, ITERATIONS_MAC, KEY_LENGTH, 'sha1');
}

function decryptValue(encryptedValue: Buffer, key: Buffer): string {
  if (encryptedValue.length === 0) return '';

  // v10 prefix (3 bytes) indicates AES-CBC encryption on macOS
  if (encryptedValue[0] === 0x76 && encryptedValue[1] === 0x31 && encryptedValue[2] === 0x30) {
    const ciphertext = encryptedValue.subarray(3);
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV);
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf-8');
    } catch {
      return '';
    }
  }

  // Unencrypted or unknown format
  return encryptedValue.toString('utf-8');
}

function chromeDateToUnix(chromeDate: number): number {
  if (chromeDate === 0) return 0;
  // Chrome stores dates as microseconds since 1601-01-01
  const CHROME_EPOCH_OFFSET = 11644473600;
  return Math.floor(chromeDate / 1_000_000) - CHROME_EPOCH_OFFSET;
}

function sameSiteToString(value: number): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
  switch (value) {
    case -1: return 'unspecified';
    case 0: return 'no_restriction';
    case 1: return 'lax';
    case 2: return 'strict';
    default: return 'unspecified';
  }
}

export interface CookieImportResult {
  imported: number;
  failed: number;
  total: number;
}

export async function importChromeCookes(
  profilePath: string,
  onProgress?: (imported: number, total: number) => void,
): Promise<CookieImportResult> {
  mainLogger.info('ChromeCookieImporter.start', { profilePath });

  // Get Chrome Safe Storage password from macOS Keychain
  let chromePassword: string;
  try {
    const keytar = await import('keytar');
    const pw = await keytar.getPassword('Chrome Safe Storage', 'Chrome');
    if (!pw) throw new Error('Chrome Safe Storage password not found in Keychain');
    chromePassword = pw;
    mainLogger.info('ChromeCookieImporter.keychainRead.ok');
  } catch (err) {
    mainLogger.error('ChromeCookieImporter.keychainRead.failed', {
      error: (err as Error).message,
    });
    throw new Error('Could not read Chrome encryption key from Keychain. Grant access when prompted.');
  }

  const key = deriveKey(chromePassword);

  // Copy the Cookies DB to a temp location to avoid locking issues
  const cookiesDbPath = path.join(profilePath, 'Cookies');
  if (!fs.existsSync(cookiesDbPath)) {
    throw new Error(`Chrome Cookies database not found at ${cookiesDbPath}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-import-'));
  const tmpDbPath = path.join(tmpDir, 'Cookies');
  fs.copyFileSync(cookiesDbPath, tmpDbPath);

  // Also copy WAL/SHM if they exist (needed for consistent reads)
  for (const suffix of ['-wal', '-shm']) {
    const src = cookiesDbPath + suffix;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, tmpDbPath + suffix);
    }
  }

  let imported = 0;
  let failed = 0;
  let total = 0;

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(tmpDbPath, { readonly: true });

    const rows = db.prepare(
      'SELECT host_key, name, path, encrypted_value, expires_utc, is_secure, is_httponly, samesite FROM cookies'
    ).all() as RawCookie[];

    total = rows.length;
    mainLogger.info('ChromeCookieImporter.cookiesFound', { total });

    const electronSession = session.defaultSession;
    const BATCH_SIZE = 100;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (row) => {
        const value = decryptValue(row.encrypted_value, key);
        if (!value) {
          failed++;
          return;
        }

        const url = `http${row.is_secure ? 's' : ''}://${row.host_key.replace(/^\./, '')}${row.path}`;
        const expirationDate = chromeDateToUnix(row.expires_utc);

        try {
          await electronSession.cookies.set({
            url,
            name: row.name,
            value,
            domain: row.host_key,
            path: row.path,
            secure: row.is_secure === 1,
            httpOnly: row.is_httponly === 1,
            sameSite: sameSiteToString(row.samesite),
            expirationDate: expirationDate > 0 ? expirationDate : undefined,
          });
          imported++;
        } catch {
          failed++;
        }
      });

      await Promise.all(promises);
      onProgress?.(imported, total);
    }

    db.close();
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch { /* ignore cleanup errors */ }
  }

  mainLogger.info('ChromeCookieImporter.complete', { imported, failed, total });
  return { imported, failed, total };
}
