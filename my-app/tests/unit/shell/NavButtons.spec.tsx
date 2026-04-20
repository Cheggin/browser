// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { NavButtons } from '../../../src/renderer/shell/NavButtons';

describe('NavButtons history-menu triggers', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderButtons() {
    const props = {
      canGoBack: true,
      canGoForward: true,
      isLoading: false,
      onBack: vi.fn(),
      onForward: vi.fn(),
      onReload: vi.fn(),
      onBackContextMenu: vi.fn(),
      onForwardContextMenu: vi.fn(),
    };

    render(<NavButtons {...props} />);
    return props;
  }

  it('uses a short back click for navigation instead of the history menu', () => {
    vi.useFakeTimers();
    const props = renderButtons();
    const back = screen.getByRole('button', { name: /go back/i });

    fireEvent.mouseDown(back);
    vi.advanceTimersByTime(200);
    fireEvent.mouseUp(back);

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onBackContextMenu).not.toHaveBeenCalled();
  });

  it('opens the back history menu on long press', () => {
    vi.useFakeTimers();
    const props = renderButtons();
    const back = screen.getByRole('button', { name: /go back/i });

    fireEvent.mouseDown(back);
    vi.advanceTimersByTime(600);
    fireEvent.mouseUp(back);

    expect(props.onBackContextMenu).toHaveBeenCalledTimes(1);
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it('opens the forward history menu on right click', () => {
    const props = renderButtons();
    const forward = screen.getByRole('button', { name: /go forward/i });

    fireEvent.contextMenu(forward);

    expect(props.onForwardContextMenu).toHaveBeenCalledTimes(1);
    expect(props.onForward).not.toHaveBeenCalled();
  });
});
