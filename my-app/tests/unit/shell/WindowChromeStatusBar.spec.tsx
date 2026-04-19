// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const linkHoverListeners: Array<(payload: { url: string }) => void> = [];

vi.mock('../../../src/renderer/shell/PopupLayerContext', () => ({
  PopupLayerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function stubComponent(name: string): React.FC<any> {
  return function Stub(props: any) {
    return <div data-testid={name}>{props.children}</div>;
  };
}

vi.mock('../../../src/renderer/shell/TabStrip', () => ({ TabStrip: stubComponent('tab-strip') }));
vi.mock('../../../src/renderer/shell/NavButtons', () => ({ NavButtons: stubComponent('nav-buttons') }));
vi.mock('../../../src/renderer/shell/URLBar', () => ({ URLBar: stubComponent('url-bar') }));
vi.mock('../../../src/renderer/shell/BookmarksBar', () => ({ BookmarksBar: stubComponent('bookmarks-bar') }));
vi.mock('../../../src/renderer/shell/BookmarkDialog', () => ({ BookmarkDialog: stubComponent('bookmark-dialog') }));
vi.mock('../../../src/renderer/shell/BookmarkAllTabsDialog', () => ({ BookmarkAllTabsDialog: stubComponent('bookmark-all-dialog') }));
vi.mock('../../../src/renderer/shell/FindBar', () => ({ FindBar: stubComponent('find-bar') }));
vi.mock('../../../src/renderer/shell/TabSearchDropdown', () => ({ TabSearchDropdown: stubComponent('tab-search') }));
vi.mock('../../../src/renderer/shell/PasswordPromptBar', () => ({ PasswordPromptBar: stubComponent('password-bar') }));
vi.mock('../../../src/renderer/shell/PermissionBar', () => ({ PermissionBar: stubComponent('permission-bar') }));
vi.mock('../../../src/renderer/shell/DevicePickerBar', () => ({ DevicePickerBar: stubComponent('device-bar') }));
vi.mock('../../../src/renderer/shell/ZoomBadge', () => ({ ZoomBadge: stubComponent('zoom-badge') }));
vi.mock('../../../src/renderer/shell/ProfileMenu', () => ({ ProfileMenu: stubComponent('profile-menu') }));
vi.mock('../../../src/renderer/shell/DownloadButton', () => ({ DownloadButton: stubComponent('download-button') }));
vi.mock('../../../src/renderer/shell/DownloadBubble', () => ({ DownloadBubble: stubComponent('download-bubble') }));
vi.mock('../../../src/renderer/shell/AppMenuButton', () => ({ AppMenuButton: stubComponent('app-menu-button') }));
vi.mock('../../../src/renderer/shell/ShareMenu', () => ({
  ShareButton: stubComponent('share-button'),
  ShareMenu: stubComponent('share-menu'),
}));
vi.mock('../../../src/renderer/shell/SidePanel', () => ({
  SidePanel: stubComponent('side-panel'),
  SidePanelToggleButton: stubComponent('side-panel-toggle'),
}));

import { WindowChrome } from '../../../src/renderer/shell/WindowChrome';

declare global {
  var electronAPI: any;
}

beforeEach(() => {
  cleanup();
  linkHoverListeners.length = 0;

  globalThis.electronAPI = {
    tabs: {
      create: vi.fn(async () => 'tab-1'),
      close: vi.fn(async () => undefined),
      activate: vi.fn(async () => undefined),
      move: vi.fn(async () => undefined),
      navigate: vi.fn(async () => undefined),
      navigateActive: vi.fn(async () => undefined),
      back: vi.fn(async () => undefined),
      forward: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
      reloadHard: vi.fn(async () => undefined),
      getState: vi.fn(async () => ({ tabs: [], activeTabId: null })),
      reopenLastClosed: vi.fn(async () => undefined),
      reopenClosedAt: vi.fn(async () => undefined),
      getClosedTabs: vi.fn(async () => []),
      showContextMenu: vi.fn(async () => undefined),
      showBackHistory: vi.fn(async () => undefined),
      showForwardHistory: vi.fn(async () => undefined),
      muteTab: vi.fn(async () => undefined),
    },
    cdp: {
      getActiveTabCdpUrl: vi.fn(async () => null),
      getActiveTabTargetId: vi.fn(async () => null),
    },
    bookmarks: {
      list: vi.fn(async () => ({ roots: [{ children: [] }], visibility: 'always' })),
      isBookmarked: vi.fn(async () => false),
      findByUrl: vi.fn(async () => null),
      setVisibility: vi.fn(async () => 'always'),
      getVisibility: vi.fn(async () => 'always'),
    },
    zoom: {
      getPercent: vi.fn(async () => 100),
      zoomIn: vi.fn(async () => undefined),
      zoomOut: vi.fn(async () => undefined),
      reset: vi.fn(async () => undefined),
      listOverrides: vi.fn(async () => []),
      removeOverride: vi.fn(async () => false),
      clearAll: vi.fn(async () => undefined),
    },
    downloads: {
      getAll: vi.fn(async () => []),
      pause: vi.fn(async () => undefined),
      resume: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      openFile: vi.fn(async () => undefined),
      showInFolder: vi.fn(async () => undefined),
      setOpenWhenDone: vi.fn(async () => undefined),
      clearCompleted: vi.fn(async () => undefined),
      getShowOnComplete: vi.fn(async () => false),
      setShowOnComplete: vi.fn(async () => undefined),
      dismissWarning: vi.fn(async () => undefined),
    },
    shell: {
      setChromeHeight: vi.fn(async () => undefined),
      setContentVisible: vi.fn(async () => undefined),
      setSidePanelWidth: vi.fn(async () => undefined),
      setSidePanelPosition: vi.fn(async () => undefined),
      getPlatform: vi.fn(async () => 'darwin'),
    },
    windowName: { set: vi.fn(async () => undefined) },
    share: {
      copyLink: vi.fn(async () => true),
      emailPage: vi.fn(async () => true),
      savePageAs: vi.fn(async () => true),
      getPageInfo: vi.fn(async () => null),
    },
    pip: {
      enter: vi.fn(async () => ({ ok: false })),
      exit: vi.fn(async () => ({ ok: true })),
      getStatus: vi.fn(async () => ({ supported: false, active: false, hasVideo: false })),
    },
    menu: {
      showAppMenu: vi.fn(async () => undefined),
    },
    on: {
      tabsState: vi.fn(() => () => undefined),
      tabUpdated: vi.fn(() => () => undefined),
      tabActivated: vi.fn(() => () => undefined),
      tabFaviconUpdated: vi.fn(() => () => undefined),
      closedTabsUpdated: vi.fn(() => () => undefined),
      windowReady: vi.fn(() => () => undefined),
      focusUrlBar: vi.fn(() => () => undefined),
      openTabSearch: vi.fn(() => () => undefined),
      targetLost: vi.fn(() => () => undefined),
      zoomChanged: vi.fn(() => () => undefined),
      bookmarksUpdated: vi.fn(() => () => undefined),
      openBookmarkDialog: vi.fn(() => () => undefined),
      openBookmarkAllTabsDialog: vi.fn(() => () => undefined),
      toggleBookmarksBar: vi.fn(() => () => undefined),
      focusBookmarksBar: vi.fn(() => () => undefined),
      downloadsState: vi.fn(() => () => undefined),
      downloadStarted: vi.fn(() => () => undefined),
      downloadProgress: vi.fn(() => () => undefined),
      downloadDone: vi.fn(() => () => undefined),
      linkHover: vi.fn((cb: (payload: { url: string }) => void) => {
        linkHoverListeners.push(cb);
        return () => undefined;
      }),
      nameWindowDialog: vi.fn(() => () => undefined),
      fullscreenChanged: vi.fn(() => () => undefined),
      liveCaptionStateChanged: vi.fn(() => () => undefined),
    },
    liveCaption: {
      getState: vi.fn(async () => ({ enabled: false, language: 'en-US' })),
    },
    permissions: {
      respond: vi.fn(async () => undefined),
      dismiss: vi.fn(async () => undefined),
    },
    passwords: {
      save: vi.fn(async () => undefined),
      isNeverSave: vi.fn(async () => false),
      addNeverSave: vi.fn(async () => undefined),
      findForOrigin: vi.fn(async () => []),
    },
  };
});

afterEach(() => {
  cleanup();
});

describe('WindowChrome hovered link status bar', () => {
  it('shows the hovered URL when the shell receives a linkHover event', async () => {
    render(<WindowChrome />);

    expect(screen.queryByText('https://hover.example/path')).toBeNull();
    expect(linkHoverListeners).toHaveLength(1);

    linkHoverListeners[0]({ url: 'https://hover.example/path' });

    await waitFor(() => {
      expect(screen.getByText('https://hover.example/path')).toBeTruthy();
    });
  });
});
