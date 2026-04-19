import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: any[]) => any;

const {
  handlers,
  listeners,
  loadURL,
  loadFile,
  openDevTools,
  focus,
  show,
  close,
  BrowserWindowMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const listeners = new Map<string, Handler>();
  const loadURL = vi.fn(async () => undefined);
  const loadFile = vi.fn(async () => undefined);
  const openDevTools = vi.fn();
  const focus = vi.fn();
  const show = vi.fn();
  const close = vi.fn();

  class BrowserWindowMock {
    static nextId = 1;

    id = BrowserWindowMock.nextId++;
    private destroyed = false;
    private onceHandlers = new Map<string, Handler>();
    private onHandlers = new Map<string, Handler>();
    webContents = {
      loadURL,
      loadFile,
      openDevTools,
      on: vi.fn((event: string, handler: Handler) => {
        this.onHandlers.set(event, handler);
      }),
      getURL: vi.fn(() => 'app://print-preview'),
      getPrintersAsync: vi.fn(async () => []),
    };

    isDestroyed(): boolean {
      return this.destroyed;
    }

    once(event: string, handler: Handler): void {
      this.onceHandlers.set(event, handler);
    }

    on(event: string, handler: Handler): void {
      this.onHandlers.set(event, handler);
    }

    emit(event: string, ...args: unknown[]): void {
      const onceHandler = this.onceHandlers.get(event);
      if (onceHandler) {
        this.onceHandlers.delete(event);
        onceHandler(...args);
      }

      const onHandler = this.onHandlers.get(event);
      if (onHandler) {
        onHandler(...args);
      }
    }

    focus = focus;
    show = show;
    loadURL = loadURL;
    loadFile = loadFile;

    close(): void {
      this.destroyed = true;
      close();
      this.emit('closed');
    }
  }

  return {
    handlers,
    listeners,
    loadURL,
    loadFile,
    openDevTools,
    focus,
    show,
    close,
    BrowserWindowMock,
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

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    on: vi.fn((channel: string, handler: Handler) => {
      listeners.set(channel, handler);
    }),
    removeAllListeners: vi.fn((channel: string) => {
      listeners.delete(channel);
    }),
  },
  dialog: {
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
  },
  webContents: {
    fromId: vi.fn(() => ({
      isDestroyed: () => false,
      printToPDF: vi.fn(async () => Buffer.from('%PDF-1.4')),
      print: vi.fn((_opts, cb) => cb(true)),
    })),
  },
  PrinterInfo: class {},
}));

vi.stubGlobal('PRINT_PREVIEW_VITE_DEV_SERVER_URL', undefined);
vi.stubGlobal('PRINT_PREVIEW_VITE_NAME', 'print_preview');

import {
  closePrintPreviewWindow,
  getPrintPreviewWindow,
  openPrintPreviewWindow,
} from '../../../src/main/print/PrintPreviewWindow';

describe('PrintPreviewWindow', () => {
  beforeEach(() => {
    loadURL.mockReset();
    loadFile.mockReset();
    openDevTools.mockReset();
    focus.mockReset();
    show.mockReset();
    close.mockReset();
  });

  afterEach(() => {
    closePrintPreviewWindow();
  });

  it('registers the page-info IPC and exposes the current source tab details', () => {
    openPrintPreviewWindow(42, 'Printable Title', 'https://print.example/', undefined as never);

    const getPageInfo = handlers.get('print-preview:get-page-info');
    expect(getPageInfo).toBeTypeOf('function');
    expect(getPageInfo!()).toEqual({
      title: 'Printable Title',
      url: 'https://print.example/',
    });
  });

  it('reuses the existing preview window and refreshes page-info for the new source tab', () => {
    const first = openPrintPreviewWindow(42, 'Printable Title', 'https://print.example/', undefined as never);
    const second = openPrintPreviewWindow(77, 'Second Title', 'https://second.example/', undefined as never);

    expect(second).toBe(first);
    expect(focus).toHaveBeenCalled();

    const getPageInfo = handlers.get('print-preview:get-page-info');
    expect(getPageInfo!()).toEqual({
      title: 'Second Title',
      url: 'https://second.example/',
    });
  });

  it('clears the singleton when the preview window closes', () => {
    const win = openPrintPreviewWindow(42, 'Printable Title', 'https://print.example/', undefined as never);
    expect(getPrintPreviewWindow()).toBe(win);

    win.close();

    expect(getPrintPreviewWindow()).toBeNull();
  });
});
