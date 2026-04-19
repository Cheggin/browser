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
  manager.getActiveWebContents = () => webContents;

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
});
