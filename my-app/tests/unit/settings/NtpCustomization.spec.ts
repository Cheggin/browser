import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: any[]) => any;

const ntpHandlers = new Map<string, Handler>();

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
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
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => {
        ntpHandlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        ntpHandlers.delete(channel);
      }),
    },
  };
});

import { app } from 'electron';
import { NtpCustomizationStore } from '../../../src/main/ntp/NtpCustomizationStore';
import { registerNtpHandlers, unregisterNtpHandlers } from '../../../src/main/ntp/ipc';

const appWithSetter = app as typeof app & { __setUserDataPath: (value: string) => void };

function makeTempUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ntp-customization-'));
}

describe('NTP customization coverage', () => {
  let userDataDir: string;

  beforeEach(() => {
    ntpHandlers.clear();
    userDataDir = makeTempUserDataDir();
    appWithSetter.__setUserDataPath(userDataDir);
  });

  afterEach(() => {
    unregisterNtpHandlers();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('persists wallpaper and color/theme customization through the store', () => {
    const store = new NtpCustomizationStore();

    const updated = store.save({
      backgroundType: 'uploaded-image',
      backgroundImageDataUrl: 'data:image/png;base64,abc123',
      accentColor: '#ff0000',
      colorScheme: 'dark',
    });

    expect(updated.backgroundType).toBe('uploaded-image');
    expect(updated.backgroundImageDataUrl).toContain('data:image/png;base64');
    expect(updated.accentColor).toBe('#ff0000');
    expect(updated.colorScheme).toBe('dark');

    const reloaded = new NtpCustomizationStore().load();
    expect(reloaded.backgroundType).toBe('uploaded-image');
    expect(reloaded.backgroundImageDataUrl).toContain('data:image/png;base64');
    expect(reloaded.accentColor).toBe('#ff0000');
    expect(reloaded.colorScheme).toBe('dark');
  });

  it('adds, edits, and deletes custom shortcuts through the IPC handlers', async () => {
    const store = new NtpCustomizationStore();
    const notifyShell = vi.fn();
    const notifyNewTab = vi.fn();
    registerNtpHandlers({ store, notifyShell, notifyNewTab });

    const addShortcut = ntpHandlers.get('ntp:add-shortcut');
    const editShortcut = ntpHandlers.get('ntp:edit-shortcut');
    const deleteShortcut = ntpHandlers.get('ntp:delete-shortcut');
    const getCustomization = ntpHandlers.get('ntp:get-customization');

    expect(addShortcut).toBeTypeOf('function');
    expect(editShortcut).toBeTypeOf('function');
    expect(deleteShortcut).toBeTypeOf('function');
    expect(getCustomization).toBeTypeOf('function');

    const afterAdd = addShortcut!({} as never, {
      name: 'Docs',
      url: 'https://docs.example.com',
    }) as ReturnType<typeof store.load>;

    expect(afterAdd.customShortcuts).toHaveLength(1);
    const shortcutId = afterAdd.customShortcuts[0].id;

    const afterEdit = editShortcut!({} as never, {
      id: shortcutId,
      name: 'Docs Home',
      url: 'https://docs.example.com/home',
    }) as ReturnType<typeof store.load>;

    expect(afterEdit.customShortcuts).toEqual([
      {
        id: shortcutId,
        name: 'Docs Home',
        url: 'https://docs.example.com/home',
      },
    ]);

    const afterDelete = deleteShortcut!({} as never, shortcutId) as ReturnType<typeof store.load>;
    expect(afterDelete.customShortcuts).toEqual([]);

    expect(getCustomization!()).toEqual(store.load());
    expect(notifyShell).toHaveBeenCalledTimes(3);
    expect(notifyNewTab).toHaveBeenCalledTimes(3);
  });

  it('resets customization back to the defaults', () => {
    const store = new NtpCustomizationStore();
    store.save({
      shortcutMode: 'custom',
      customShortcuts: [{ id: 'x', name: 'Docs', url: 'https://docs.example.com' }],
      backgroundType: 'solid-color',
      backgroundColor: '#123456',
      accentColor: '#abcdef',
    });

    const reset = store.reset();

    expect(reset).toMatchObject({
      backgroundType: 'default',
      backgroundColor: '#202124',
      accentColor: '#6D8196',
      colorScheme: 'system',
      shortcutMode: 'most-visited',
      customShortcuts: [],
    });
  });
});
