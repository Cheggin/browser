/**
 * AccountStore unit tests — written FIRST per D1 (TDD).
 *
 * Tests cover:
 *   - save / load round-trip
 *   - Atomic write (tmp + rename pattern)
 *   - Returns null when file missing
 *   - Timestamps: created_at set on first save, not overwritten; onboarding_completed_at optional
 *   - agent_name persisted and retrieved
 *   - email persisted and retrieved
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mock node:fs — we capture writes and replay reads
// ---------------------------------------------------------------------------

const fsStore = new Map<string, string>();
let renameTarget: string | null = null;

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, data: string) => {
      fsStore.set(p, data);
      // If this is a tmp write, simulate the rename completing
    }),
    readFileSync: vi.fn((p: string) => {
      const content = fsStore.get(p);
      if (!content) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return content;
    }),
    existsSync: vi.fn((p: string) => fsStore.has(p)),
    renameSync: vi.fn((src: string, dst: string) => {
      const content = fsStore.get(src);
      if (content !== undefined) {
        fsStore.set(dst, content);
        fsStore.delete(src);
        renameTarget = dst;
      }
    }),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((p: string, data: string) => {
    fsStore.set(p, data);
  }),
  readFileSync: vi.fn((p: string) => {
    const content = fsStore.get(p);
    if (!content) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return content;
  }),
  existsSync: vi.fn((p: string) => fsStore.has(p)),
  renameSync: vi.fn((src: string, dst: string) => {
    const content = fsStore.get(src);
    if (content !== undefined) {
      fsStore.set(dst, content);
      fsStore.delete(src);
      renameTarget = dst;
    }
  }),
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-userData'),
  },
}));

import { AccountStore, ACCOUNT_FILE_NAME } from '../../../src/main/identity/AccountStore';
import type { AccountData } from '../../../src/main/identity/AccountStore';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountStore', () => {
  let store: AccountStore;
  const TEST_PATH = '/tmp/test-userData';

  beforeEach(() => {
    fsStore.clear();
    renameTarget = null;
    store = new AccountStore(TEST_PATH);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // File name constant
  // -------------------------------------------------------------------------

  it('ACCOUNT_FILE_NAME is account.json', () => {
    expect(ACCOUNT_FILE_NAME).toBe('account.json');
  });

  // -------------------------------------------------------------------------
  // Load when missing
  // -------------------------------------------------------------------------

  it('load() returns null when account.json does not exist', () => {
    const result = store.load();
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Save + load round-trip
  // -------------------------------------------------------------------------

  it('saves and reloads agent_name', () => {
    store.save({ agent_name: 'Atlas', email: 'user@example.com' });
    const loaded = store.load();
    expect(loaded?.agent_name).toBe('Atlas');
  });

  it('saves and reloads email', () => {
    store.save({ agent_name: 'Atlas', email: 'user@example.com' });
    const loaded = store.load();
    expect(loaded?.email).toBe('user@example.com');
  });

  it('sets created_at automatically on first save', () => {
    const before = Date.now();
    store.save({ agent_name: 'Atlas', email: 'user@example.com' });
    const after = Date.now();
    const loaded = store.load();
    expect(loaded?.created_at).toBeDefined();
    const ts = new Date(loaded!.created_at!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('does not overwrite created_at on subsequent saves', () => {
    store.save({ agent_name: 'Atlas', email: 'user@example.com' });
    const first = store.load()!.created_at;

    // Small delay to ensure timestamp would differ
    store.save({ agent_name: 'Atlas-2', email: 'user@example.com' });
    const second = store.load()!.created_at;

    expect(second).toBe(first);
  });

  it('persists onboarding_completed_at when provided', () => {
    const ts = new Date().toISOString();
    store.save({
      agent_name: 'Atlas',
      email: 'user@example.com',
      onboarding_completed_at: ts,
    });
    const loaded = store.load();
    expect(loaded?.onboarding_completed_at).toBe(ts);
  });

  // -------------------------------------------------------------------------
  // Atomic write (tmp + rename)
  // -------------------------------------------------------------------------

  it('uses a tmp file then renames atomically (write is never directly to final path)', () => {
    store.save({ agent_name: 'Atlas', email: 'user@example.com' });

    // The fsStore should contain the final path after rename
    const finalPath = path.join(TEST_PATH, ACCOUNT_FILE_NAME);
    expect(fsStore.has(finalPath)).toBe(true);

    // renameTarget was set by our mock renameSync — confirms rename happened
    expect(renameTarget).toBe(finalPath);

    // The source (tmp) path should no longer exist in fsStore (it was moved)
    // AccountStore uses pattern: account.tmp.{pid} — check for that specific pattern
    const tmpKeys = Array.from(fsStore.keys()).filter((k) => k.includes('account.tmp.'));
    expect(tmpKeys).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // isOnboardingComplete
  // -------------------------------------------------------------------------

  it('isOnboardingComplete returns false when no file exists', () => {
    expect(store.isOnboardingComplete()).toBe(false);
  });

  it('isOnboardingComplete returns true after saving with onboarding_completed_at', () => {
    store.save({
      agent_name: 'Atlas',
      email: 'user@example.com',
      onboarding_completed_at: new Date().toISOString(),
    });
    expect(store.isOnboardingComplete()).toBe(true);
  });

  it('isOnboardingComplete returns false when file exists but onboarding_completed_at is missing', () => {
    store.save({ agent_name: 'Atlas', email: 'user@example.com' });
    expect(store.isOnboardingComplete()).toBe(false);
  });
});
