import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showSaveDialog } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
}));

let lastMenu: { items: Array<{ label?: string; enabled?: boolean; click?: () => void }> } | null = null;

vi.mock('electron', () => {
  class MockMenu {
    items: Array<{ label?: string; enabled?: boolean; click?: () => void }> = [];
    constructor() {
      lastMenu = this;
    }
    append(item: { label?: string; enabled?: boolean; click?: () => void }): void {
      this.items.push(item);
    }
    popup(): void {}
  }

  class MockMenuItem {
    label?: string;
    enabled?: boolean;
    click?: () => void;
    constructor(opts: { label?: string; enabled?: boolean; click?: () => void }) {
      this.label = opts.label;
      this.enabled = opts.enabled;
      this.click = opts.click;
    }
  }

  return {
    Menu: MockMenu,
    MenuItem: MockMenuItem,
    clipboard: { writeText: vi.fn() },
    dialog: { showSaveDialog },
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

import { attachContextMenu } from '../../../src/main/contextMenu/ContextMenuController';

function makeWebContents() {
  const handlers = new Map<string, (...args: any[]) => void>();
  const session = {
    once: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
    }),
  };
  const wc = {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
    }),
    session,
    downloadURL: vi.fn(),
    inspectElement: vi.fn(),
    getURL: vi.fn(() => 'https://page.example.com'),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    reload: vi.fn(),
    copy: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    replaceMisspelling: vi.fn(),
    savePage: vi.fn(async () => undefined),
  };
  return { wc, handlers };
}

describe('ContextMenuController save actions', () => {
  beforeEach(() => {
    lastMenu = null;
    showSaveDialog.mockReset();
  });

  it('enables Save Link As and downloads the link target to the chosen path', async () => {
    const { wc, handlers } = makeWebContents();
    attachContextMenu(wc as any, {
      win: {} as any,
      createTab: vi.fn(),
      navigateActive: vi.fn(),
    });

    handlers.get('context-menu')?.({}, {
      linkURL: 'https://downloads.example.com/file.pdf',
      mediaType: 'none',
      selectionText: '',
      isEditable: false,
      formControlType: '',
      x: 0,
      y: 0,
      editFlags: {},
    });

    const item = lastMenu?.items.find((entry) => entry.label === 'Save Link As…');
    expect(item?.enabled).toBe(true);

    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/tmp/file.pdf' });
    item?.click?.();
    await Promise.resolve();

    expect(showSaveDialog).toHaveBeenCalled();
    expect(wc.downloadURL).toHaveBeenCalledWith('https://downloads.example.com/file.pdf');
  });

  it('enables Save Image As and downloads the image source to the chosen path', async () => {
    const { wc, handlers } = makeWebContents();
    attachContextMenu(wc as any, {
      win: {} as any,
      createTab: vi.fn(),
      navigateActive: vi.fn(),
    });

    handlers.get('context-menu')?.({}, {
      linkURL: '',
      srcURL: 'https://images.example.com/photo.png',
      mediaType: 'image',
      selectionText: '',
      isEditable: false,
      formControlType: '',
      x: 0,
      y: 0,
      editFlags: {},
    });

    const item = lastMenu?.items.find((entry) => entry.label === 'Save Image As…');
    expect(item?.enabled).toBe(true);

    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/tmp/photo.png' });
    item?.click?.();
    await Promise.resolve();

    expect(showSaveDialog).toHaveBeenCalled();
    expect(wc.downloadURL).toHaveBeenCalledWith('https://images.example.com/photo.png');
  });
});
