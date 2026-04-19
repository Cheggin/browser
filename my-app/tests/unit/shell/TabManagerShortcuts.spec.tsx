import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { TabManager } from '../../../src/main/tabs/TabManager';

type FakeWebContents = {
  executeJavaScript: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  getURL: ReturnType<typeof vi.fn>;
  openDevTools: ReturnType<typeof vi.fn>;
  isDevToolsOpened: ReturnType<typeof vi.fn>;
  closeDevTools: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  print: ReturnType<typeof vi.fn>;
  getTitle: ReturnType<typeof vi.fn>;
  id: number;
  devToolsWebContents?: {
    focus: ReturnType<typeof vi.fn>;
    executeJavaScript: ReturnType<typeof vi.fn>;
  };
};

function makeManager(selection = 'selected text'): TabManager {
  const executeJavaScript = vi.fn(async (script: string) => {
    if (script.includes('window.getSelection')) {
      return selection;
    }
    return undefined;
  });

  const webContents: FakeWebContents = {
    executeJavaScript,
    stop: vi.fn(),
    getURL: vi.fn(() => 'https://example.com/current'),
    openDevTools: vi.fn(),
    isDevToolsOpened: vi.fn(() => false),
    closeDevTools: vi.fn(),
    once: vi.fn(),
    print: vi.fn(),
    getTitle: vi.fn(() => 'Example Title'),
    id: 42,
  };

  const manager = Object.create(TabManager.prototype) as TabManager & {
    activeTabId: string | null;
    tabs: Map<string, { webContents: FakeWebContents }>;
    lastFindQuery: Map<string, string>;
    safeSend: ReturnType<typeof vi.fn>;
    caretBrowsingEnabled: boolean;
    getActiveWebContents: () => FakeWebContents | null;
  };

  manager.activeTabId = 'tab-1';
  manager.tabs = new Map([['tab-1', { webContents }]]);
  (manager as any).navControllers = new Map([
    [
      'tab-1',
      {
        goBack: vi.fn(),
        goForward: vi.fn(),
      },
    ],
  ]);
  manager.lastFindQuery = new Map();
  manager.safeSend = vi.fn();
  manager.caretBrowsingEnabled = false;
  (manager as any).devToolsDockMode = 'right';
  manager.getActiveWebContents = () => webContents;
  (manager as any).createTab = vi.fn();

  return manager;
}

describe('TabManager shortcut helpers', () => {
  it('uses the current selection as the find query (Cmd+E path)', async () => {
    const manager = makeManager('Find me');

    await manager.useSelectionForFind();

    expect(manager.lastFindQuery.get('tab-1')).toBe('Find me');
    expect(manager.safeSend).toHaveBeenCalledWith('find-open', { lastQuery: 'Find me' });
  });

  it('toggles caret browsing and notifies the renderer (F7 path)', () => {
    const manager = makeManager();
    const wc = manager.getActiveWebContents()!;

    manager.toggleCaretBrowsing();
    expect(manager.isCaretBrowsingEnabled()).toBe(true);
    expect(wc.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('window.getSelection().modify'),
      true,
    );
    expect(manager.safeSend).toHaveBeenCalledWith('caret-browsing-changed', { enabled: true });

    manager.toggleCaretBrowsing();
    expect(manager.isCaretBrowsingEnabled()).toBe(false);
    expect(wc.executeJavaScript).toHaveBeenCalledWith(
      'window.getSelection().removeAllRanges();',
      true,
    );
    expect(manager.safeSend).toHaveBeenLastCalledWith('caret-browsing-changed', { enabled: false });
  });

  it('scrolls the active tab to the top', () => {
    const manager = makeManager();
    const wc = manager.getActiveWebContents()!;

    manager.scrollToTopActive();

    expect(wc.executeJavaScript).toHaveBeenCalledWith('window.scrollTo(0, 0)', true);
  });

  it('scrolls the active tab to the bottom', () => {
    const manager = makeManager();
    const wc = manager.getActiveWebContents()!;

    manager.scrollToBottomActive();

    expect(wc.executeJavaScript).toHaveBeenCalledWith(
      'window.scrollTo(0, document.body.scrollHeight)',
      true,
    );
  });

  it('navigates history through the active tab controller', () => {
    const manager = makeManager() as TabManager & {
      navControllers: Map<string, { goBack: ReturnType<typeof vi.fn>; goForward: ReturnType<typeof vi.fn> }>;
    };
    const nav = manager.navControllers.get('tab-1')!;

    manager.goBackActive();
    manager.goForwardActive();

    expect(nav.goBack).toHaveBeenCalledTimes(1);
    expect(nav.goForward).toHaveBeenCalledTimes(1);
  });

  it('relayouts when the side-panel width changes', () => {
    const manager = makeManager() as TabManager & {
      relayout: ReturnType<typeof vi.fn>;
      sidePanelWidth: number;
    };
    manager.relayout = vi.fn();
    manager.sidePanelWidth = 0;

    manager.setSidePanelWidth(320);
    expect(manager.sidePanelWidth).toBe(320);
    expect(manager.relayout).toHaveBeenCalledTimes(1);

    manager.setSidePanelWidth(320);
    expect(manager.relayout).toHaveBeenCalledTimes(1);

    manager.setSidePanelWidth(999);
    expect(manager.sidePanelWidth).toBe(600);
    expect(manager.relayout).toHaveBeenCalledTimes(2);
  });

  it('opens a view-source tab for the active page', () => {
    const manager = makeManager() as TabManager & { createTab: ReturnType<typeof vi.fn> };

    manager.openViewSourceForActive();

    expect(manager.createTab).toHaveBeenCalledWith('view-source:https://example.com/current');
  });

  it('stops the active tab loading', () => {
    const manager = makeManager();
    const wc = manager.getActiveWebContents()!;

    manager.stopActive();

    expect(wc.stop).toHaveBeenCalledTimes(1);
  });

  it('duplicates the active tab URL into a new tab', () => {
    const manager = makeManager() as TabManager & { createTab: ReturnType<typeof vi.fn> };

    manager.duplicateActiveTab();

    expect(manager.createTab).toHaveBeenCalledWith('https://example.com/current');
  });

  it('opens and toggles DevTools for the active tab', () => {
    const manager = makeManager();
    const wc = manager.getActiveWebContents()!;

    manager.openDevToolsForActive();
    expect(wc.openDevTools).toHaveBeenCalledWith({ mode: 'right' });

    manager.toggleDevToolsForActive();
    expect(wc.openDevTools).toHaveBeenCalledTimes(2);

    wc.isDevToolsOpened.mockReturnValueOnce(true);
    manager.toggleDevToolsForActive();
    expect(wc.closeDevTools).toHaveBeenCalledTimes(1);
  });

  it('returns print-preview info for the active tab', () => {
    const manager = makeManager();

    expect(manager.getActiveTabPrintInfo()).toEqual({
      webContentsId: 42,
      title: 'Example Title',
      url: 'https://example.com/current',
    });
  });
});
