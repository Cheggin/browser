/**
 * Device IPC handlers — register/unregister pattern matching permissions/ipc.ts.
 *
 * Channels:
 *   device-picker:respond   — renderer sends chosen deviceId (or null to cancel)
 *   device-picker:dismiss   — renderer dismisses the picker without a choice
 *   devices:get-all         — renderer queries all granted devices (settings list)
 *   devices:get-for-api     — renderer queries grants by API type (settings list)
 *   devices:revoke          — renderer revokes a single device grant
 *   devices:revoke-origin   — renderer revokes all grants for an origin
 *   devices:revoke-all      — renderer revokes all grants (factory reset helper)
 */

import { ipcMain } from 'electron';
import { mainLogger } from '../logger';
import { DeviceStore, DeviceApiType } from './DeviceStore';
import { DeviceManager } from './DeviceManager';

const CHANNELS = [
  'device-picker:respond',
  'device-picker:dismiss',
  'devices:get-all',
  'devices:get-for-api',
  'devices:revoke',
  'devices:revoke-origin',
  'devices:revoke-all',
] as const;

export interface RegisterDeviceHandlersOptions {
  store: DeviceStore;
  manager: DeviceManager;
}

export function registerDeviceHandlers(opts: RegisterDeviceHandlersOptions): void {
  const { store, manager } = opts;

  ipcMain.handle('device-picker:respond', (_e, pickerId: string, deviceId: string | null) => {
    mainLogger.info('device-picker:respond', { pickerId, deviceId });
    manager.handleResponse(pickerId, deviceId);
  });

  ipcMain.handle('device-picker:dismiss', (_e, pickerId: string) => {
    mainLogger.info('device-picker:dismiss', { pickerId });
    manager.dismissPicker(pickerId);
  });

  ipcMain.handle('devices:get-all', () => {
    mainLogger.info('devices:get-all');
    return store.getAll();
  });

  ipcMain.handle('devices:get-for-api', (_e, apiType: string) => {
    mainLogger.info('devices:get-for-api', { apiType });
    return store.getForApi(apiType as DeviceApiType);
  });

  ipcMain.handle('devices:revoke', (_e, apiType: string, origin: string, deviceId: string) => {
    mainLogger.info('devices:revoke', { apiType, origin, deviceId });
    return store.revoke(apiType as DeviceApiType, origin, deviceId);
  });

  ipcMain.handle('devices:revoke-origin', (_e, origin: string) => {
    mainLogger.info('devices:revoke-origin', { origin });
    store.revokeForOrigin(origin);
  });

  ipcMain.handle('devices:revoke-all', () => {
    mainLogger.info('devices:revoke-all');
    store.revokeAll();
  });

  mainLogger.info('devices.ipc.registered');
}

export function unregisterDeviceHandlers(): void {
  for (const ch of CHANNELS) {
    ipcMain.removeHandler(ch);
  }
  mainLogger.info('devices.ipc.unregistered');
}
