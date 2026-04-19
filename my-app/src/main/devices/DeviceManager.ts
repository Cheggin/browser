/**
 * DeviceManager — handles WebUSB, WebHID, Web Serial, and Web Bluetooth
 * device-picker events from Electron sessions.
 *
 * Flow per API:
 *   1. Session emits select-hid-device / select-serial-port / select-usb-device,
 *      or WebContents emits select-bluetooth-device.
 *   2. DeviceManager checks DeviceStore for a previously-granted match.
 *      If found → callback(deviceId) immediately (no UI).
 *   3. Otherwise, sends a device-picker-request event to the shell renderer
 *      with the list of available devices.
 *   4. Shell renderer shows DevicePickerBar; user picks a device (or cancels).
 *   5. Renderer sends device-picker-respond IPC → DeviceManager calls the
 *      original callback and persists the grant to DeviceStore.
 *
 * Revocation (device.forget()):
 *   - Session emits hid-device-revoked / serial-port-revoked / usb-device-revoked.
 *   - DeviceManager removes the entry from DeviceStore.
 */

import { BrowserWindow, ipcMain, Session, session, WebContents } from 'electron';
import { mainLogger } from '../logger';
import { DeviceStore, DeviceApiType } from './DeviceStore';

// ---------------------------------------------------------------------------
// Public DTO types (shared with renderer via IPC)
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  deviceId: string;
  name: string;
  vendorId?: string;
  productId?: string;
}

export interface DevicePickerRequest {
  id: string;
  apiType: DeviceApiType;
  origin: string;
  devices: DeviceInfo[];
}

// ---------------------------------------------------------------------------
// Internal pending-picker state
// ---------------------------------------------------------------------------

