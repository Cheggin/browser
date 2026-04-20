import { describe, expect, it, vi } from 'vitest';

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
import { NET_ERROR_RETRY_PREFIX } from '../../../src/main/errors/NetworkErrorController';

type FakeWebContents = {
  getURL: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
};

function makeConsoleHarness(currentUrl = 'data:text/html;charset=utf-8,error') {
  const handlers = new Map<string, (...args: any[]) => void>();
  const webContents: FakeWebContents = {
    getURL: vi.fn(() => currentUrl),
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
  };

  manager.win = { isDestroyed: () => false } as any;
  manager.createTab = vi.fn();
  manager.navigateActive = vi.fn();
  manager.safeSend = vi.fn();
  manager.updateStatusBar = vi.fn();
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
    webContents,
    consoleMessage: handlers.get('console-message') as (event: unknown, level: number, message: string) => void,
  };
}

function makeRoutingManager() {
  const manager = Object.create(TabManager.prototype) as TabManager & {
    openInternalPage: ReturnType<typeof vi.fn>;
    navControllers: Map<string, { navigate: ReturnType<typeof vi.fn> }>;
    urlMatchFn: null;
    searchUrlTemplate: null;
  };

  manager.openInternalPage = vi.fn();
  manager.navControllers = new Map([
    ['tab-1', { navigate: vi.fn() }],
  ]);
  manager.urlMatchFn = null;
  manager.searchUrlTemplate = null;

  return manager;
}

describe('TabManager chrome:// routing regression checks', () => {
  it('routes chrome://history to the history internal page', () => {
    const manager = makeRoutingManager();

    manager.navigate('tab-1', 'chrome://history');

    expect(manager.openInternalPage).toHaveBeenCalledWith('history');
  });

  it('routes chrome://about to the chrome-pages renderer path', () => {
    const manager = makeRoutingManager();

    manager.navigate('tab-1', 'chrome://about');

    expect(manager.openInternalPage).toHaveBeenCalledWith('about');
  });
});

describe('TabManager branded network error retry regression checks', () => {
  it('reloads the original URL when the branded error page emits retry', () => {
    const { consoleMessage, webContents } = makeConsoleHarness();
    const retryUrl = 'https://retry.example/path';

    consoleMessage({}, 0, `${NET_ERROR_RETRY_PREFIX}${retryUrl}`);

    expect(webContents.loadURL).toHaveBeenCalledWith(retryUrl);
  });
});
