/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { JourneysPage } from '../../../src/renderer/history/JourneysPage';

declare global {
  var historyAPI: {
    journeys: (opts?: { query?: string; limit?: number; offset?: number }) => Promise<{
      clusters: Array<{
        id: string;
        label: string;
        domain: string;
        entries: Array<{
          id: string;
          url: string;
          title: string;
          visitTime: number;
          favicon: string | null;
        }>;
        startTime: number;
        endTime: number;
      }>;
      totalCount: number;
    }>;
    remove: (id: string) => Promise<boolean>;
    removeCluster: (clusterId: string) => Promise<number>;
    navigateTo: (url: string) => Promise<void>;
  };
}

const journeys = vi.fn();
const remove = vi.fn();
const removeCluster = vi.fn();
const navigateTo = vi.fn();

const BASE = 1_700_000_000_000;

function makeClusters() {
  return [
    {
      id: 'cluster-github',
      label: 'GitHub — 2 pages',
      domain: 'github.com',
      startTime: BASE,
      endTime: BASE + 5 * 60 * 1000,
      entries: [
        {
          id: 'gh-1',
          url: 'https://github.com/Cheggin/browser/pulls',
          title: 'Pull requests',
          visitTime: BASE,
          favicon: null,
        },
        {
          id: 'gh-2',
          url: 'https://github.com/Cheggin/browser/issues',
          title: 'Issues',
          visitTime: BASE + 5 * 60 * 1000,
          favicon: null,
        },
      ],
    },
    {
      id: 'cluster-news',
      label: 'Hacker News — 2 pages',
      domain: 'news.ycombinator.com',
      startTime: BASE + 60 * 60 * 1000,
      endTime: BASE + 65 * 60 * 1000,
      entries: [
        {
          id: 'hn-1',
          url: 'https://news.ycombinator.com/item?id=1',
          title: 'Top story',
          visitTime: BASE + 60 * 60 * 1000,
          favicon: null,
        },
        {
          id: 'hn-2',
          url: 'https://news.ycombinator.com/item?id=2',
          title: 'Comments',
          visitTime: BASE + 65 * 60 * 1000,
          favicon: null,
        },
      ],
    },
  ];
}

function setJourneysResponse(clusters = makeClusters()) {
  journeys.mockImplementation(async (opts?: { query?: string }) => {
    const query = opts?.query?.trim().toLowerCase();
    const filtered = clusters.filter((cluster) => {
      if (!query) return true;
      return (
        cluster.label.toLowerCase().includes(query) ||
        cluster.domain.toLowerCase().includes(query) ||
        cluster.entries.some((entry) =>
          entry.title.toLowerCase().includes(query) ||
          entry.url.toLowerCase().includes(query),
        )
      );
    });
    return { clusters: filtered, totalCount: filtered.length };
  });
}

describe('JourneysPage', () => {
  beforeEach(() => {
    cleanup();
    journeys.mockReset();
    remove.mockReset();
    removeCluster.mockReset();
    navigateTo.mockReset();

    setJourneysResponse();

    globalThis.historyAPI = {
      journeys,
      remove,
      removeCluster,
      navigateTo,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders collapsed journey cards with cluster metadata', async () => {
    setJourneysResponse([makeClusters()[0]]);
    render(<JourneysPage />);

    await waitFor(() => {
      expect(journeys).toHaveBeenCalledWith({ query: undefined, limit: 30, offset: 0 });
    });

    expect(await screen.findByText('GitHub — 2 pages')).toBeTruthy();
    expect(screen.getAllByText(/2 pages/i).length).toBeGreaterThan(0);
    const expand = screen.getByRole('button', { name: /expand cluster/i });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Pull requests')).toBeNull();
  });

  it('expands a cluster to render entries and navigates when an entry is clicked', async () => {
    setJourneysResponse([makeClusters()[0]]);
    render(<JourneysPage />);

    const expand = await screen.findByRole('button', { name: /expand cluster/i });
    fireEvent.click(expand);

    await waitFor(() => {
      expect(expand.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Pull requests')).toBeTruthy();
      expect(screen.getAllByText('github.com').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText('Issues'));
    expect(navigateTo).toHaveBeenCalledWith('https://github.com/Cheggin/browser/issues');
  });

  it('filters rendered clusters through the search box after the debounce', async () => {
    setJourneysResponse();
    render(<JourneysPage />);

    const input = screen.getByLabelText(/search journeys/i);
    fireEvent.change(input, { target: { value: 'github' } });

    await waitFor(() => {
      const lastCall = journeys.mock.calls[journeys.mock.calls.length - 1]?.[0];
      expect(lastCall).toEqual({ query: 'github', limit: 30, offset: 0 });
      expect(screen.getByText('GitHub — 2 pages')).toBeTruthy();
      expect(screen.queryByText('Hacker News — 2 pages')).toBeNull();
    });
  });
});
