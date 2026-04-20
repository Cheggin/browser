import { beforeEach, describe, expect, it, vi } from 'vitest';

let lastMenu: { items: Array<{ label?: string; click?: () => void; type?: string }> } | null = null;

vi.mock('electron', () => {
  class MockMenu {
    items: Array<{ label?: string; click?: () => void; type?: string }> = [];
    constructor() {
      lastMenu = this;
    }
    append(item: { label?: string; click?: () => void; type?: string }): void {
      this.items.push(item);
    }
    popup(): void {}
  }

  class MockMenuItem {
    label?: string;
    click?: () => void;
    type?: string;
    constructor(opts: { label?: string; click?: () => void; type?: string }) {
      this.label = opts.label;
      this.click = opts.click;
      this.type = opts.type;
    }
  }

  return {
    app: { isPackaged: false },
    BrowserWindow: class {},
    WebContentsView: class {},
    ipcMain: { handle: vi.fn() },
    nativeImage: { createEmpty: vi.fn() },
    dialog: {},
    Menu: MockMenu,
    MenuItem: MockMenuItem,
  };
});

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { TabManager } from '../../../src/main/tabs/TabManager';

function makeView(url = 'https://example.com') {
  return {
    webContents: {
      getURL: vi.fn(() => url),
      isAudioMuted: vi.fn(() => false),
      destroy: vi.fn(),
    },
  };
}

describe('TabManager pinned tabs and group creation', () => {
  beforeEach(() => {
    lastMenu = null;
  });

  it('blocks the standard close path for pinned tabs', () => {
    const view = makeView();
    const manager = Object.create(TabManager.prototype) as any;
    manager.tabs = new Map([['tab-1', view]]);
    manager.navControllers = new Map();
    manager.lastFindQuery = new Map();
    manager.tabOrder = ['tab-1'];
    manager.pinnedTabs = new Set(['tab-1']);
    manager.win = {
      contentView: { removeChildView: vi.fn() },
      isDestroyed: () => false,
      close: vi.fn(),
    };
    manager.captureClosedRecord = vi.fn(async () => undefined);
    manager.broadcastState = vi.fn();
    manager.saveSession = vi.fn();
    manager.broadcastTabGroups = vi.fn();
    manager.tabGroupStore = null;
    manager.activeTabId = 'tab-1';

    manager.closeTab('tab-1');

    expect(manager.win.contentView.removeChildView).not.toHaveBeenCalled();
    expect(view.webContents.destroy).not.toHaveBeenCalled();
    expect(manager.saveSession).not.toHaveBeenCalled();
  });

  it('creates a new tab group from the tab context menu action', () => {
    const view = makeView();
    const createGroup = vi.fn();
    const manager = Object.create(TabManager.prototype) as any;
    manager.tabs = new Map([['tab-1', view]]);
    manager.tabOrder = ['tab-1'];
    manager.pinnedTabs = new Set();
    manager.win = {};
    manager.reload = vi.fn();
    manager.duplicateTab = vi.fn();
    manager.pinTab = vi.fn();
    manager.unpinTab = vi.fn();
    manager.toggleMuteTab = vi.fn();
    manager.closeTab = vi.fn();
    manager.muteSite = vi.fn();
    manager.unmuteSite = vi.fn();
    manager.broadcastTabGroups = vi.fn();
    manager.mutedSitesStore = { isMutedOrigin: vi.fn(() => false) };
    manager.closedStack = [];
    manager.reopenLastClosed = vi.fn();
    manager.tabGroupStore = {
      getGroupForTab: vi.fn(() => undefined),
      createGroup,
    };

    manager.showTabContextMenu('tab-1');

    const addToNewGroup = lastMenu?.items.find((item) => item.label === 'Add to New Group');
    expect(addToNewGroup).toBeTruthy();

    addToNewGroup?.click?.();

    expect(createGroup).toHaveBeenCalledWith(
      'New group',
      expect.any(String),
      ['tab-1'],
    );
    expect(manager.broadcastTabGroups).toHaveBeenCalledTimes(1);
  });

  it('routes pin, duplicate, close-others, and close-right through the tab context menu', () => {
    const view = makeView();
    const manager = Object.create(TabManager.prototype) as any;
    manager.tabs = new Map([
      ['tab-1', view],
      ['tab-2', makeView('https://example.com/two')],
      ['tab-3', makeView('https://example.com/three')],
    ]);
    manager.tabOrder = ['tab-1', 'tab-2', 'tab-3'];
    manager.pinnedTabs = new Set();
    manager.win = {};
    manager.reload = vi.fn();
    manager.duplicateTab = vi.fn();
    manager.pinTab = vi.fn();
    manager.unpinTab = vi.fn();
    manager.toggleMuteTab = vi.fn();
    manager.closeTab = vi.fn();
    manager.closeOtherTabs = vi.fn();
    manager.closeTabsToRight = vi.fn();
    manager.muteSite = vi.fn();
    manager.unmuteSite = vi.fn();
    manager.broadcastTabGroups = vi.fn();
    manager.mutedSitesStore = { isMutedOrigin: vi.fn(() => false) };
    manager.closedStack = [];
    manager.reopenLastClosed = vi.fn();
    manager.safeSend = vi.fn();
    manager.tabGroupStore = null;

    manager.showTabContextMenu('tab-1');

    const click = (label: string) => {
      const item = lastMenu?.items.find((entry) => entry.label === label);
      expect(item).toBeTruthy();
      item?.click?.();
    };

    click('Pin Tab');
    click('Duplicate');
    click('Close Other Tabs');
    click('Close Tabs to the Right');

    expect(manager.pinTab).toHaveBeenCalledWith('tab-1');
    expect(manager.duplicateTab).toHaveBeenCalledWith('tab-1');
    expect(manager.closeOtherTabs).toHaveBeenCalledWith('tab-1');
    expect(manager.closeTabsToRight).toHaveBeenCalledWith('tab-1');
  });
});
