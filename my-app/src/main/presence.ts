import { BrowserWindow, screen } from 'electron';
import { mainLogger } from './logger';

const PRESENCE_WIDTH = 320;
const PRESENCE_HEIGHT = 64;
const PRESENCE_TOP_OFFSET = 26;
const AUTO_HIDE_MS = 4000;

export type PresenceState =
  | 'idle'
  | 'working'
  | 'done'
  | 'error'
  | 'target_lost';

export interface PresenceUpdate {
  state: PresenceState;
  taskId?: string;
  stepCount?: number;
  message?: string;
}

interface NormalizedPresenceUpdate {
  state: PresenceState;
  taskId?: string;
  stepCount?: number;
  message: string;
}

interface PresenceViewModel {
  state: PresenceState;
  badge: string;
  title: string;
  detail: string;
}

const DEFAULT_PRESENCE: NormalizedPresenceUpdate = {
  state: 'idle',
  message: 'Agent idle',
};

let presenceWindow: BrowserWindow | null = null;
let presenceReady = false;
let currentPresence = DEFAULT_PRESENCE;
let autoHideTimer: NodeJS.Timeout | null = null;

function isTerminalState(state: PresenceState): boolean {
  return state === 'done' || state === 'error' || state === 'target_lost';
}

function clearAutoHideTimer(): void {
  if (!autoHideTimer) return;
  clearTimeout(autoHideTimer);
  autoHideTimer = null;
}

function defaultMessageFor(update: {
  state: PresenceState;
  stepCount?: number;
  taskId?: string;
}): string {
  switch (update.state) {
    case 'idle':
      return 'Agent idle';
    case 'working':
      return update.stepCount
        ? `Working through step ${update.stepCount}`
        : 'Agent is working';
    case 'done':
      return 'Task completed';
    case 'error':
      return 'Task failed';
    case 'target_lost':
      return 'The active tab is no longer available';
  }
}

function normalizeUpdate(update: PresenceUpdate): NormalizedPresenceUpdate {
  const isNewTask = !!update.taskId && update.taskId !== currentPresence.taskId;
  const taskId = update.taskId ?? currentPresence.taskId;
  const stepCount = update.stepCount ?? (isNewTask ? undefined : currentPresence.stepCount);
  const message = update.message?.trim() || defaultMessageFor({
    state: update.state,
    taskId,
    stepCount,
  });

  return {
    state: update.state,
    taskId,
    stepCount,
    message,
  };
}

function computeBounds(): { x: number; y: number; width: number; height: number } {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const x = Math.round(display.bounds.x + (display.bounds.width - PRESENCE_WIDTH) / 2);
  const y = display.bounds.y + PRESENCE_TOP_OFFSET;

  return {
    x,
    y,
    width: PRESENCE_WIDTH,
    height: PRESENCE_HEIGHT,
  };
}

function buildPresenceDocument(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Agent Presence</title>
    <style>
      :root {
        color-scheme: dark;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #presence {
        width: calc(100% - 14px);
        height: calc(100% - 14px);
        border-radius: 18px;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 12px;
        align-items: center;
        box-sizing: border-box;
        padding: 12px 16px;
        background: rgba(9, 15, 28, 0.96);
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow: 0 18px 60px rgba(15, 23, 42, 0.36);
        color: #e2e8f0;
      }
      #presence[data-state="working"] {
        border-color: rgba(56, 189, 248, 0.4);
      }
      #presence[data-state="done"] {
        border-color: rgba(74, 222, 128, 0.42);
      }
      #presence[data-state="error"],
      #presence[data-state="target_lost"] {
        border-color: rgba(248, 113, 113, 0.44);
      }
      #badge {
        min-width: 62px;
        height: 28px;
        padding: 0 12px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        background: rgba(30, 41, 59, 0.92);
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      #presence[data-state="working"] #badge {
        background: rgba(2, 132, 199, 0.22);
        color: #bae6fd;
      }
      #presence[data-state="done"] #badge {
        background: rgba(21, 128, 61, 0.22);
        color: #bbf7d0;
      }
      #presence[data-state="error"] #badge,
      #presence[data-state="target_lost"] #badge {
        background: rgba(185, 28, 28, 0.22);
        color: #fecaca;
      }
      #content {
        min-width: 0;
      }
      #title {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.25;
        color: #f8fafc;
      }
      #detail {
        margin-top: 3px;
        font-size: 12px;
        line-height: 1.35;
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    </style>
  </head>
  <body>
    <div id="presence" data-state="idle">
      <div id="badge">Idle</div>
      <div id="content">
        <div id="title">Agent idle</div>
        <div id="detail">Waiting for the next task</div>
      </div>
    </div>
    <script>
      const root = document.getElementById('presence');
      const badge = document.getElementById('badge');
      const title = document.getElementById('title');
      const detail = document.getElementById('detail');

      window.__applyPresence = (payload) => {
        root.dataset.state = payload.state;
        badge.textContent = payload.badge;
        title.textContent = payload.title;
        detail.textContent = payload.detail;
      };
    </script>
  </body>
