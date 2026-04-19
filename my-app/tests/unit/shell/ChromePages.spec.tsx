// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';

import { ChromePages } from '../../../src/renderer/chrome/ChromePages';

declare global {
  interface Window {
    chromeAPI: {
      getPage: () => string;
      getVersionInfo: () => Promise<Record<string, string>>;
      getGpuInfo: () => Promise<Record<string, unknown>>;
      getDownloads: () => Promise<Array<Record<string, unknown>>>;
      getAccessibilityInfo: () => Promise<Record<string, unknown>>;
      getSandboxInfo: () => Promise<Record<string, unknown>>;
      navigateTo: (url: string) => Promise<void>;
      openInternalPage: (page: string) => Promise<void>;
      getInspectTargets: () => Promise<{ targets: Array<unknown>; networkTargets: Array<unknown> }>;
      getNetworkTargets: () => Promise<Array<unknown>>;
      addNetworkTarget: (host: string, port: number) => Promise<Array<unknown>>;
      removeNetworkTarget: (host: string, port: number) => Promise<Array<unknown>>;
    };
  }
}

function installChromeApi(page: string): void {
  window.chromeAPI = {
    getPage: () => page,
    getVersionInfo: vi.fn(async () => ({
      appName: 'The Browser',
      appVersion: '1.0.0',
      electronVersion: '41.0.0',
      chromeVersion: '141.0.0',
      nodeVersion: '24.0.0',
      v8Version: '12.0.0',
      osArch: 'arm64',
      osPlatform: 'darwin',
      osVersion: '15.0.0',
      userData: '/tmp/test-user-data',
      execPath: '/Applications/The Browser.app',
      locale: 'en-US',
    })),
    getGpuInfo: vi.fn(async () => ({ vendor: 'Apple' })),
    getDownloads: vi.fn(async () => []),
    getAccessibilityInfo: vi.fn(async () => ({ accessibilitySupportEnabled: true })),
    getSandboxInfo: vi.fn(async () => ({
      sandboxed: true,
      contextIsolated: true,
      nodeIntegration: false,
    })),
    navigateTo: vi.fn(async () => {}),
    openInternalPage: vi.fn(async () => {}),
    getInspectTargets: vi.fn(async () => ({ targets: [], networkTargets: [] })),
    getNetworkTargets: vi.fn(async () => []),
    addNetworkTarget: vi.fn(async () => []),
    removeNetworkTarget: vi.fn(async () => []),
  };
}

describe('chrome:// pages regression checks', () => {
  beforeEach(() => {
    cleanup();
  });

  it('does not label chrome://bookmarks as planned in chrome://about', () => {
    installChromeApi('about');
    render(<ChromePages />);

    const row = screen.getByRole('button', { name: /chrome:\/\/bookmarks/i });
    expect(within(row).queryByText(/planned/i)).toBeNull();
  });

  it('does not render a "not yet available" placeholder for chrome://dino', () => {
    installChromeApi('dino');
    render(<ChromePages />);

    expect(screen.queryByText(/not yet available/i)).toBeNull();
    expect(screen.getByText(/disconnect from the internet to launch the dinosaur game/i)).toBeTruthy();
  });

  it('renders an honest dedicated page for chrome://flags', () => {
    installChromeApi('flags');
    render(<ChromePages />);

    expect(screen.getByRole('heading', { name: /flags/i })).toBeTruthy();
    expect(screen.getByText(/experimental feature controls are limited in the browser today/i)).toBeTruthy();
    expect(screen.getByText(/does not expose searchable experiment toggles, restart-required indicators, or per-flag descriptions/i)).toBeTruthy();
    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });

  it.each([
    'net-internals',
  ])('does not fall back to a generic stub for chrome://%s', (page) => {
    installChromeApi(page);
    render(<ChromePages />);

    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });

  it('renders an honest dedicated page for chrome://components', () => {
    installChromeApi('components');
    render(<ChromePages />);

    expect(screen.getByRole('heading', { name: /components/i })).toBeTruthy();
    expect(screen.getByText(/installed component details are limited in the browser today/i)).toBeTruthy();
    expect(screen.getByText(/does not expose installed component versions, last update checks, or on-demand update controls/i)).toBeTruthy();
    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });

  it('renders an honest dedicated page for chrome://network-errors', () => {
    installChromeApi('network-errors');
    render(<ChromePages />);

    expect(screen.getByRole('heading', { name: /network errors/i })).toBeTruthy();
    expect(screen.getByText(/network error code coverage is limited in the browser today/i)).toBeTruthy();
    expect(screen.getByText(/does not expose the complete net error catalog or the upstream debugging notes that ship with chrome/i)).toBeTruthy();
    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });

  it('renders an honest dedicated page for chrome://net-internals', () => {
    installChromeApi('net-internals');
    render(<ChromePages />);

    expect(screen.getByRole('heading', { name: /net internals/i })).toBeTruthy();
    expect(screen.getByText(/network diagnostics are limited in the browser today/i)).toBeTruthy();
    expect(screen.getByText(/does not expose live socket pools, dns events, proxy resolution traces, or exportable net logs/i)).toBeTruthy();
    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });

  it('renders an honest dedicated page for chrome://policy', () => {
    installChromeApi('policy');
    render(<ChromePages />);

    expect(screen.getByRole('heading', { name: /policy/i })).toBeTruthy();
    expect(screen.getByText(/enterprise policy inspection is limited in the browser today/i)).toBeTruthy();
    expect(screen.getByText(/does not expose active policy values, source precedence, or reload controls/i)).toBeTruthy();
    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });

  it('renders an honest dedicated page for chrome://webrtc-internals', () => {
    installChromeApi('webrtc-internals');
    render(<ChromePages />);

    expect(screen.getByRole('heading', { name: /webrtc internals/i })).toBeTruthy();
    expect(screen.getByText(/connection diagnostics are limited in the browser today/i)).toBeTruthy();
    expect(screen.getByText(/does not expose peer-connection timelines, rtp stats dumps, or downloadable event logs/i)).toBeTruthy();
    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });

  it('renders an honest dedicated page for chrome://media-internals', () => {
    installChromeApi('media-internals');
    render(<ChromePages />);

    expect(screen.getByRole('heading', { name: /media internals/i })).toBeTruthy();
    expect(screen.getByText(/playback diagnostics are limited in the browser today/i)).toBeTruthy();
    expect(screen.getByText(/does not expose per-player events, decoder graphs, or stream logs/i)).toBeTruthy();
    expect(screen.queryByText(/this page is not yet available in the browser/i)).toBeNull();
  });
});
