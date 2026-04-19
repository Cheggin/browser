import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: any[]) => any;

const handlers = new Map<string, Handler>();

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  },
}));

import { registerDeviceHandlers, unregisterDeviceHandlers } from '../../../src/main/devices/ipc';

describe('device IPC coverage', () => {
  beforeEach(() => {
    handlers.clear();
  });

  afterEach(() => {
    unregisterDeviceHandlers();
  });

  it('lists and revokes granted devices through the store/manager seam', async () => {
    const store = {
      getAll: vi.fn(() => [{ apiType: 'usb', origin: 'https://device.example', deviceId: 'usb-1' }]),
      getForApi: vi.fn((apiType: string) => [{ apiType, origin: 'https://device.example', deviceId: 'dev-1' }]),
      revoke: vi.fn(() => true),
      revokeForOrigin: vi.fn(),
      revokeAll: vi.fn(),
    };
    const manager = {
      handleResponse: vi.fn(),
      dismissPicker: vi.fn(),
    };

    registerDeviceHandlers({
      store: store as never,
      manager: manager as never,
    });

    expect(handlers.get('devices:get-all')!()).toEqual([
      { apiType: 'usb', origin: 'https://device.example', deviceId: 'usb-1' },
    ]);
    expect(handlers.get('devices:get-for-api')!({} as never, 'serial')).toEqual([
      { apiType: 'serial', origin: 'https://device.example', deviceId: 'dev-1' },
    ]);
    expect(handlers.get('devices:revoke')!({} as never, 'usb', 'https://device.example', 'usb-1')).toBe(true);

    handlers.get('devices:revoke-origin')!({} as never, 'https://device.example');
    handlers.get('devices:revoke-all')!();
    handlers.get('device-picker:respond')!({} as never, 'picker-1', 'usb-1');
    handlers.get('device-picker:dismiss')!({} as never, 'picker-1');

    expect(store.revokeForOrigin).toHaveBeenCalledWith('https://device.example');
    expect(store.revokeAll).toHaveBeenCalledTimes(1);
    expect(manager.handleResponse).toHaveBeenCalledWith('picker-1', 'usb-1');
    expect(manager.dismissPicker).toHaveBeenCalledWith('picker-1');
  });
});
