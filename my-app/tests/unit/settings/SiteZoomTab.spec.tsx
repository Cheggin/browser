// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ToastProvider } from '../../../src/renderer/components/base';
import { SiteZoomTab } from '../../../src/renderer/settings/SettingsApp';

declare global {
  interface Window {
    settingsAPI: {
      getZoomOverrides: () => Promise<Array<{ origin: string; zoomLevel: number }>>;
      removeZoomOverride: (origin: string) => Promise<boolean>;
      clearAllZoomOverrides: () => Promise<void>;
    };
  }
}

const getZoomOverrides = vi.fn<
  () => Promise<Array<{ origin: string; zoomLevel: number }>>
>();
const removeZoomOverride = vi.fn<(origin: string) => Promise<boolean>>();
const clearAllZoomOverrides = vi.fn<() => Promise<void>>();

function renderSiteZoomTab(): void {
  render(
    <ToastProvider>
      <SiteZoomTab />
    </ToastProvider>,
  );
}

describe('SiteZoomTab', () => {
  beforeEach(() => {
    cleanup();
    getZoomOverrides.mockReset();
    removeZoomOverride.mockReset();
    clearAllZoomOverrides.mockReset();

    window.settingsAPI = {
      getZoomOverrides,
      removeZoomOverride,
      clearAllZoomOverrides,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('lists persisted per-site zoom overrides', async () => {
    getZoomOverrides.mockResolvedValueOnce([
      { origin: 'https://docs.example.com', zoomLevel: 1 },
      { origin: 'https://mail.example.com', zoomLevel: -0.5 },
    ]);

    renderSiteZoomTab();

    await waitFor(() => {
      expect(screen.getByText('https://docs.example.com')).toBeTruthy();
    });

    expect(screen.getByText('120%')).toBeTruthy();
    expect(screen.getByText('91%')).toBeTruthy();
  });

  it('removes a single override through settingsAPI.removeZoomOverride', async () => {
    getZoomOverrides.mockResolvedValueOnce([
      { origin: 'https://docs.example.com', zoomLevel: 1 },
    ]);
    removeZoomOverride.mockResolvedValueOnce(true);

    renderSiteZoomTab();

    await waitFor(() => {
      expect(screen.getByText('https://docs.example.com')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(removeZoomOverride).toHaveBeenCalledWith('https://docs.example.com');
      expect(screen.queryByText('https://docs.example.com')).toBeNull();
    });
  });

  it('clears all overrides through settingsAPI.clearAllZoomOverrides', async () => {
    getZoomOverrides.mockResolvedValueOnce([
      { origin: 'https://docs.example.com', zoomLevel: 1 },
      { origin: 'https://mail.example.com', zoomLevel: -0.5 },
    ]);
    clearAllZoomOverrides.mockResolvedValueOnce();

    renderSiteZoomTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clear all overrides/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /clear all overrides/i }));

    await waitFor(() => {
      expect(clearAllZoomOverrides).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/no per-site zoom overrides saved/i)).toBeTruthy();
    });
  });
});
