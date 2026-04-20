// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DownloadsPage } from '../../../src/renderer/downloads/DownloadsPage';

declare global {
  var downloadsAPI: {
    getAll: () => Promise<any[]>;
    pause: (id: string) => Promise<void>;
    resume: (id: string) => Promise<void>;
    cancel: (id: string) => Promise<void>;
    openFile: (id: string) => Promise<void>;
    showInFolder: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    clearAll: () => Promise<void>;
    onStateChanged: (cb: (downloads: any[]) => void) => () => void;
  };
  var navigator: Navigator & {
    clipboard: {
      writeText: (text: string) => Promise<void>;
    };
  };
}

const getAll = vi.fn<() => Promise<any[]>>();
const pause = vi.fn<(id: string) => Promise<void>>();
const resume = vi.fn<(id: string) => Promise<void>>();
const cancel = vi.fn<(id: string) => Promise<void>>();
const openFile = vi.fn<(id: string) => Promise<void>>();
const showInFolder = vi.fn<(id: string) => Promise<void>>();
const remove = vi.fn<(id: string) => Promise<void>>();
const clearAll = vi.fn<() => Promise<void>>();
const writeText = vi.fn<(text: string) => Promise<void>>();

function sampleDownloads() {
  return [
    {
      id: 'dl-1',
      filename: 'report.pdf',
      url: 'https://downloads.example.com/report.pdf',
      savePath: '/tmp/report.pdf',
      totalBytes: 1024,
      receivedBytes: 1024,
      status: 'completed',
      startTime: Date.now(),
      endTime: Date.now(),
      openWhenDone: false,
      speed: 0,
      eta: 0,
    },
    {
      id: 'dl-2',
      filename: 'draft.txt',
      url: 'https://notes.example.com/draft.txt',
      savePath: '/tmp/draft.txt',
      totalBytes: 2048,
      receivedBytes: 1024,
      status: 'paused',
      startTime: Date.now(),
      endTime: null,
      openWhenDone: false,
      speed: 0,
      eta: 0,
    },
  ];
}

describe('DownloadsPage', () => {
  beforeEach(() => {
    cleanup();
    getAll.mockReset();
    pause.mockReset();
    resume.mockReset();
    cancel.mockReset();
    openFile.mockReset();
    showInFolder.mockReset();
    remove.mockReset();
    clearAll.mockReset();
    writeText.mockReset();

    globalThis.downloadsAPI = {
      getAll,
      pause,
      resume,
      cancel,
      openFile,
      showInFolder,
      remove,
      clearAll,
      onStateChanged: () => () => undefined,
    };

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('filters downloads by filename and URL search', async () => {
    getAll.mockResolvedValueOnce(sampleDownloads());

    render(<DownloadsPage />);

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeTruthy();
      expect(screen.getByText('draft.txt')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(/search downloads/i), {
      target: { value: 'report' },
    });

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeTruthy();
      expect(screen.queryByText('draft.txt')).toBeNull();
    });
  });

  it('invokes per-item actions for completed and paused downloads', async () => {
    getAll.mockResolvedValueOnce(sampleDownloads());
    openFile.mockResolvedValueOnce();
    showInFolder.mockResolvedValueOnce();
    writeText.mockResolvedValueOnce();
    resume.mockResolvedValueOnce();
    cancel.mockResolvedValueOnce();
    remove.mockResolvedValueOnce();

    render(<DownloadsPage />);

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /show in finder/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /copy download link/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /remove from list/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(showInFolder).toHaveBeenCalledWith('dl-1');
      expect(writeText).toHaveBeenCalledWith('https://downloads.example.com/report.pdf');
      expect(remove).toHaveBeenCalledWith('dl-1');
      expect(resume).toHaveBeenCalledWith('dl-2');
      expect(cancel).toHaveBeenCalledWith('dl-2');
    });
  });
});
