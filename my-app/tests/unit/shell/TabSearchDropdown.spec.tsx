// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';

vi.mock('../../../src/renderer/shell/PopupLayerContext', () => ({
  usePopupLayer: () => undefined,
}));

import { TabSearchDropdown } from '../../../src/renderer/shell/TabSearchDropdown';

declare global {
  var electronAPI: any;
}

function makeTab(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Tab ${id}`,
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

describe('TabSearchDropdown', () => {
  beforeEach(() => {
    cleanup();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    globalThis.electronAPI = {
      tabs: {
        activate: vi.fn(async () => undefined),
      },
      on: {
        openTabSearch: vi.fn(() => () => undefined),
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('filters tabs, floats audible matches first, and activates a selected tab', async () => {
    const onClose = vi.fn();
    render(
      <TabSearchDropdown
        tabs={[
          makeTab('1', { title: 'Docs tab' }),
          makeTab('2', { title: 'Audible docs', audible: true }),
          makeTab('3', { title: 'Other page' }),
        ]}
        activeTabId="1"
        onClose={onClose}
      />,
    );

    const input = screen.getByRole('textbox', { name: /search tabs/i });
    fireEvent.change(input, { target: { value: 'docs' } });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0].textContent).toContain('Audible docs');
      expect(screen.getByLabelText(/playing audio/i)).toBeTruthy();
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(globalThis.electronAPI.tabs.activate).toHaveBeenCalledWith('2');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