</html>`;
}

function buildViewModel(update: NormalizedPresenceUpdate): PresenceViewModel {
  const badge = update.state === 'working' && update.stepCount
    ? `Step ${update.stepCount}`
    : update.state.replace('_', ' ');

  const taskSuffix = update.taskId ? ` • ${update.taskId.slice(0, 8)}` : '';
  const title = update.state === 'working'
    ? `Agent running${taskSuffix}`
    : update.state === 'done'
      ? `Task complete${taskSuffix}`
      : update.state === 'error'
        ? `Task failed${taskSuffix}`
        : update.state === 'target_lost'
          ? `Target lost${taskSuffix}`
          : 'Agent idle';

  return {
    state: update.state,
    badge,
    title,
    detail: update.message,
  };
}

function syncPresenceWindow(): void {
  if (!presenceWindow || presenceWindow.isDestroyed() || !presenceReady) return;

  const script = `window.__applyPresence(${JSON.stringify(buildViewModel(currentPresence))});`;
  presenceWindow.webContents.executeJavaScript(script).catch((error: unknown) => {
    mainLogger.warn('presence.syncFailed', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function applyWindowVisibility(): void {
  if (!presenceWindow || presenceWindow.isDestroyed()) return;

  if (currentPresence.state === 'idle') {
    presenceWindow.hide();
    return;
  }

  presenceWindow.setBounds(computeBounds());
  presenceWindow.showInactive();
}

function scheduleAutoHide(): void {
  clearAutoHideTimer();
  if (!isTerminalState(currentPresence.state)) return;

  const taskId = currentPresence.taskId;
  const state = currentPresence.state;
  autoHideTimer = setTimeout(() => {
    if (currentPresence.taskId !== taskId || currentPresence.state !== state) return;
    currentPresence = DEFAULT_PRESENCE;
    applyWindowVisibility();
  }, AUTO_HIDE_MS);
  autoHideTimer.unref?.();
}

export function initPresence(): void {
  if (presenceWindow && !presenceWindow.isDestroyed()) return;

  presenceReady = false;
  presenceWindow = new BrowserWindow({
    width: PRESENCE_WIDTH,
    height: PRESENCE_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    fullscreenable: false,
    roundedCorners: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  presenceWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  presenceWindow.setAlwaysOnTop(true, 'screen-saver');
  presenceWindow.setIgnoreMouseEvents(true);
  presenceWindow.setBounds(computeBounds());
  void presenceWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildPresenceDocument())}`,
  );
  presenceWindow.webContents.once('did-finish-load', () => {
    presenceReady = true;
    syncPresenceWindow();
    applyWindowVisibility();
  });
  presenceWindow.on('closed', () => {
    clearAutoHideTimer();
    presenceReady = false;
    presenceWindow = null;
    currentPresence = DEFAULT_PRESENCE;
  });

  mainLogger.info('presence.init', { visible: false });
}

export function updatePresence(update: PresenceUpdate): void {
  if (!presenceWindow || presenceWindow.isDestroyed()) {
    initPresence();
  }

  currentPresence = normalizeUpdate(update);
  syncPresenceWindow();
  applyWindowVisibility();
  scheduleAutoHide();

  mainLogger.info('presence.update', {
    state: currentPresence.state,
    taskId: currentPresence.taskId,
    stepCount: currentPresence.stepCount,
    message: currentPresence.message,
  });
}

export function destroyPresence(): void {
  clearAutoHideTimer();

  if (!presenceWindow || presenceWindow.isDestroyed()) {
    currentPresence = DEFAULT_PRESENCE;
    presenceReady = false;
    return;
  }

  presenceWindow.close();
  presenceWindow = null;
  presenceReady = false;
  currentPresence = DEFAULT_PRESENCE;
  mainLogger.info('presence.destroy');
}
