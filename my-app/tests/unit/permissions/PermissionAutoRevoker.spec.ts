import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { PermissionAutoRevoker } from '../../../src/main/permissions/PermissionAutoRevoker';

describe('PermissionAutoRevoker', () => {
  it('surfaces inactive allow-grants as revoke candidates and supports opt-out', () => {
    const now = Date.now();
    const store = {
      getAllRecords: vi.fn(() => [
        {
          origin: 'https://notify.example',
          permissionType: 'notifications',
          state: 'allow',
          updatedAt: now - 1000,
        },
        {
          origin: 'https://camera.example',
          permissionType: 'camera',
          state: 'allow',
          updatedAt: now - 2000,
        },
      ]),
    };
    const historyStore = {
      getAll: vi.fn(() => [
        {
          url: 'https://camera.example/recent',
          visitTime: now,
        },
      ]),
    };

    const revoker = new PermissionAutoRevoker({
      store: store as never,
      historyStore: historyStore as never,
    });

    const scan = revoker.scan();
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0]).toMatchObject({
      origin: 'https://notify.example',
      permissionType: 'notifications',
      lastVisit: null,
    });

    revoker.optOut('https://notify.example', 'notifications');
    expect(revoker.scan().candidates).toEqual([]);
  });

  it('applies revocations only to currently-allowed permissions', () => {
    const setSitePermission = vi.fn();
    const store = {
      getAllRecords: vi.fn(() => []),
      getSitePermission: vi
        .fn()
        .mockImplementation((origin: string, permissionType: string) =>
          origin === 'https://deny.example' && permissionType === 'notifications' ? 'deny' : 'allow',
        ),
      setSitePermission,
    };
    const historyStore = {
      getAll: vi.fn(() => []),
    };

    const revoker = new PermissionAutoRevoker({
      store: store as never,
      historyStore: historyStore as never,
    });

    const revoked = revoker.applyRevoke([
      { origin: 'https://allow.example', permissionType: 'notifications' },
      { origin: 'https://deny.example', permissionType: 'notifications' },
    ]);

    expect(revoked).toBe(1);
    expect(setSitePermission).toHaveBeenCalledWith(
      'https://allow.example',
      'notifications',
      'deny',
    );
  });
});
