import { EventEmitter } from 'node:events';
import https from 'node:https';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipboard } from 'electron';

import {
  featuredSearchProvider,
  getCustomKeywordEngines,
  keywordProvider,
  searchProvider,
  setCustomKeywordEngines,
  zeroSuggestProvider,
} from '../../../src/main/omnibox/providers';

const providerContext = {
  historyEntries: [
    {
      id: 'hist-1',
      url: 'https://history.example.com/recent',
      title: 'Recent history entry',
      visitTime: Date.now(),
      favicon: null,
    },
  ],
  bookmarkEntries: [
    {
      id: 'bookmark-1',
      parentId: 'root',
      type: 'bookmark',
      name: 'Bookmark Match',
      url: 'https://bookmarks.example.com/match',
      dateAdded: Date.now(),
      dateGroupModified: null,
      index: 0,
      children: [],
    },
  ],
  shortcutEntries: [],
  openTabs: [
    {
      title: 'Current open tab',
      url: 'https://tabs.example.com/current',
    },
  ],
};

afterEach(() => {
  setCustomKeywordEngines({});
  vi.restoreAllMocks();
});

describe('omnibox keywordProvider', () => {
  it('supports custom-engine keyword mode for non-default search engines', () => {
    setCustomKeywordEngines({
      '@docs': {
        name: 'Docs Search',
        template: 'https://docs.example.com/search?q=%s',
      },
    });

    const modeHint = keywordProvider('@docs');
    expect(modeHint).toHaveLength(1);
    expect(modeHint[0]).toMatchObject({
      type: 'keyword',
      title: 'Search Docs Search',
      description: 'Press Tab to search Docs Search',
      allowTabCompletion: true,
    });

    const queryResult = keywordProvider('@docs browser tabs');
    expect(queryResult).toHaveLength(1);
    expect(queryResult[0]).toMatchObject({
      type: 'keyword',
      title: 'Docs Search: browser tabs',
      url: 'https://docs.example.com/search?q=browser%20tabs',
    });
  });

  it('exposes the configured custom keyword registry for main-process wiring', () => {
    setCustomKeywordEngines({
      '@ms': {
        name: 'My Search',
        template: 'https://search.example.com/?q=%s',
      },
    });

    expect(getCustomKeywordEngines()).toEqual({
      '@ms': {
        name: 'My Search',
        template: 'https://search.example.com/?q=%s',
      },
    });
  });
});

describe('omnibox zeroSuggestProvider', () => {
  it('returns the clipboard URL first when the input is empty', () => {
    vi.spyOn(clipboard, 'readText').mockReturnValue('https://clipboard.example.com/path');

    const suggestions = zeroSuggestProvider('', providerContext);

    expect(suggestions[0]).toMatchObject({
      id: 'zero-clipboard',
      url: 'https://clipboard.example.com/path',
      description: 'Clipboard',
      allowTabCompletion: true,
    });
    expect(suggestions[1]).toMatchObject({
      id: 'zero-history-hist-1',
      url: 'https://history.example.com/recent',
    });
  });

  it('skips zero-suggest results once the user has typed input', () => {
    vi.spyOn(clipboard, 'readText').mockReturnValue('https://clipboard.example.com/path');

    expect(zeroSuggestProvider('typed', providerContext)).toEqual([]);
  });
});

describe('omnibox featuredSearchProvider', () => {
  it('returns the featured starter list when the user types just @', () => {
    const suggestions = featuredSearchProvider('@', providerContext);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      'featured-tabs',
      'featured-bookmarks',
      'featured-history',
    ]);
  });

  it('returns open-tab matches for @tabs queries and bookmark/history starters when query is empty', () => {
    const tabSuggestions = featuredSearchProvider('@tabs current', providerContext);
    expect(tabSuggestions).toHaveLength(1);
    expect(tabSuggestions[0]).toMatchObject({
      title: 'Current open tab',
      url: 'https://tabs.example.com/current',
      description: 'Open tab: https://tabs.example.com/current',
    });

    const bookmarkStarter = featuredSearchProvider('@bookmarks ', providerContext);
    expect(bookmarkStarter).toHaveLength(1);
    expect(bookmarkStarter[0].id).toBe('featured-bookmarks');

    const historyStarter = featuredSearchProvider('@history ', providerContext);
    expect(historyStarter).toHaveLength(1);
    expect(historyStarter[0].id).toBe('featured-history');
  });
});

describe('omnibox searchProvider', () => {
  it('maps remote suggest results into ranked search suggestions', async () => {
    vi.spyOn(https, 'get').mockImplementation(((url: string, cb: (res: EventEmitter) => void) => {
      const response = new EventEmitter();
      cb(response);
      queueMicrotask(() => {
        response.emit('data', JSON.stringify(['bro', ['browser tabs', 'browser history']]));
        response.emit('end');
      });
      return { on: vi.fn() } as any;
    }) as any);

    const suggestions = await searchProvider('bro');

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      type: 'search',
      title: 'browser tabs',
      url: 'https://www.google.com/search?q=browser%20tabs',
      relevance: 600,
    });
    expect(suggestions[1]).toMatchObject({
      title: 'browser history',
      relevance: 550,
    });
  });

  it('returns no remote suggestions for URL-looking input', async () => {
    const getSpy = vi.spyOn(https, 'get');

    await expect(searchProvider('https://example.com')).resolves.toEqual([]);
    expect(getSpy).not.toHaveBeenCalled();
  });
});
