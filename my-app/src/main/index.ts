/**
 * Main process entry point — Agent Orchestration Hub.
 *
 * All browser modules (tabs, bookmarks, history, downloads, extensions,
 * permissions, profiles, devtools, omnibox, etc.) have been removed.
 * This is the minimal clean starting point for the hub architecture.
 */

import { config as loadDotEnv } from 'dotenv';
import path from 'node:path';

// Load .env from the app root (my-app/.env) BEFORE any module reads
// process.env. In production the key comes from the keychain; .env is the
// dev-time fallback.
loadDotEnv({ path: path.resolve(__dirname, '..', '..', '.env') });

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, MenuItemConstructorOptions } from 'electron';
import started from 'electron-squirrel-startup';
import { createShellWindow } from './window';
import { createPillWindow, togglePill, hidePill, setPillHeight, PILL_HEIGHT_COLLAPSED, PILL_HEIGHT_EXPANDED } from './pill';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { AccountStore, getSyncEnabled } from './identity/AccountStore';
import { OAuthClient } from './identity/OAuthClient';
import { KeychainStore } from './identity/KeychainStore';
import { initOAuthHandler } from './oauth';
import { createOnboardingWindow } from './identity/onboardingWindow';
import { registerOnboardingHandlers, unregisterOnboardingHandlers } from './identity/onboardingHandlers';
import { performSignOut, turnOffSync } from './identity/SignOutController';
import type { SignOutMode } from './identity/SignOutController';
import { mainLogger } from './logger';
import { resolveUserDataDir, resolveCdpPort, setAnnouncedCdpPort } from './startup/cli';
import { getApiKey } from './agentApiKey';
import { assertString } from './ipc-validators';
import { getEngine, setEngine, type EngineId } from './hl/engine';
import { initUpdater, stopUpdater } from './updater';
// TODO: re-enable settings handlers once passwords/downloads deps are wired
// import { openSettingsWindow, closeSettingsWindow, getSettingsWindow } from './settings/SettingsWindow';
// import { registerSettingsHandlers, unregisterSettingsHandlers } from './settings/ipc';

// ---------------------------------------------------------------------------
// Crash telemetry: catch unhandled errors before anything else
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  mainLogger.error('main.uncaughtException', {
    error: err.message,
    stack: err.stack,
    type: err.constructor?.name,
  });
});
process.on('unhandledRejection', (reason, promise) => {
  mainLogger.error('main.unhandledRejection', {
    reason: String(reason),
    promise: String(promise),
  });
});

// ---------------------------------------------------------------------------
// Isolated userData override.
//
// Precedence:
//   1. `--user-data-dir=<path>` CLI flag
//   2. `AGB_USER_DATA_DIR` env var
//   3. Electron's platform default
//
// MUST be applied before any `app.getPath('userData')` call.
// ---------------------------------------------------------------------------
const resolvedUserData = resolveUserDataDir(process.argv, process.env);
if (resolvedUserData.value) {
  app.setPath('userData', resolvedUserData.value);
}

// ---------------------------------------------------------------------------
// Remote debugging: MUST be called before app.whenReady()
// ---------------------------------------------------------------------------
const resolvedCdp = resolveCdpPort(process.argv);
app.commandLine.appendSwitch('remote-debugging-port', String(resolvedCdp.port));
setAnnouncedCdpPort(resolvedCdp.port);
mainLogger.info('main.startup', {
  msg: `Remote debugging port set to ${resolvedCdp.port}`,
  cdpPort: resolvedCdp.port,
  cdpPortSource: resolvedCdp.source,
  userDataOverride: resolvedUserData.value,
  userDataSource: resolvedUserData.source,
  forceOnboarding: process.env.AGB_FORCE_ONBOARDING === '1',
});

