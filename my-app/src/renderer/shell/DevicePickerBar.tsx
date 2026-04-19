/**
 * DevicePickerBar — Chrome-parity device-selection infobar.
 *
 * Shown when a site calls navigator.usb.requestDevice(), navigator.hid.requestDevice(),
 * navigator.serial.requestPort(), or navigator.bluetooth.requestDevice().
 *
 * Lists available devices with name/id, lets the user pick one or cancel.
 * Granted devices are remembered until device.forget() or site revoke.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { usePopupLayer } from './PopupLayerContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_LABELS: Record<string, string> = {
  usb: 'USB',
  hid: 'HID',
  serial: 'Serial',
  bluetooth: 'Bluetooth',
};

const API_ICONS: Record<string, string> = {
  usb: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z',
  hid: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  serial: 'M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2zm4-8h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2zM3 3v18h18V3H3zm16 16H5V5h14v14z',
  bluetooth: 'M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeviceInfo {
  deviceId: string;
  name: string;
  vendorId?: string;
  productId?: string;
}

interface DevicePickerRequest {
  id: string;
  apiType: string;
  origin: string;
  devices: DeviceInfo[];
}

declare const electronAPI: {
  devicePicker: {
    respond: (pickerId: string, deviceId: string | null) => Promise<void>;
    dismiss: (pickerId: string) => Promise<void>;
  };
  on: {
    devicePickerRequest: (cb: (req: DevicePickerRequest) => void) => () => void;
    devicePickerDismiss: (cb: (pickerId: string) => void) => () => void;
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DevicePickerBar(): React.ReactElement | null {
  const [requests, setRequests] = useState<DevicePickerRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    const unsubRequest = electronAPI.on.devicePickerRequest((req) => {
      console.log('[DevicePickerBar] Received picker request:', req.id, req.apiType, req.origin);
      setRequests((prev) => {
        if (prev.some((r) => r.id === req.id)) return prev;
        return [...prev, req];
      });
      // Pre-select first device
      setSelectedId(req.devices[0]?.deviceId ?? '');
    });

    const unsubDismiss = electronAPI.on.devicePickerDismiss((pickerId) => {
      console.log('[DevicePickerBar] Dismissed:', pickerId);
      setRequests((prev) => prev.filter((r) => r.id !== pickerId));
    });

    return () => {
      unsubRequest();
      unsubDismiss();
    };
  }, []);

  const current = requests[0] ?? null;

  const handleConnect = useCallback(() => {
    if (!current || !selectedId) return;
    console.log('[DevicePickerBar] Connect:', current.id, selectedId);
    void electronAPI.devicePicker.respond(current.id, selectedId);
    setRequests((prev) => prev.filter((r) => r.id !== current.id));
    setSelectedId('');
  }, [current, selectedId]);

  const handleCancel = useCallback(() => {
    if (!current) return;
    console.log('[DevicePickerBar] Cancel:', current.id);
    void electronAPI.devicePicker.dismiss(current.id);
    setRequests((prev) => prev.filter((r) => r.id !== current.id));
    setSelectedId('');
  }, [current]);

  usePopupLayer({
    id: 'device-picker-bar',
    type: 'bar',
    height: 200,
    onDismiss: () => { handleCancel(); },
    isOpen: requests.length > 0,
  });

  if (!current) return null;

  const apiLabel = API_LABELS[current.apiType] ?? current.apiType;
  const iconPath = API_ICONS[current.apiType] ?? API_ICONS.usb;

  let displayOrigin = current.origin;
  try {
    displayOrigin = new URL(current.origin).hostname;
  } catch { /* use raw origin */ }

  return (
    <div className="device-picker-bar" role="dialog" aria-label={`Connect ${apiLabel} device for ${displayOrigin}`}>
      <div className="device-picker-bar__header">
        <svg
          className="device-picker-bar__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={iconPath} />
        </svg>
        <span className="device-picker-bar__title">
          <strong>{displayOrigin}</strong> wants to connect to a {apiLabel} device
        </span>
        <button
          type="button"
          className="device-picker-bar__dismiss"
          onClick={handleCancel}
          aria-label="Cancel device connection"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="device-picker-bar__body">
        <div className="device-picker-bar__list" role="listbox" aria-label="Available devices">
          {current.devices.map((device) => (
            <label
              key={device.deviceId}
              className={`device-picker-bar__item${selectedId === device.deviceId ? ' device-picker-bar__item--selected' : ''}`}
            >
              <input
                type="radio"
                name={`device-picker-${current.id}`}
                value={device.deviceId}
                checked={selectedId === device.deviceId}
                onChange={() => setSelectedId(device.deviceId)}
                className="device-picker-bar__radio"
              />
              <span className="device-picker-bar__item-name">{device.name}</span>
              {(device.vendorId || device.productId) && (
                <span className="device-picker-bar__item-ids">
                  {[device.vendorId, device.productId].filter(Boolean).join(':')}
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="device-picker-bar__actions">
          <button
            type="button"
            className="permission-bar__btn permission-bar__btn--secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="permission-bar__btn permission-bar__btn--primary"
            onClick={handleConnect}
            disabled={!selectedId}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
