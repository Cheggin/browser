import { beforeEach, describe, expect, it, vi } from 'vitest';

const popupSpy = vi.fn();
let lastMenu: { items: Array<any> } | null = null;

vi.mock('electron', () => {
  class MockMenu {
    items: Array<any> = [];
    constructor() {
      lastMenu = this;
    }
    append(item: any): void {
      this.items.push(item);
    }
    popup(opts?: unknown): void {
      popupSpy(opts);
    }
  }

  class MockMenuItem {
    label: string;
    click?: () => void;
    constructor(opts: { label: string; click?: () => void }) {
      this.label = opts.label;
      this.click = opts.click;
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

function makeManager(activeIndex: number, entries: Array<{ title: string; url: string }>) {
  const nav = {
    getAllEntries: vi.fn(() => entries),
    getActiveIndex: vi.fn(() => activeIndex),
    goToIndex: vi.fn(),
  };

  const manager = Object.create(TabManager.prototype) as TabManager & {
    navControllers: Map<string, typeof nav>;
    win: object;
    sendTabUpdate: ReturnType<typeof vi.fn>;
  };

  manager.navControllers = new Map([['tab-1', nav]]);
  manager.win = {};
  manager.sendTabUpdate = vi.fn();

  return { manager, nav };
}

describe('TabManager history menus', () => {
  beforeEach(() => {
    popupSpy.mockReset();
    lastMenu = null;
  });

  it('builds a back-history menu nearest-first and navigates when a row is chosen', () => {
    const { manager, nav } = makeManager(2, [
      { title: 'Oldest', url: 'https://example.com/oldest' },
      { title: 'Middle', url: 'https://example.com/middle' },
      { title: 'Current', url: 'https://example.com/current' },
    ]);

    manager.showBackHistoryMenu('tab-1');

    expect(popupSpy).toHaveBeenCalledTimes(1);
    const menu = lastMenu as { items: Array<{ label: string; click?: () => void }> };
    expect(menu.items.map((item) => item.label)).toEqual(['Middle', 'Oldest']);

    menu.items[0].click?.();
    expect(nav.goToIndex).toHaveBeenCalledWith(1);
    expect(manager.sendTabUpdate).toHaveBeenCalledWith('tab-1');
  });

  it('builds a forward-history menu nearest-first and navigates when a row is chosen', () => {
    const { manager, nav } = makeManager(0, [
      { title: 'Current', url: 'https://example.com/current' },
      { title: 'Next', url: 'https://example.com/next' },
      { title: 'Later', url: 'https://example.com/later' },
    ]);

    manager.showForwardHistoryMenu('tab-1');

    expect(popupSpy).toHaveBeenCalledTimes(1);
    const menu = lastMenu as { items: Array<{ label: string; click?: () => void }> };
    expect(menu.items.map((item) => item.label)).toEqual(['Next', 'Later']);

    menu.items[1].click?.();
    expect(nav.goToIndex).toHaveBeenCalledWith(2);
    expect(manager.sendTabUpdate).toHaveBeenCalledWith('tab-1');
  });

  it('does not show a popup when there is no back history', () => {
    const { manager } = makeManager(0, [
      { title: 'Current', url: 'https://example.com/current' },
    ]);

    manager.showBackHistoryMenu('tab-1');

    expect(popupSpy).not.toHaveBeenCalled();
  });
});
