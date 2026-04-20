import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';

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
import {
  CERT_ERROR_BACK_PREFIX,
  CERT_ERROR_PROCEED_PREFIX,
  clearCertBypasses,
  isCertAllowedForOrigin,
} from '../../../src/main/errors/NetworkErrorController';

type ConsoleHandler = (event: unknown, level: number, message: string) => void;
type FakeWebContents = {
  canGoBack: ReturnType<typeof vi.fn>;
  getURL: ReturnType<typeof vi.fn>;
  goBack: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
};

function makeHarness() {
  const handlers = new Map<string, (...args: any[]) => void>();
  const webContents: FakeWebContents = {
    canGoBack: vi.fn(() => false),
    getURL: vi.fn(() => 'data:text/html;charset=utf-8,cert'),
    goBack: vi.fn(),
    loadURL: vi.fn(),
    isDestroyed: vi.fn(() => false),
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
    passwordStore: null;
    zoomStore: { setZoomForUrl: ReturnType<typeof vi.fn> };
  };

  manager.win = {};
  manager.createTab = vi.fn();
  manager.navigateActive = vi.fn();
  manager.passwordStore = null;
  manager.zoomStore = { setZoomForUrl: vi.fn() };

  (manager as any).attachViewEvents('tab-1', { webContents } as any);

  return {
    manager,
    webContents,
    consoleMessage: handlers.get('console-message') as ConsoleHandler,
  };
}

afterEach(() => {
  clearCertBypasses();
  vi.restoreAllMocks();
});

describe('TabManager cert-error flows', () => {
  it('records the host bypass and reloads the unsafe URL when proceed is requested', () => {
    const { consoleMessage, webContents } = makeHarness();
    const unsafeUrl = 'https://bad.example/path';

    consoleMessage({}, 0, `${CERT_ERROR_PROCEED_PREFIX}${unsafeUrl}`);

    expect(isCertAllowedForOrigin('bad.example')).toBe(true);
    expect(webContents.loadURL).toHaveBeenCalledWith(unsafeUrl);
  });

  it('backs to safety with browser history when available', () => {
    const { consoleMessage, webContents } = makeHarness();
    webContents.canGoBack.mockReturnValue(true);

    consoleMessage({}, 0, CERT_ERROR_BACK_PREFIX);

    expect(webContents.goBack).toHaveBeenCalledTimes(1);
    expect(webContents.loadURL).not.toHaveBeenCalledWith('about:blank');
  });

  it('backs to about:blank when no history is available', () => {
    const { consoleMessage, webContents } = makeHarness();
    webContents.canGoBack.mockReturnValue(false);

    consoleMessage({}, 0, CERT_ERROR_BACK_PREFIX);

    expect(webContents.goBack).not.toHaveBeenCalled();
    expect(webContents.loadURL).toHaveBeenCalledWith('about:blank');
  });

  it('allows the retried navigation after a bypass has been recorded', () => {
    const { manager } = makeHarness();
    const handler = vi.fn();
    let certErrorHandler: ((event: { preventDefault: () => void }, webContents: FakeWebContents, certUrl: string, certError: string, certificate: unknown, callback: (allow: boolean) => void) => void) | null = null;

    (app as any).on = vi.fn((event: string, cb: typeof certErrorHandler) => {
      if (event === 'certificate-error') {
        certErrorHandler = cb;
      }
      return app as any;
    });

    clearCertBypasses();
    (manager as any).registerCertErrorHandler();
    expect(certErrorHandler).not.toBeNull();

    const unsafeUrl = 'https://bad.example/path';
    const proceedHarness = makeHarness();
    proceedHarness.consoleMessage({}, 0, `${CERT_ERROR_PROCEED_PREFIX}${unsafeUrl}`);

    certErrorHandler!(
      { preventDefault: vi.fn() },
      {
        ...proceedHarness.webContents,
        loadURL: handler,
      },
      unsafeUrl,
      'ERR_CERT_AUTHORITY_INVALID',
      null,
      vi.fn(),
    );

    expect(isCertAllowedForOrigin('bad.example')).toBe(true);

    const allowSpy = vi.fn();
    certErrorHandler!(
      { preventDefault: vi.fn() },
      {
        ...proceedHarness.webContents,
        loadURL: handler,
      },
      unsafeUrl,
      'ERR_CERT_AUTHORITY_INVALID',
      null,
      allowSpy,
    );

    expect(allowSpy).toHaveBeenCalledWith(true);
    expect(handler).not.toHaveBeenCalled();
  });
});
