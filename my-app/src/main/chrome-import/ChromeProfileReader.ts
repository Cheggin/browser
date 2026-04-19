import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mainLogger } from '../logger';

export interface ChromeProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  profilePath: string;
}

const CHROME_BASE_DIRS: Record<string, string> = {
  darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
  win32: path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data'),
  linux: path.join(os.homedir(), '.config', 'google-chrome'),
};

export function getChromeBaseDir(): string | null {
  const dir = CHROME_BASE_DIRS[process.platform];
  if (!dir || !fs.existsSync(dir)) return null;
  return dir;
}

export function listChromeProfiles(): ChromeProfile[] {
  const baseDir = getChromeBaseDir();
  if (!baseDir) {
    mainLogger.info('ChromeProfileReader.listProfiles.noChromeDir');
    return [];
  }

  const localStatePath = path.join(baseDir, 'Local State');
  if (!fs.existsSync(localStatePath)) {
    mainLogger.info('ChromeProfileReader.listProfiles.noLocalState');
    return [];
  }

  let localState: Record<string, unknown>;
  try {
    localState = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
  } catch (err) {
    mainLogger.error('ChromeProfileReader.listProfiles.parseError', {
      error: (err as Error).message,
    });
    return [];
  }

  const infoCache = (localState.profile as Record<string, unknown>)?.info_cache as
    Record<string, Record<string, unknown>> | undefined;

  if (!infoCache) {
    mainLogger.info('ChromeProfileReader.listProfiles.noInfoCache');
    return [];
  }

  const profiles: ChromeProfile[] = [];

  for (const [dirName, info] of Object.entries(infoCache)) {
    const profilePath = path.join(baseDir, dirName);
    if (!fs.existsSync(profilePath)) continue;

    profiles.push({
      id: dirName,
      name: (info.name as string) ?? dirName,
      email: (info.user_name as string) ?? '',
      avatarUrl: (info.last_downloaded_gaia_picture_url_with_size as string) ?? '',
      profilePath,
    });
  }

  mainLogger.info('ChromeProfileReader.listProfiles', {
    count: profiles.length,
  });

  return profiles;
}
