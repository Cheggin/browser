/**
 * ProfilePickerWindow.ts — creates the profile picker BrowserWindow.
 *
 * Shown at launch when the user has enabled "Show profile picker when opening Chrome".
 * Displays avatar cards per profile, a '+' button to add new profiles,
 * and a 'Browse as Guest' entry.
 *
 * Size: 560×480, non-resizable, titleBarStyle: 'hiddenInset'
 * Preload: src/preload/profilePicker.ts
 * Renderer: profile-picker/profile-picker.html
 */

import path from 'node:path';
import { BrowserWindow } from 'electron';
import { mainLogger } from '../logger';

declare const PROFILE_PICKER_VITE_DEV_SERVER_URL: string | undefined;
declare const PROFILE_PICKER_VITE_NAME: string | undefined;

let profilePickerWindow: BrowserWindow | null = null;

export function createProfilePickerWindow(): BrowserWindow {
  if (profilePickerWindow && !profilePickerWindow.isDestroyed()) {
    mainLogger.info('ProfilePickerWindow.focus', { windowId: profilePickerWindow.id });
    profilePickerWindow.focus();
    return profilePickerWindow;
  }

  mainLogger.info('ProfilePickerWindow.create');

  const preloadPath = path.join(__dirname, 'profilePicker.js');

  profilePickerWindow = new BrowserWindow({
    width: 560,
    height: 480,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#1a1a1f',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  profilePickerWindow.once('ready-to-show', () => {
    if (!profilePickerWindow || profilePickerWindow.isDestroyed()) return;
    profilePickerWindow.show();
    profilePickerWindow.focus();
    profilePickerWindow.moveTop();
    const [x, y] = profilePickerWindow.getPosition();
    const [w, h] = profilePickerWindow.getSize();
    mainLogger.info('ProfilePickerWindow.readyToShow', {
      windowId: profilePickerWindow.id,
      position: { x, y },
      size: { w, h },
    });
  });

  profilePickerWindow.on('closed', () => {
    mainLogger.info('ProfilePickerWindow.closed');
    profilePickerWindow = null;
  });

  profilePickerWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    mainLogger.error('ProfilePickerWindow.did-fail-load', { code, desc, url });
  });

  profilePickerWindow.webContents.on('did-finish-load', () => {
    mainLogger.info('ProfilePickerWindow.did-finish-load', {
      url: profilePickerWindow?.webContents.getURL(),
    });
  });

  profilePickerWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    mainLogger.info('profilePickerRenderer.console', { level, source, line, message });
  });

  if (process.env.NODE_ENV !== 'production') {
    profilePickerWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (typeof PROFILE_PICKER_VITE_DEV_SERVER_URL !== 'undefined' && PROFILE_PICKER_VITE_DEV_SERVER_URL) {
    const url = `${PROFILE_PICKER_VITE_DEV_SERVER_URL}/src/renderer/profile-picker/profile-picker.html`;
    mainLogger.debug('ProfilePickerWindow.loadURL', { url });
    void profilePickerWindow.loadURL(url);
  } else {
    const name = typeof PROFILE_PICKER_VITE_NAME !== 'undefined' ? PROFILE_PICKER_VITE_NAME : 'profile_picker';
    const filePath = path.join(
      __dirname,
      `../../renderer/${name}/profile-picker.html`,
    );
    mainLogger.debug('ProfilePickerWindow.loadFile', { filePath });
    void profilePickerWindow.loadFile(filePath);
  }

  mainLogger.info('ProfilePickerWindow.create.ok', {
    windowId: profilePickerWindow.id,
    width: 560,
    height: 480,
  });

  return profilePickerWindow;
}

export function getProfilePickerWindow(): BrowserWindow | null {
  if (profilePickerWindow && !profilePickerWindow.isDestroyed()) {
    return profilePickerWindow;
  }
  return null;
}

export function closeProfilePickerWindow(): void {
  if (profilePickerWindow && !profilePickerWindow.isDestroyed()) {
    mainLogger.info('ProfilePickerWindow.closeRequested');
    profilePickerWindow.close();
  }
}
