// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../../../src/renderer/shell/TabHoverCard', () => ({
  TabHoverCard: () => null,
}));

import { TabStrip } from '../../../src/renderer/shell/TabStrip';

declare global {
  var electronAPI: any;
  var ResizeObserver: any;
}

function makeTab(id: string) {
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
  };
}

describe('TabStrip overflow behavior', () => {
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
      constructor(private callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect() {}
    };

    const original = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function () {
        const element = this as HTMLElement;
        if (element.classList.contains('tab-item')) {
          return { width: 50, height: 32, top: 0, left: 0, right: 50, bottom: 32, x: 0, y: 0, toJSON() {} };
        }
        if (element.classList.contains('tab-strip__tabs')) {
          return { width: 80, height: 40, top: 0, left: 0, right: 80, bottom: 40, x: 0, y: 0, toJSON() {} };
        }
        return original.call(element);
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('switches tabs into icon-only mode and shows the search button when tabs are too narrow', async () => {
    const { container } = render(
      <TabStrip
        tabs={[makeTab('1'), makeTab('2'), makeTab('3')]}
        activeTabId="1"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
        onMove={vi.fn()}
        onMuteToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /search tabs/i })).toBeTruthy();
    expect(container.querySelectorAll('.tab-item--icon-only').length).toBeGreaterThan(0);
  });
});
