import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: any[]) => any;

const handlerMap = new Map<string, Handler>();
const shellSend = vi.fn();
const settingsSend = vi.fn();

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/main/settings/SettingsWindow', () => ({
  getSettingsWindow: vi.fn(() => null),
  openSettingsWindow: vi.fn(),
}));

vi.mock('electron', () => {
  let userDataPath = '';

  return {
    app: {
      getPath: vi.fn(() => userDataPath),
      __setUserDataPath: (value: string) => {
        userDataPath = value;
      },
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => [
        { isDestroyed: () => false, webContents: { send: shellSend } },
        { isDestroyed: () => false, webContents: { send: settingsSend } },
      ]),
    },
    dialog: {},
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => {
        handlerMap.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlerMap.delete(channel);
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
    },
    session: {
      defaultSession: {
        clearStorageData: vi.fn(async () => undefined),
        clearCache: vi.fn(async () => undefined),
        clearAuthCache: vi.fn(async () => undefined),
        webRequest: {
          onBeforeSendHeaders: vi.fn(),
        },
      },
    },
  };
});

import { app } from 'electron';
import { registerSettingsHandlers, unregisterSettingsHandlers } from '../../../src/main/settings/ipc';

const appWithSetter = app as typeof app & { __setUserDataPath: (value: string) => void };

function makeTempUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'live-caption-settings-'));
}

describe('settings live-caption IPC', () => {
  let userDataDir: string;

  beforeEach(() => {
    handlerMap.clear();
    shellSend.mockReset();
    settingsSend.mockReset();
    userDataDir = makeTempUserDataDir();
    appWithSetter.__setUserDataPath(userDataDir);

    registerSettingsHandlers({
      accountStore: { load: vi.fn(() => null), save: vi.fn() } as never,
      keychainStore: { deleteToken: vi.fn() } as never,
      oauthClient: {} as never,
    });
  });

  afterEach(() => {
    unregisterSettingsHandlers();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('returns the default live-caption preferences when none are stored', async () => {
    const getLiveCaption = handlerMap.get('settings:get-live-caption');
    expect(getLiveCaption).toBeTypeOf('function');

    expect(getLiveCaption!()).toEqual({
      enabled: false,
      language: 'en-US',
    });
  });

  it('persists the live-caption patch and notifies every open window', async () => {
    const setLiveCaption = handlerMap.get('settings:set-live-caption');
    const getLiveCaption = handlerMap.get('settings:get-live-caption');

    expect(setLiveCaption).toBeTypeOf('function');
    expect(getLiveCaption).toBeTypeOf('function');

    expect(setLiveCaption!({} as never, { enabled: true, language: 'fr-FR' })).toBe(true);

    expect(getLiveCaption!()).toEqual({
      enabled: true,
      language: 'fr-FR',
    });

    expect(shellSend).toHaveBeenCalledWith('live-caption:state-changed', {
      enabled: true,
      language: 'fr-FR',
    });
    expect(settingsSend).toHaveBeenCalledWith('live-caption:state-changed', {
      enabled: true,
      language: 'fr-FR',
    });
  });
});