// Handle Windows Squirrel installer events
if (started) {
  app.quit();
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
let shellWindow: BrowserWindow | null = null;
let onboardingWindow: BrowserWindow | null = null;

const accountStore = new AccountStore();
const oauthClient = new OAuthClient({
  clientId: process.env.GOOGLE_CLIENT_ID ?? '42357852543-62lvdghq5hatidr3ovmq1rig9q5r5mcg.apps.googleusercontent.com',
});
const keychainStore = new KeychainStore();

// ---------------------------------------------------------------------------
// Helper: open shell window and wire it up
// ---------------------------------------------------------------------------
function openShellAndWire(): BrowserWindow {
  mainLogger.info('main.openShellAndWire', { msg: 'Creating shell window' });

  shellWindow = createShellWindow();
  mainLogger.info('main.openShellAndWire.created', { windowId: shellWindow.id });

  // Create pill window (hidden) and register Cmd+K
  createPillWindow();
  const hotkeyOk = registerHotkeys(() => togglePill());
  if (!hotkeyOk) {
    mainLogger.warn('main.hotkey', { msg: 'Cmd+K hotkey registration failed — another app may own it' });
  }

  // Wire Cmd+K from shell webContents — catches focus when omnibox is active
  shellWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key !== 'k' && input.key !== 'K') return;
    const cmdOrCtrl = process.platform === 'darwin' ? input.meta : input.control;
    if (!cmdOrCtrl) return;
    if (input.shift || input.alt) return;
    if (process.platform === 'darwin' && input.control) return;
    event.preventDefault();
    mainLogger.debug('main.shellBeforeInput.cmdK');
    togglePill();
  });

  shellWindow.webContents.once('did-finish-load', () => {
    mainLogger.info('main.shellReady', { windowId: shellWindow?.id });
    shellWindow?.webContents.send('window-ready');
  });

  shellWindow.on('closed', () => {
    mainLogger.info('main.shellWindow.closed');
    shellWindow = null;
  });

  buildApplicationMenu();

  mainLogger.info('main.openShellAndWire.done', { windowId: shellWindow.id });
  return shellWindow;
}

// ---------------------------------------------------------------------------
// App ready
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  mainLogger.info('main.appReady', { msg: 'Electron app ready, starting hub initialization' });

  const forceOnboarding = process.env.AGB_FORCE_ONBOARDING === '1';
  const onboardingComplete = !forceOnboarding && accountStore.isOnboardingComplete();
  mainLogger.info('main.onboardingGate', { onboardingComplete, forceOnboarding });

  if (!onboardingComplete) {
    mainLogger.info('main.onboardingGate.fresh', { msg: 'Opening onboarding window' });
    onboardingWindow = createOnboardingWindow();

    registerOnboardingHandlers({
      accountStore,
      oauthClient,
      onboardingWindow,
      openShellWindow: () => openShellAndWire(),
    });

    initOAuthHandler({
      client: oauthClient,
      keychain: keychainStore,
      account: accountStore,
      window: onboardingWindow,
    });

    onboardingWindow.on('closed', () => {
      mainLogger.info('main.onboardingWindow.closed');
      unregisterOnboardingHandlers();
      onboardingWindow = null;
    });

  } else {
    mainLogger.info('main.onboardingGate.returning', { msg: 'Returning user — opening shell directly' });
    openShellAndWire();
  }

  // Auto-updater — no-op in dev/non-packaged builds
  initUpdater().catch((err) => {
    mainLogger.warn('main.updater.initFailed', { error: (err as Error)?.message ?? String(err) });
  });

  // Flush on quit
  app.on('before-quit', async () => {
    mainLogger.info('main.beforeQuit', { msg: 'App quitting' });
  });

  app.on('will-quit', () => {
    mainLogger.info('main.willQuit', { msg: 'Unregistering hotkeys and cleaning up' });
    unregisterHotkeys();
    stopUpdater();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainLogger.info('main.activate', { onboardingComplete: accountStore.isOnboardingComplete() });
      if (accountStore.isOnboardingComplete()) {
        openShellAndWire();
      } else {
        onboardingWindow = createOnboardingWindow();
      }
    }
  });

  mainLogger.info('main.appReady.done', { msg: 'Hub initialization complete' });
});

