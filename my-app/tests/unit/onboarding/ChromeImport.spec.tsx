// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/renderer/design/theme.global.css', () => ({}));
vi.mock('../../../src/renderer/design/theme.onboarding.css', () => ({}));
vi.mock('../../../src/renderer/components/base/components.css', () => ({}));
vi.mock('../../../src/renderer/onboarding/onboarding.css', () => ({}));

vi.mock('../../../src/renderer/onboarding/StepIndicator', () => ({
  StepIndicator: ({ step, total }: { step: number; total: number }) => (
    <div data-testid="step-indicator" data-step={step} data-total={total} />
  ),
}));

vi.mock('../../../src/renderer/components/base', () => ({
  KeyHint: ({ keys }: { keys: string[] }) => <span data-testid="key-hint">{keys.join('+')}</span>,
}));

import { ChromeImport } from '../../../src/renderer/onboarding/ChromeImport';

const profile = {
  id: 'chrome:Default',
  name: 'Default',
  email: 'reagan@example.com',
  avatarUrl: '',
  profilePath: '/tmp/Chrome/Default',
  browserName: 'Google Chrome',
  browserPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  displayName: 'Google Chrome - Default',
};

describe('ChromeImport', () => {
  const listProfiles = vi.fn();
  const runImport = vi.fn();
  const onProgress = vi.fn(() => vi.fn());

  beforeEach(() => {
    listProfiles.mockResolvedValue([profile]);
    runImport.mockResolvedValue({
      cookies: { imported: 10, failed: 0, total: 10 },
      bookmarks: { imported: 3, folders: 1 },
    });
    onProgress.mockReturnValue(vi.fn());

    window.chromeImportAPI = {
      listProfiles,
      runImport,
      onProgress,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renders detected browser metadata', async () => {
    render(<ChromeImport onNext={vi.fn()} onSkip={vi.fn()} />);

    expect(await screen.findByText('Google Chrome')).toBeTruthy();
    expect(screen.getByText('reagan@example.com')).toBeTruthy();
  });

  it('passes the full selected profile object to the preload import API', async () => {
    render(<ChromeImport onNext={vi.fn()} onSkip={vi.fn()} />);

    await screen.findByText('Google Chrome');
    fireEvent.click(screen.getByRole('button', { name: /import selected browser profile/i }));

    await waitFor(() => {
      expect(runImport).toHaveBeenCalledWith(profile);
    });
  });
});
