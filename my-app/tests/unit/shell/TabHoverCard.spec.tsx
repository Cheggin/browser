// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

import { TabHoverCard } from '../../../src/renderer/shell/TabHoverCard';

declare global {
  var electronAPI: any;
}

describe('TabHoverCard', () => {
  beforeEach(() => {
    cleanup();
    globalThis.electronAPI = {
      tabs: {
        captureThumbnail: vi.fn(async () => 'data:image/png;base64,thumb'),
      },
    };
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('requests and renders a thumbnail for the hovered tab', async () => {
    render(
      <TabHoverCard
        tabId="tab-1"
        title="Example Tab"
        url="https://example.com/path"
        anchorRect={{ left: 100, top: 50, bottom: 80, width: 120, height: 30 } as DOMRect}
      />,
    );

    expect(document.querySelector('.tab-hover-card__thumbnail-placeholder')).toBeTruthy();

    await waitFor(() => {
      const img = document.querySelector('.tab-hover-card__thumbnail') as HTMLImageElement | null;
      expect(img).toBeTruthy();
      expect(img?.src).toContain('data:image/png;base64,thumb');
      expect(screen.getByText('example.com')).toBeTruthy();
    });
  });
});