// ---------------------------------------------------------------------------
// Quit behaviour (macOS: stay alive until Cmd+Q)
// ---------------------------------------------------------------------------
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ---------------------------------------------------------------------------
// Application menu — minimal hub menu
// ---------------------------------------------------------------------------
function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Agent',
      submenu: [
        {
          label: 'Toggle Agent Pill',
          accelerator: 'CommandOrControl+K',
          click: () => {
            mainLogger.debug('shortcuts.togglePill');
            togglePill();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Enter Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+CommandOrControl+F' : 'F11',
          click: () => {
            shellWindow?.setFullScreen(!shellWindow?.isFullScreen());
          },
        },
      ],
    },
    {
      role: 'windowMenu',
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Report an Issue…',
          click: () => {
            const { shell } = require('electron');
            shell.openExternal('https://github.com/anthropics/desktop-app/issues');
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One-time: unregister globalShortcut on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ---------------------------------------------------------------------------
// IPC: shell layout handlers (kept for hub chrome compatibility)
// ---------------------------------------------------------------------------
ipcMain.handle('shell:get-platform', () => {
  mainLogger.debug('main.shell:get-platform', { platform: process.platform });
  return process.platform;
});

ipcMain.handle('shell:set-chrome-height', (_e, height: unknown) => {
  if (typeof height !== 'number' || !Number.isFinite(height)) return;
  mainLogger.debug('main.shell:set-chrome-height', { height });
  // No TabManager in hub mode — no-op for now
});

ipcMain.handle('shell:set-overlay', (_e, visible: unknown) => {
  if (typeof visible !== 'boolean') return;
  mainLogger.debug('main.shell:set-overlay', { visible });
  // No overlay manager in hub mode — no-op for now
});

// ---------------------------------------------------------------------------
// IPC: pill handlers
// ---------------------------------------------------------------------------
ipcMain.handle('pill:hide', async () => {
  mainLogger.info('main.pill:hide');
  hidePill();
});

ipcMain.handle('pill:set-expanded', (_event, expandedOrHeight: boolean | number) => {
  if (typeof expandedOrHeight === 'number') {
    setPillHeight(Math.max(PILL_HEIGHT_COLLAPSED, Math.min(expandedOrHeight, PILL_HEIGHT_EXPANDED)));
  } else {
    setPillHeight(expandedOrHeight ? PILL_HEIGHT_EXPANDED : PILL_HEIGHT_COLLAPSED);
  }
});

// pill:submit — invoke HL agent in-process
ipcMain.handle('pill:submit', async (_event, { prompt }: { prompt: string }) => {
  const validatedPrompt = assertString(prompt, 'prompt', 10000);
  const account = accountStore.load();
  const engine = getEngine();
  mainLogger.info('main.pill:submit', { engine, promptLength: validatedPrompt.length });

  // TODO: wire up hlPillBridge once it's restored
  // return handleHlSubmit({ prompt: validatedPrompt, ... });
  mainLogger.warn('main.pill:submit', { msg: 'hlPillBridge not yet wired — stub response' });
  return { task_id: null, error: 'Agent engine not yet wired' };
});

ipcMain.handle('pill:cancel', async (_event, { task_id }: { task_id: string }) => {
  mainLogger.info('main.pill:cancel', { task_id });
  // TODO: wire up handleHlCancel once hlPillBridge is restored
  return { ok: false, error: 'Agent engine not yet wired' };
});

// hl:get-engine / hl:set-engine
ipcMain.handle('hl:get-engine', () => {
  mainLogger.debug('main.hl:get-engine');
  return getEngine();
});

ipcMain.handle('hl:set-engine', (_event, { engine }: { engine: string }) => {
  const e: EngineId = 'hl-inprocess';
  mainLogger.info('main.hl:set-engine', { engine: e });
  setEngine(e);
  return e;
});

// ---------------------------------------------------------------------------
// IPC: identity handlers
// ---------------------------------------------------------------------------
ipcMain.handle('identity:sign-out', async (_event, mode: SignOutMode) => {
  mainLogger.info('main.identity:sign-out', { mode });
  return performSignOut(mode, accountStore, keychainStore, {});
});

ipcMain.handle('identity:turn-off-sync', async () => {
  mainLogger.info('main.identity:turn-off-sync');
  return turnOffSync(accountStore);
});

ipcMain.handle('identity:get-account-info', () => {
  mainLogger.debug('main.identity:get-account-info');
  const account = accountStore.load();
  if (!account) return null;
  return {
    email: account.email,
    agentName: account.agent_name,
    syncEnabled: getSyncEnabled(account),
  };
});

// ---------------------------------------------------------------------------
// DEV/TEST IPC
// ---------------------------------------------------------------------------
if (process.env.DEV_MODE === '1' || process.env.NODE_ENV === 'test') {
  ipcMain.handle('test:open-pill', () => {
    mainLogger.info('main.test:open-pill', { msg: 'test IPC triggered pill toggle' });
    togglePill();
  });
}

if (process.env.NODE_ENV === 'test') {
  ipcMain.handle('test:complete-onboarding', async (_event, payload: { agent_name: string; email: string }) => {
    mainLogger.info('main.test:complete-onboarding', {
      msg: 'test IPC triggered onboarding completion (bypasses OAuth)',
      agentName: payload?.agent_name,
      email: payload?.email,
    });

    accountStore.save({
      agent_name: payload?.agent_name ?? 'TestAgent',
      email: payload?.email ?? 'test@example.com',
      created_at: new Date().toISOString(),
      onboarding_completed_at: new Date().toISOString(),
    });

    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.close();
    }
    openShellAndWire();

    mainLogger.info('main.test:complete-onboarding.done', { msg: 'Shell opened, onboarding bypassed' });
  });
}
