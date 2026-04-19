/**
 * Persists tab session state to userData/session.json.
 * Debounced writes on any tab state change; loaded on startup.
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const SESSION_FILE_NAME = 'session.json';
const DEBOUNCE_MS = 300;

export interface PersistedTab {
  id: string;
  url: string;
  title: string;
  pinned?: boolean;
}

export interface PersistedSession {
  version: 1;
  tabs: PersistedTab[];
  activeTabId: string | null;
}

const EMPTY_SESSION: PersistedSession = {
  version: 1,
  tabs: [],
  activeTabId: null,
};

export class SessionStore {
  private readonly filePath: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSession: PersistedSession | null = null;

  constructor(dataDir?: string) {
    this.filePath = path.join(dataDir ?? app.getPath('userData'), SESSION_FILE_NAME);
    console.log('[SessionStore] dataDir:', this.filePath);
  }

  load(): PersistedSession {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedSession;
      if (parsed.version !== 1 || !Array.isArray(parsed.tabs)) {
        console.warn('[SessionStore] Invalid session format, resetting');
        return { ...EMPTY_SESSION };
      }
      console.log(`[SessionStore] Loaded ${parsed.tabs.length} tabs from session`);
      return parsed;
    } catch {
      console.log('[SessionStore] No session file found, starting fresh');
      return { ...EMPTY_SESSION };
    }
  }

  save(session: PersistedSession): void {
    this.pendingSession = session;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.flushSync();
    }, DEBOUNCE_MS);
  }

  /** Synchronous flush — call before app quit */
  flushSync(): void {
    if (!this.pendingSession) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.pendingSession, null, 2),
        'utf-8',
      );
      console.log(
        `[SessionStore] Saved ${this.pendingSession.tabs.length} tabs to session`,
      );
    } catch (err) {
      console.error('[SessionStore] Failed to save session:', err);
    }
    this.pendingSession = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
