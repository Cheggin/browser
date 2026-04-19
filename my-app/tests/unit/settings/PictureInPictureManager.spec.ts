import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: any[]) => any;

const handlers = new Map<string, Handler>();

vi.mock('../../../src/main/logger', () => ({
  mainLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  },
}));

import { registerPipHandlers, unregisterPipHandlers } from '../../../src/main/pip/PictureInPictureManager';

describe('PictureInPictureManager', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it('returns no_active_tab when no active webContents is available', async () => {
    registerPipHandlers(() => null);

    await expect(handlers.get('pip:enter')!()).resolves.toEqual({
      ok: false,
      error: 'no_active_tab',
    });
    await expect(handlers.get('pip:exit')!()).resolves.toEqual({
      ok: false,
      error: 'no_active_tab',
    });
    await expect(handlers.get('pip:get-status')!()).resolves.toBeNull();

    unregisterPipHandlers();
  });

  it('forwards enter/exit/status scripts to the active webContents', async () => {
    const executeJavaScript = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, action: 'enter' })
      .mockResolvedValueOnce({ ok: true, note: 'not_in_pip' })
      .mockResolvedValueOnce({ supported: true, active: false, hasVideo: true });

    registerPipHandlers(() => ({
      isDestroyed: () => false,
      executeJavaScript,
    }) as never);

    await expect(handlers.get('pip:enter')!()).resolves.toEqual({
      ok: true,
      action: 'enter',
    });
    await expect(handlers.get('pip:exit')!()).resolves.toEqual({
      ok: true,
      note: 'not_in_pip',
    });
    await expect(handlers.get('pip:get-status')!()).resolves.toEqual({
      supported: true,
      active: false,
      hasVideo: true,
    });

    expect(executeJavaScript).toHaveBeenCalledTimes(3);
    unregisterPipHandlers();
  });
});
