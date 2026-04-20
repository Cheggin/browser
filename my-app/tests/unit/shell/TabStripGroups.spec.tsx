// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../src/renderer/shell/TabHoverCard', () => ({
  TabHoverCard: () => null,
}));

import { TabStrip } from '../../../src/renderer/shell/TabStrip';

declare global {
  var electronAPI: any;
  var ResizeObserver: any;
}

function makeTab(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Example Tab ${id}`,
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

describe('TabStrip tab-group UI', () => {
  beforeEach(() => {
    cleanup();
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('collapses a tab group and hides its non-active tabs', async () => {
    const update = vi.fn(async () => undefined);
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
        list: vi.fn(async () => [{ id: 'group-1', name: 'Grouped', color: 'blue', tabIds: ['tab-1', 'tab-2'], collapsed: true }]),
        onUpdated: vi.fn(() => () => undefined),
        create: vi.fn(async () => undefined),
        update,
        addTab: vi.fn(async () => undefined),
        removeTab: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
    };

    render(
      <TabStrip
        tabs={[makeTab('tab-1'), makeTab('tab-2')]}
        activeTabId="tab-1"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
        onMove={vi.fn()}
        onMuteToggle={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Grouped')).toBeTruthy();
    });
    expect(screen.getByText('Example Tab tab-1')).toBeTruthy();
    expect(screen.queryByText('Example Tab tab-2')).toBeNull();

    fireEvent.click(screen.getByText('Grouped'));
    expect(update).toHaveBeenCalledWith({ id: 'group-1', patch: { collapsed: false } });
  });

  it('opens the rename flow from the group context menu and saves the new name', async () => {
    const update = vi.fn(async () => undefined);
    globalThis.electronAPI = {
      tabs: {
        showContextMenu: vi.fn(async () => undefined),
        muteTab: vi.fn(async () => undefined),
        captureThumbnail: vi.fn(async () => null),
        pin: vi.fn(async () => undefined),
        unpin: vi.fn(async () => undefined),
        moveToNewWindow: vi.fn(async () => false),
        create: vi.fn(async () => 'new-tab'),
        close: vi.fn(async () => undefined),
      },
      tabGroups: {
        list: vi.fn(async () => [{ id: 'group-1', name: 'Grouped', color: 'blue', tabIds: ['tab-1'], collapsed: false }]),
        onUpdated: vi.fn(() => () => undefined),
        create: vi.fn(async () => undefined),
        update,
        addTab: vi.fn(async () => undefined),
        removeTab: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
    };

    render(
      <TabStrip
        tabs={[makeTab('tab-1')]}
        activeTabId="tab-1"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
        onMove={vi.fn()}
        onMuteToggle={vi.fn()}
      />,
    );

    const chip = await screen.findByText('Grouped');
    fireEvent.contextMenu(chip, { clientX: 10, clientY: 10 });

    const renameButton = await screen.findByText('Rename');
    fireEvent.click(renameButton);

    const input = screen.getByPlaceholderText(/group name/i);
    fireEvent.change(input, { target: { value: 'Renamed Group' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ id: 'group-1', patch: { name: 'Renamed Group' } });
    });
  });
});
