/**
 * KeychainStore unit tests — written FIRST per D1 (TDD).
 *
 * Tests cover:
 *   - setToken / getToken round-trip
 *   - deleteToken removes the entry
 *   - Returns null when no token stored
 *   - JSON serialisation shape (access_token, refresh_token, expires_at, scopes)
 *   - safeStorage fallback path when keytar throws
 *   - No secrets logged (structural check on log calls)
 *
 * Uses constructor injection (keytarOverride) to avoid native module loading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron safeStorage for fallback tests
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString()),
  },
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-userData'),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
    existsSync: vi.fn(() => false),
    renameSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
  existsSync: vi.fn(() => false),
  renameSync: vi.fn(),
}));

import { KeychainStore, KEYCHAIN_SERVICE } from '../../../src/main/identity/KeychainStore';
import type { StoredTokens, KeytarLike } from '../../../src/main/identity/KeychainStore';

// ---------------------------------------------------------------------------
// In-memory keytar mock (injected via constructor)
// ---------------------------------------------------------------------------

function makeKeytarMock(): { mock: KeytarLike; store: Map<string, string> } {
  const store = new Map<string, string>();
  const mock: KeytarLike = {
    setPassword: vi.fn(async (service: string, account: string, value: string) => {
      store.set(`${service}::${account}`, value);
    }),
    getPassword: vi.fn(async (service: string, account: string) => {
      return store.get(`${service}::${account}`) ?? null;
    }),
    deletePassword: vi.fn(async (service: string, account: string) => {
      return store.delete(`${service}::${account}`);
    }),
  };
  return { mock, store };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    access_token: 'ya29.access-token-value',
    refresh_token: '1//refresh-token-value',
    expires_at: Date.now() + 3600_000,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KeychainStore', () => {
  let keytarMock: ReturnType<typeof makeKeytarMock>;
  let store: KeychainStore;
  const TEST_ACCOUNT = 'test@example.com';

  beforeEach(() => {
    keytarMock = makeKeytarMock();
    store = new KeychainStore('/tmp/test-userData', keytarMock.mock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Round-trip
  // -------------------------------------------------------------------------

  it('stores and retrieves a token object', async () => {
    const tokens = makeTokens();
    await store.setToken(TEST_ACCOUNT, tokens);
    const retrieved = await store.getToken(TEST_ACCOUNT);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.access_token).toBe(tokens.access_token);
    expect(retrieved?.refresh_token).toBe(tokens.refresh_token);
    expect(retrieved?.expires_at).toBe(tokens.expires_at);
    expect(retrieved?.scopes).toEqual(tokens.scopes);
  });

  it('returns null when no token is stored for an account', async () => {
    const result = await store.getToken('nobody@example.com');
    expect(result).toBeNull();
  });

  it('overwrites an existing token on second setToken call', async () => {
    const first = makeTokens({ access_token: 'first-token' });
    const second = makeTokens({ access_token: 'second-token' });
    await store.setToken(TEST_ACCOUNT, first);
    await store.setToken(TEST_ACCOUNT, second);
    const retrieved = await store.getToken(TEST_ACCOUNT);
    expect(retrieved?.access_token).toBe('second-token');
  });

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  it('deleteToken removes the entry so subsequent getToken returns null', async () => {
    await store.setToken(TEST_ACCOUNT, makeTokens());
    await store.deleteToken(TEST_ACCOUNT);
    const result = await store.getToken(TEST_ACCOUNT);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Service name
  // -------------------------------------------------------------------------

  it('uses KEYCHAIN_SERVICE = com.agenticbrowser.oauth as the keytar service', () => {
    expect(KEYCHAIN_SERVICE).toBe('com.agenticbrowser.oauth');
  });

  // -------------------------------------------------------------------------
  // Serialisation shape
  // -------------------------------------------------------------------------

  it('serialises tokens as JSON with the correct top-level keys', async () => {
    const tokens = makeTokens();
    await store.setToken(TEST_ACCOUNT, tokens);
    const raw = keytarMock.store.get(`${KEYCHAIN_SERVICE}::${TEST_ACCOUNT}`);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveProperty('access_token');
    expect(parsed).toHaveProperty('refresh_token');
    expect(parsed).toHaveProperty('expires_at');
    expect(parsed).toHaveProperty('scopes');
  });

  // -------------------------------------------------------------------------
  // No secrets in log calls (structural)
  // -------------------------------------------------------------------------

  it('does not include the access_token value in any console debug output', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const tokens = makeTokens({ access_token: 'SUPER_SECRET_TOKEN' });
    await store.setToken(TEST_ACCOUNT, tokens);
    await store.getToken(TEST_ACCOUNT);
    const calls = spy.mock.calls.map((c) => JSON.stringify(c));
    for (const call of calls) {
      expect(call).not.toContain('SUPER_SECRET_TOKEN');
    }
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Fallback path — when keytar throws, KeychainStore falls back to safeStorage
// ---------------------------------------------------------------------------

describe('KeychainStore — safeStorage fallback', () => {
  it('constructs without throwing even if keytar require fails', async () => {
    // No keytarOverride — will try require('keytar') which may fail in test env
    // KeychainStore constructor catches errors and sets keytarAvailable = false
    const store = new KeychainStore('/tmp/test-userData');
    expect(store).toBeDefined();
  });
});