interface PendingPicker {
  request: DevicePickerRequest;
  callback: (deviceId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexId(n: number): string {
  return `0x${n.toString(16).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// DeviceManager
// ---------------------------------------------------------------------------

export class DeviceManager {
  private store: DeviceStore;
  private getShellWindow: () => BrowserWindow | null;
  private pending: Map<string, PendingPicker> = new Map();
  private pickerCounter = 0;

  constructor(opts: {
    store: DeviceStore;
    getShellWindow: () => BrowserWindow | null;
  }) {
    this.store = opts.store;
    this.getShellWindow = opts.getShellWindow;

    this.attachToSession(session.defaultSession);
    mainLogger.info('DeviceManager.init');
  }

  // ---------------------------------------------------------------------------
  // Session event wiring
  // ---------------------------------------------------------------------------

  private attachToSession(ses: Session): void {
    // ---------- WebHID ----------
    ses.on('select-hid-device', (event, details, callback) => {
      event.preventDefault();
      const origin = details.frame?.url ? this.extractOrigin(details.frame.url) : 'unknown';
      mainLogger.info('DeviceManager.select-hid-device', {
        origin,
        deviceCount: details.deviceList.length,
      });

      const devices: DeviceInfo[] = details.deviceList.map((d) => ({
        deviceId: d.deviceId,
        name: d.name || `HID Device ${hexId(d.vendorId ?? 0)}:${hexId(d.productId ?? 0)}`,
        vendorId: hexId(d.vendorId ?? 0),
        productId: hexId(d.productId ?? 0),
      }));

      // Check for a previously-granted device that is still in the list
      for (const dev of devices) {
        if (this.store.isGranted('hid', origin, dev.deviceId)) {
          mainLogger.info('DeviceManager.hid.autoGrant', { origin, deviceId: dev.deviceId });
          callback(dev.deviceId);
          return;
        }
      }

      if (devices.length === 0) {
        mainLogger.info('DeviceManager.hid.noDevices', { origin });
        callback('');
        return;
      }

      this.showPicker('hid', origin, devices, callback);
    });

    ses.on('hid-device-revoked', (_event, details) => {
      const origin = details.origin ?? 'unknown';
      mainLogger.info('DeviceManager.hid-device-revoked', { origin, deviceId: details.device?.deviceId });
      if (details.device?.deviceId) {
        this.store.revoke('hid', origin, details.device.deviceId);
      }
    });

    // ---------- Web Serial ----------
    ses.on('select-serial-port', (event, portList, _webContents, callback) => {
      event.preventDefault();
      // Serial port origin comes from webContents URL
      const origin = _webContents ? this.extractOrigin(_webContents.getURL()) : 'unknown';
      mainLogger.info('DeviceManager.select-serial-port', { origin, portCount: portList.length });

      const devices: DeviceInfo[] = portList.map((p) => ({
        deviceId: p.portId,
        name: p.displayName || p.portName || p.portId,
        vendorId: p.vendorId ?? undefined,
        productId: p.productId ?? undefined,
      }));

      for (const dev of devices) {
        if (this.store.isGranted('serial', origin, dev.deviceId)) {
          mainLogger.info('DeviceManager.serial.autoGrant', { origin, deviceId: dev.deviceId });
          callback(dev.deviceId);
          return;
        }
      }

      if (devices.length === 0) {
        mainLogger.info('DeviceManager.serial.noDevices', { origin });
        callback('');
        return;
      }

      this.showPicker('serial', origin, devices, callback);
    });

    ses.on('serial-port-revoked', (_event, details) => {
      const origin = details.frame?.url ? this.extractOrigin(details.frame.url) : (details.origin ?? 'unknown');
      mainLogger.info('DeviceManager.serial-port-revoked', { origin, portId: details.port?.portId });
      if (details.port?.portId) {
        this.store.revoke('serial', origin, details.port.portId);
      }
    });

    // ---------- WebUSB ----------
    ses.on('select-usb-device', (event, details, callback) => {
      event.preventDefault();
      const origin = details.frame?.url ? this.extractOrigin(details.frame.url) : 'unknown';
      mainLogger.info('DeviceManager.select-usb-device', {
        origin,
        deviceCount: details.deviceList.length,
      });

      const devices: DeviceInfo[] = details.deviceList.map((d) => ({
        deviceId: d.deviceId,
        name: d.productName || `USB Device ${hexId(d.vendorId ?? 0)}:${hexId(d.productId ?? 0)}`,
        vendorId: hexId(d.vendorId ?? 0),
        productId: hexId(d.productId ?? 0),
      }));

      for (const dev of devices) {
        if (this.store.isGranted('usb', origin, dev.deviceId)) {
          mainLogger.info('DeviceManager.usb.autoGrant', { origin, deviceId: dev.deviceId });
          callback(dev.deviceId);
          return;
        }
      }

      if (devices.length === 0) {
        mainLogger.info('DeviceManager.usb.noDevices', { origin });
        callback('');
        return;
      }

      this.showPicker('usb', origin, devices, callback);
    });

    ses.on('usb-device-revoked', (_event, details) => {
      const origin = details.origin ?? 'unknown';
      mainLogger.info('DeviceManager.usb-device-revoked', { origin, deviceId: details.device?.deviceId });
      if (details.device?.deviceId) {
        this.store.revoke('usb', origin, details.device.deviceId);
      }
    });

    // Device permission check handler — grants previously-stored devices
    ses.setDevicePermissionHandler((details) => {
      const { deviceType, origin, device } = details;
      const apiType = deviceType as DeviceApiType;
      const deviceId = (device as { deviceId?: string; portId?: string }).deviceId
        ?? (device as { portId?: string }).portId
        ?? '';
      const granted = this.store.isGranted(apiType, origin, deviceId);
      mainLogger.debug('DeviceManager.devicePermissionCheck', { apiType, origin, deviceId, granted });
      return granted;
    });

    mainLogger.info('DeviceManager.attachToSession.done');
  }

  /**
   * Called from TabManager (or wherever) when a new WebContents is created,
   * to wire up the Bluetooth picker for that tab.
   */
  attachToWebContents(wc: WebContents): void {
    wc.on('select-bluetooth-device', (event, devices, callback) => {
      event.preventDefault();
      const origin = this.extractOrigin(wc.getURL());
      mainLogger.info('DeviceManager.select-bluetooth-device', {
        origin,
        deviceCount: devices.length,
      });

      const deviceInfos: DeviceInfo[] = devices.map((d) => ({
        deviceId: d.deviceId,
        name: d.deviceName || d.deviceId,
      }));

      for (const dev of deviceInfos) {
        if (this.store.isGranted('bluetooth', origin, dev.deviceId)) {
          mainLogger.info('DeviceManager.bluetooth.autoGrant', { origin, deviceId: dev.deviceId });
          callback(dev.deviceId);
          return;
        }
      }

      if (deviceInfos.length === 0) {
        mainLogger.info('DeviceManager.bluetooth.noDevices', { origin });
        callback('');
        return;
      }

      this.showPicker('bluetooth', origin, deviceInfos, callback);
    });
  }

  // ---------------------------------------------------------------------------
  // Picker lifecycle
  // ---------------------------------------------------------------------------

  private showPicker(
    apiType: DeviceApiType,
    origin: string,
    devices: DeviceInfo[],
    callback: (deviceId: string) => void,
  ): void {
    const id = `device-${++this.pickerCounter}`;
    const request: DevicePickerRequest = { id, apiType, origin, devices };

    this.pending.set(id, { request, callback });
    mainLogger.info('DeviceManager.showPicker', { id, apiType, origin, deviceCount: devices.length });

    const win = this.getShellWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
      mainLogger.warn('DeviceManager.showPicker.noWindow', { id });
      callback('');
      this.pending.delete(id);
      return;
    }

    win.webContents.send('device-picker-request', request);
  }

  /** Called from IPC when the user selects a device or cancels */
  handleResponse(pickerId: string, deviceId: string | null): void {
    const p = this.pending.get(pickerId);
    if (!p) {
      mainLogger.warn('DeviceManager.handleResponse.notFound', { pickerId });
      return;
    }
    this.pending.delete(pickerId);

    if (!deviceId) {
      mainLogger.info('DeviceManager.handleResponse.cancelled', { pickerId });
      p.callback('');
      return;
    }

    const chosen = p.request.devices.find((d) => d.deviceId === deviceId);
    mainLogger.info('DeviceManager.handleResponse.granted', {
      pickerId,
      apiType: p.request.apiType,
      origin: p.request.origin,
      deviceId,
      name: chosen?.name,
    });

    // Persist the grant
    this.store.grant({
      apiType: p.request.apiType,
      origin: p.request.origin,
      deviceId,
      name: chosen?.name ?? deviceId,
      vendorId: chosen?.vendorId,
      productId: chosen?.productId,
    });

    p.callback(deviceId);
  }

  /** Dismiss a picker without a user decision (e.g. tab navigated away) */
  dismissPicker(pickerId: string): void {
    const p = this.pending.get(pickerId);
    if (p) {
      mainLogger.info('DeviceManager.dismissPicker', { pickerId });
      p.callback('');
      this.pending.delete(pickerId);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractOrigin(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }
}
