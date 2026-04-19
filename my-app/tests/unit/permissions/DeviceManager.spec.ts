import { beforeEach, describe, expect, it, vi } from 'vitest';

type SessionHandler = (...args: any[]) => void;

const sessionHandlers = new Map<string, SessionHandler>();
const shellSend = vi.fn();

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      on: vi.fn((event: string, handler: SessionHandler) => {
        sessionHandlers.set(event, handler);
      }),
      setDevicePermissionHandler: vi.fn(),
    },
  },
}));

import { DeviceManager } from '../../../src/main/devices/DeviceManager';

function makeManager() {
  const store = {
    isGranted: vi.fn(() => false),
    revoke: vi.fn(),
    grant: vi.fn(),
  };

  const shellWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: shellSend,
    },
  };

  const manager = new DeviceManager({
    store: store as never,
    getShellWindow: () => shellWindow as never,
  });

  return { manager, store };
}

describe('DeviceManager chooser coverage', () => {
  beforeEach(() => {
    sessionHandlers.clear();
    shellSend.mockReset();
  });

  it('shows picker requests for USB, HID, and Serial devices when not auto-granted', () => {
    const { store } = makeManager();

    const preventDefault = vi.fn();
    const callback = vi.fn();

    sessionHandlers.get('select-usb-device')!(
      { preventDefault },
      {
        frame: { url: 'https://usb.example/path' },
        deviceList: [{ deviceId: 'usb-1', productName: 'USB Device', vendorId: 1, productId: 2 }],
      },
      callback,
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(shellSend).toHaveBeenCalledWith(
      'device-picker-request',
      expect.objectContaining({
        apiType: 'usb',
        origin: 'https://usb.example',
        devices: [expect.objectContaining({ deviceId: 'usb-1', name: 'USB Device' })],
      }),
    );

    sessionHandlers.get('select-hid-device')!(
      { preventDefault },
      {
        frame: { url: 'https://hid.example/page' },
        deviceList: [{ deviceId: 'hid-1', name: 'HID Device', vendorId: 3, productId: 4 }],
      },
      callback,
    );

    expect(shellSend).toHaveBeenLastCalledWith(
      'device-picker-request',
      expect.objectContaining({
        apiType: 'hid',
        origin: 'https://hid.example',
      }),
    );

    sessionHandlers.get('select-serial-port')!(
      { preventDefault },
      [{ portId: 'serial-1', displayName: 'Serial Device', vendorId: '0x01', productId: '0x02' }],
      { getURL: () => 'https://serial.example/page' },
      callback,
    );

    expect(shellSend).toHaveBeenLastCalledWith(
      'device-picker-request',
      expect.objectContaining({
        apiType: 'serial',
        origin: 'https://serial.example',
      }),
    );

    expect(store.isGranted).toHaveBeenCalled();
  });

  it('auto-grants previously allowed devices and never opens a picker', () => {
    const { store } = makeManager();
    store.isGranted.mockReturnValue(true);

    const callback = vi.fn();
    sessionHandlers.get('select-usb-device')!(
      { preventDefault: vi.fn() },
      {
        frame: { url: 'https://usb.example/path' },
        deviceList: [{ deviceId: 'usb-1', productName: 'USB Device', vendorId: 1, productId: 2 }],
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith('usb-1');
    expect(shellSend).not.toHaveBeenCalled();
  });

  it('shows a Bluetooth picker request and persists the chosen grant', () => {
    const { manager, store } = makeManager();
    const callback = vi.fn();

    const webContents: any = {
      getURL: () => 'https://bluetooth.example/page',
      on: vi.fn((event: string, handler: SessionHandler) => {
        if (event === 'select-bluetooth-device') {
          webContents._handler = handler;
        }
      }),
    };

    manager.attachToWebContents(webContents);

    webContents._handler(
      { preventDefault: vi.fn() },
      [{ deviceId: 'bt-1', deviceName: 'Speaker' }],
      callback,
    );

    expect(shellSend).toHaveBeenCalledWith(
      'device-picker-request',
      expect.objectContaining({
        apiType: 'bluetooth',
        origin: 'https://bluetooth.example',
        devices: [expect.objectContaining({ deviceId: 'bt-1', name: 'Speaker' })],
      }),
    );

    const request = shellSend.mock.calls.at(-1)?.[1];
    expect(request?.id).toBeTypeOf('string');

    manager.handleResponse(request.id, 'bt-1');
    expect(store.grant).toHaveBeenCalledWith({
      apiType: 'bluetooth',
      origin: 'https://bluetooth.example',
      deviceId: 'bt-1',
      name: 'Speaker',
      vendorId: undefined,
      productId: undefined,
    });
    expect(callback).toHaveBeenCalledWith('bt-1');
  });
});
