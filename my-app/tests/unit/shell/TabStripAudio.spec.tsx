// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

vi.mock('../../../src/renderer/shell/TabHoverCard', () => ({
  TabHoverCard: () => null,
}));

import { TabStrip } from '../../../src/renderer/shell/TabStrip';

declare global {
  var electronAPI: any;
  var ResizeObserver: any;
}

function makeTab(overrides: Partial<any> = {}) {
  return {
    id: 'tab-1',
    url: 'https://example.com',
    title: 'Example',
    favicon: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    zoomLevel: 0,
    pinned: false,
    audible: false,
    muted: false,
    ...overrides,
  };
}

describe('TabStrip audio and mute UI', () => {
  beforeEach(() => {
    cleanup();
    globalThis.electronAPI = {
      tabs: {
        showContextMenu: vi.fn(async () => undefined),
        muteTab: vi.fn(async () => undefined),
        captureThumbnail: vi.fn(async () => null),
        pin: vi.fn(async () => undefined),
        unpin: vi.fn(async () => undefined),
        moveToNewWindow: vi.fn(async () => false),
      },
      tabGroups: {
        list: vi.fn(async () => []),
        onUpdated: vi.fn(() => () => undefined),
        create: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
        addTab: vi.fn(async () => undefined),
        removeTab: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
    };
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the speaker icon when a tab is audible and calls mute toggle on click', () => {
    const onMuteToggle = vi.fn();
    const { container } = render(
      <TabStrip
        tabs={[makeTab({ audible: true })]}
        activeTabId="tab-1"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
        onMove={vi.fn()}
        onMuteToggle={onMuteToggle}
      />,
    );

    const audioIcon = container.querySelector('.tab-item__audio-icon');
    const faviconButton = container.querySelector('.tab-item__favicon--audio');

    expect(audioIcon).toBeTruthy();
    expect(faviconButton?.getAttribute('title')).toBe('Mute tab');

    fireEvent.click(faviconButton!);
    expect(onMuteToggle).toHaveBeenCalledWith('tab-1');
  });

  it('renders the muted icon and unmute affordance when a tab is muted', () => {
    const { container } = render(
      <TabStrip
        tabs={[makeTab({ muted: true })]}
        activeTabId="tab-1"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
        onMove={vi.fn()}
        onMuteToggle={vi.fn()}
      />,
    );

    expect(container.querySelector('.tab-item__audio-icon--muted')).toBeTruthy();
    expect(container.querySelector('.tab-item__favicon--audio')?.getAttribute('title')).toBe('Unmute tab');
  });
});
