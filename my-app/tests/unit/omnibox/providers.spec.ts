import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipboard } from 'electron';

import {
  getCustomKeywordEngines,
  keywordProvider,
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
  bookmarkEntries: [],
  shortcuts: [],
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
