// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ToastProvider } from '../../../src/renderer/components/base';
import { SearchEnginesTab } from '../../../src/renderer/settings/SettingsApp';

type SearchEngineEntry = {
  id: string;
  name: string;
  keyword: string;
  searchUrl: string;
  isBuiltIn: boolean;
};

declare global {
  interface Window {
    settingsAPI: {
      listSearchEngines: () => Promise<SearchEngineEntry[]>;
      getDefaultSearchEngine: () => Promise<SearchEngineEntry>;
      setDefaultSearchEngine: (id: string) => Promise<void>;
      addCustomSearchEngine: (p: { name: string; keyword: string; searchUrl: string }) => Promise<SearchEngineEntry>;
      updateCustomSearchEngine: (id: string, p: Partial<{ name: string; keyword: string; searchUrl: string }>) => Promise<boolean>;
      removeCustomSearchEngine: (id: string) => Promise<boolean>;
    };
  }
}

let engines: SearchEngineEntry[] = [];
let defaultId = 'google';

const listSearchEngines = vi.fn<() => Promise<SearchEngineEntry[]>>();
const getDefaultSearchEngine = vi.fn<() => Promise<SearchEngineEntry>>();
const setDefaultSearchEngine = vi.fn<(id: string) => Promise<void>>();
const addCustomSearchEngine = vi.fn<
  (p: { name: string; keyword: string; searchUrl: string }) => Promise<SearchEngineEntry>
>();
const updateCustomSearchEngine = vi.fn<
  (id: string, p: Partial<{ name: string; keyword: string; searchUrl: string }>) => Promise<boolean>
>();
const removeCustomSearchEngine = vi.fn<(id: string) => Promise<boolean>>();

function resetState(): void {
  engines = [
    {
      id: 'google',
      name: 'Google',
      keyword: 'g',
      searchUrl: 'https://www.google.com/search?q=%s',
      isBuiltIn: true,
    },
    {
      id: 'duckduckgo',
      name: 'DuckDuckGo',
      keyword: 'd',
      searchUrl: 'https://duckduckgo.com/?q=%s',
      isBuiltIn: true,
    },
    {
      id: 'custom-1',
      name: 'Docs Search',
      keyword: 'docs',
      searchUrl: 'https://docs.example.com/search?q=%s',
      isBuiltIn: false,
    },
  ];
  defaultId = 'google';
}

function installSettingsApi(): void {
  listSearchEngines.mockImplementation(async () => engines.map((engine) => ({ ...engine })));
  getDefaultSearchEngine.mockImplementation(async () => {
    const match = engines.find((engine) => engine.id === defaultId) ?? engines[0];
    return { ...match };
  });
  setDefaultSearchEngine.mockImplementation(async (id: string) => {
    defaultId = id;
  });
  addCustomSearchEngine.mockImplementation(async (payload) => {
    const engine = {
      id: `custom-${engines.length + 1}`,
      isBuiltIn: false,
      ...payload,
    };
    engines = [...engines, engine];
    return engine;
  });
  updateCustomSearchEngine.mockImplementation(async (id, payload) => {
    engines = engines.map((engine) => (
      engine.id === id
        ? { ...engine, ...payload }
        : engine
    ));
    return true;
  });
  removeCustomSearchEngine.mockImplementation(async (id) => {
    engines = engines.filter((engine) => engine.id !== id);
    if (defaultId === id) {
      defaultId = 'google';
    }
    return true;
  });

  window.settingsAPI = {
    listSearchEngines,
    getDefaultSearchEngine,
    setDefaultSearchEngine,
    addCustomSearchEngine,
    updateCustomSearchEngine,
    removeCustomSearchEngine,
  };
}

function renderTab(): void {
  render(
    <ToastProvider>
      <SearchEnginesTab />
    </ToastProvider>,
  );
}

describe('SearchEnginesTab', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    resetState();
    installSettingsApi();
  });

  afterEach(() => {
    cleanup();
  });

  it('switches the default search engine through settingsAPI', async () => {
    renderTab();

    const target = await screen.findByLabelText(/duckduckgo/i);
    fireEvent.click(target);

    await waitFor(() => {
      expect(setDefaultSearchEngine).toHaveBeenCalledWith('duckduckgo');
      expect((screen.getByLabelText(/duckduckgo/i) as HTMLInputElement).checked).toBe(true);
    });
  });

  it('adds a custom search engine through the settings form', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /add custom engine/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'My Search' } });
    fireEvent.change(screen.getByLabelText(/keyword/i), { target: { value: 'ms' } });
    fireEvent.change(screen.getByLabelText(/search url/i), {
      target: { value: 'https://search.example.com/?q=%s' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(addCustomSearchEngine).toHaveBeenCalledWith({
        name: 'My Search',
        keyword: 'ms',
        searchUrl: 'https://search.example.com/?q=%s',
      });
      expect(screen.getByText('My Search')).toBeTruthy();
    });
  });

  it('edits and deletes a custom search engine through the settings row actions', async () => {
    renderTab();

    const editButton = (await screen.findAllByRole('button', { name: /^edit$/i }))[0];
    fireEvent.click(editButton);

    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Docs Search');

    fireEvent.change(nameInput, { target: { value: 'Docs Search Updated' } });
    fireEvent.change(screen.getByLabelText(/keyword/i), { target: { value: 'docs2' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(updateCustomSearchEngine).toHaveBeenCalledWith('custom-1', {
        name: 'Docs Search Updated',
        keyword: 'docs2',
        searchUrl: 'https://docs.example.com/search?q=%s',
      });
      expect(screen.getByText('Docs Search Updated')).toBeTruthy();
    });

    const deleteButton = (await screen.findAllByRole('button', { name: /^delete$/i }))[0];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(removeCustomSearchEngine).toHaveBeenCalledWith('custom-1');
      expect(screen.queryByText('Docs Search Updated')).toBeNull();
    });
  });
});
