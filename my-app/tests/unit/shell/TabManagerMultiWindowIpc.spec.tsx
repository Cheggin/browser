import { beforeEach, describe, expect, it, vi } from 'vitest';

const { removeHandler, fromWebContents, getFocusedWindow } = vi.hoisted(() => ({
  removeHandler: vi.fn(),
  fromWebContents: vi.fn(),
  getFocusedWindow: vi.fn(),
}));

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: {
    fromWebContents,
    getFocusedWindow,
  },
  WebContentsView: class {},
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    }),
    removeHandler,
  },
  nativeImage: { createEmpty: vi.fn() },
  dialog: {},
  Menu: class {},
  MenuItem: class {},
}));

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { TabManager } from '../../../src/main/tabs/TabManager';

describe('TabManager multi-window IPC routing', () => {
  beforeEach(() => {
    handlers.clear();
    removeHandler.mockReset();
    removeHandler.mockImplementation((channel: string) => {
      handlers.delete(channel);
    });
    fromWebContents.mockReset();
    getFocusedWindow.mockReset();
    (TabManager as any).instances.clear();
    (TabManager as any).ipcHandlersRegistered = false;
  });

  it('registers shared IPC handlers once and routes tabs:create to the sender window manager', async () => {
    const senderA = { id: 'sender-a' };
    const senderB = { id: 'sender-b' };
    const managerA = Object.create(TabManager.prototype) as any;
    const managerB = Object.create(TabManager.prototype) as any;
    managerA.win = { id: 1, webContents: { session: { cookies: { get: vi.fn() } } } };
    managerB.win = { id: 2, webContents: { session: { cookies: { get: vi.fn() } } } };
    managerA.createTab = vi.fn(() => 'tab-a');
    managerB.createTab = vi.fn(() => 'tab-b');

    (TabManager as any).instances.set(1, managerA);
    (TabManager as any).instances.set(2, managerB);

    fromWebContents.mockImplementation((sender) => {
      if (sender === senderA) return { id: 1 };
      if (sender === senderB) return { id: 2 };
      return null;
    });

    (managerA as any).registerIpcHandlers();
    (managerB as any).registerIpcHandlers();

    expect(handlers.has('tabs:create')).toBe(true);
    const createHandler = handlers.get('tabs:create')!;

    const result = await createHandler({ sender: senderB }, 'https://second.example');

    expect(managerA.createTab).not.toHaveBeenCalled();
    expect(managerB.createTab).toHaveBeenCalledWith('https://second.example');
    expect(result).toBe('tab-b');
  });

  it('keeps shared IPC handlers registered until the last manager is destroyed', () => {
    const managerA = Object.create(TabManager.prototype) as any;
    const managerB = Object.create(TabManager.prototype) as any;
    managerA.win = { id: 1 };
    managerB.win = { id: 2 };

    (TabManager as any).instances.set(1, managerA);
    (TabManager as any).instances.set(2, managerB);
    (managerA as any).registerIpcHandlers();

    managerA.destroy();
    expect(removeHandler).not.toHaveBeenCalled();

    managerB.destroy();
    expect(removeHandler).toHaveBeenCalledWith('tabs:create');
    expect((TabManager as any).ipcHandlersRegistered).toBe(false);
  });
});
