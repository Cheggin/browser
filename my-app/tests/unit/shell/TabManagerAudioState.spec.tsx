import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/main/contextMenu/ContextMenuController', () => ({
  attachContextMenu: vi.fn(),
}));

import { TabManager } from '../../../src/main/tabs/TabManager';

type FakeWebContents = {
  getURL: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
};

function makeHarness() {
  const handlers = new Map<string, (...args: any[]) => void>();
  const webContents: FakeWebContents = {
    getURL: vi.fn(() => 'https://example.com'),
    loadURL: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
      return undefined;
    }),
  };

  const manager = Object.create(TabManager.prototype) as TabManager & {
    win: object;
    createTab: ReturnType<typeof vi.fn>;
    navigateActive: ReturnType<typeof vi.fn>;
    safeSend: ReturnType<typeof vi.fn>;
    updateStatusBar: ReturnType<typeof vi.fn>;
    shellView: { webContents: { isDestroyed: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } };
    sendTabUpdate: ReturnType<typeof vi.fn>;
    broadcastState: ReturnType<typeof vi.fn>;
  };

  manager.win = { isDestroyed: () => false } as any;
  manager.createTab = vi.fn();
  manager.navigateActive = vi.fn();
  manager.safeSend = vi.fn();
  manager.updateStatusBar = vi.fn();
  manager.sendTabUpdate = vi.fn();
  manager.broadcastState = vi.fn();
  manager.shellView = {
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    },
  } as any;
  (manager as any).zoomStore = { setZoomForUrl: vi.fn() };
  (manager as any).passwordStore = null;
  (manager as any).activeTabId = 'tab-1';

  (manager as any).attachViewEvents('tab-1', { webContents } as any);

  return {
    manager,
    audioOutputChanged: handlers.get('audio-output-device-changed') as () => void,
  };
}

describe('TabManager audio state updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('broadcasts tab state when audio output changes', () => {
    const { manager, audioOutputChanged } = makeHarness();

    audioOutputChanged();

    expect(manager.sendTabUpdate).toHaveBeenCalledWith('tab-1');
    expect(manager.broadcastState).toHaveBeenCalledTimes(1);
  });
});
