/**
 * ProfileContext — resolves per-profile data directories and session partitions.
 *
 * Each profile stores its data (bookmarks, history, passwords, session, etc.)
 * in an isolated subdirectory: <userData>/profiles/<profileId>/
 * The 'default' profile uses the root userData dir for backward compatibility.
 *
 * Cookies, localStorage, and cache are isolated via Electron session partitions:
 *   session.fromPartition('persist:profile-<profileId>')
 */

import { app, session as electronSession } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { mainLogger } from '../logger';

const PROFILES_DIR = 'profiles';

export function getProfileDataDir(profileId: string): string {
  if (profileId === 'default') {
    return app.getPath('userData');
  }
  const dir = path.join(app.getPath('userData'), PROFILES_DIR, profileId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getProfilePartitionName(profileId: string | null): string {
  if (!profileId || profileId === 'default') {
    return '';
  }
  return `persist:profile-${profileId}`;
}

export function getProfileSession(profileId: string | null): Electron.Session {
  const partitionName = getProfilePartitionName(profileId);
  if (!partitionName) {
    return electronSession.defaultSession;
  }
  return electronSession.fromPartition(partitionName);
}

// ---------------------------------------------------------------------------
// Guest mode — ephemeral session with no persistence
// ---------------------------------------------------------------------------

let guestCounter = 0;

export function createGuestPartitionName(): string {
  guestCounter += 1;
  return `guest-${Date.now()}-${guestCounter}`;
}

export function getGuestSession(partitionName: string): Electron.Session {
  return electronSession.fromPartition(partitionName);
}

export async function clearGuestSession(partitionName: string): Promise<void> {
  mainLogger.info('ProfileContext.clearGuestSession', { partitionName });
  try {
    const sess = electronSession.fromPartition(partitionName);
    await sess.clearStorageData();
    await sess.clearCache();
    await sess.clearAuthCache();
    mainLogger.info('ProfileContext.clearGuestSession.ok', { partitionName });
  } catch (err) {
    mainLogger.error('ProfileContext.clearGuestSession.failed', {
      partitionName,
      error: (err as Error).message,
    });
  }
}
