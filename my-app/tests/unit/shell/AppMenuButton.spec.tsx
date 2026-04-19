// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AppMenuButton } from '../../../src/renderer/shell/AppMenuButton';

declare global {
  var electronAPI: {
    shell: {
      getPlatform: () => Promise<string>;
    };
    menu: {
      showAppMenu: (bounds: { x: number; y: number }) => Promise<void>;
    };
  };
}

const getPlatform = vi.fn<() => Promise<string>>();
const showAppMenu = vi.fn<(bounds: { x: number; y: number }) => Promise<void>>();

beforeEach(() => {
  getPlatform.mockReset();
  showAppMenu.mockReset();
  globalThis.electronAPI = {
    shell: { getPlatform },
    menu: { showAppMenu },
  };
});

afterEach(() => {
  cleanup();
});

describe('AppMenuButton', () => {
  it('renders on non-macOS and invokes the native app menu with button bounds', async () => {
    getPlatform.mockResolvedValueOnce('win32');
    showAppMenu.mockResolvedValueOnce();

    render(<AppMenuButton />);

    const button = await screen.findByRole('button', { name: /app menu/i });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      top: 10,
      right: 240,
      bottom: 30,
      left: 200,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(button);

    expect(showAppMenu).toHaveBeenCalledWith({ x: 40, y: 34 });
  });

  it('stays hidden on macOS', async () => {
    getPlatform.mockResolvedValueOnce('darwin');

    render(<AppMenuButton />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /app menu/i })).toBeNull();
    });
  });
});
