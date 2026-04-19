/**
 * DeviceStore — persistent storage for user-granted device access.
 *
 * Tracks which origin has been granted access to which USB/HID/Serial/Bluetooth
 * device. Follows the same debounced-atomic-write pattern as PermissionStore.
 *
 * Entries are removed when the site calls device.forget() or the user
 * revokes access from chrome://settings/content/usbDevices (etc.).
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { mainLogger } from '../logger';

const DEVICES_FILE_NAME = 'granted-devices.json';
const DEBOUNCE_MS = 300;

export type DeviceApiType = 'usb' | 'hid' | 'serial' | 'bluetooth';

export interface GrantedDevice {
  /** API type that owns this grant */
  apiType: DeviceApiType;
  /** Origin that was granted access */
  origin: string;
  /** Stable device identifier (deviceId / portId) */
  deviceId: string;
  /** Human-readable name shown in the settings list */
  name: string;
  /** USB vendor ID (hex string, e.g. "0x1234"); undefined for Bluetooth/Serial */
  vendorId?: string;
  /** USB product ID (hex string); undefined for Bluetooth/Serial */
  productId?: string;
  /** Unix ms timestamp of when access was granted */
  grantedAt: number;
}

interface PersistedDevices {
  version: 1;
  devices: GrantedDevice[];
}

function makeEmpty(): PersistedDevices {
  return { version: 1, devices: [] };
}

export class DeviceStore {
  private readonly filePath: string;
  private state: PersistedDevices;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(dataDir?: string) {
    this.filePath = path.join(dataDir ?? app.getPath('userData'), DEVICES_FILE_NAME);
    mainLogger.info('DeviceStore.constructor', { filePath: this.filePath });
    this.state = this.load();
    mainLogger.info('DeviceStore.init', { deviceCount: this.state.devices.length });
  }

  private load(): PersistedDevices {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedDevices;
      if (parsed.version !== 1 || !Array.isArray(parsed.devices)) {
        mainLogger.warn('DeviceStore.load.invalid', { msg: 'Resetting device grants' });
        return makeEmpty();
      }
      mainLogger.info('DeviceStore.load.ok', { deviceCount: parsed.devices.length });
      return parsed;
    } catch {
      mainLogger.info('DeviceStore.load.fresh', { msg: 'No granted-devices.json — starting fresh' });
      return makeEmpty();
    }
  }

  private schedulePersist(): void {
    this.dirty = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flushSync(), DEBOUNCE_MS);
  }

  flushSync(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
      mainLogger.info('DeviceStore.flushSync.ok');
    } catch (err) {
      mainLogger.error('DeviceStore.flushSync.failed', { error: (err as Error).message });
    }
    this.dirty = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  isGranted(apiType: DeviceApiType, origin: string, deviceId: string): boolean {
    return this.state.devices.some(
      (d) => d.apiType === apiType && d.origin === origin && d.deviceId === deviceId,
    );
  }

  getAll(): GrantedDevice[] {
    return [...this.state.devices];
  }

  getForApi(apiType: DeviceApiType): GrantedDevice[] {
    return this.state.devices.filter((d) => d.apiType === apiType);
  }

  getForOrigin(origin: string): GrantedDevice[] {
    return this.state.devices.filter((d) => d.origin === origin);
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  grant(device: Omit<GrantedDevice, 'grantedAt'>): void {
    const existing = this.state.devices.find(
      (d) => d.apiType === device.apiType && d.origin === device.origin && d.deviceId === device.deviceId,
    );
    if (existing) {
      existing.name = device.name;
      existing.vendorId = device.vendorId;
      existing.productId = device.productId;
      existing.grantedAt = Date.now();
      mainLogger.info('DeviceStore.grant.updated', {
        apiType: device.apiType,
        origin: device.origin,
        deviceId: device.deviceId,
        name: device.name,
      });
    } else {
      this.state.devices.push({ ...device, grantedAt: Date.now() });
      mainLogger.info('DeviceStore.grant.added', {
        apiType: device.apiType,
        origin: device.origin,
        deviceId: device.deviceId,
        name: device.name,
      });
    }
    this.schedulePersist();
  }

  revoke(apiType: DeviceApiType, origin: string, deviceId: string): boolean {
    const before = this.state.devices.length;
    this.state.devices = this.state.devices.filter(
      (d) => !(d.apiType === apiType && d.origin === origin && d.deviceId === deviceId),
    );
    if (this.state.devices.length < before) {
      mainLogger.info('DeviceStore.revoke', { apiType, origin, deviceId });
      this.schedulePersist();
      return true;
    }
    return false;
  }

  revokeForOrigin(origin: string): void {
    const before = this.state.devices.length;
    this.state.devices = this.state.devices.filter((d) => d.origin !== origin);
    if (this.state.devices.length < before) {
      mainLogger.info('DeviceStore.revokeForOrigin', { origin, removed: before - this.state.devices.length });
      this.schedulePersist();
    }
  }

  revokeAll(): void {
    this.state.devices = [];
    mainLogger.info('DeviceStore.revokeAll');
    this.schedulePersist();
  }
}
