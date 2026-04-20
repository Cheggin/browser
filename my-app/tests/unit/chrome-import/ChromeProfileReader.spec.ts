import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = {
  existsSync: vi.fn<(target: string) => boolean>(),
  readFileSync: vi.fn<(target: string, encoding?: BufferEncoding) => string>(),
  readdirSync: vi.fn<(target: string, options?: { withFileTypes?: boolean }) => { name: string; isDirectory: () => boolean }[]>(),
};

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual.default,
      ...fsMock,
    },
  };
});

function chromeInstallPaths(): { browserPath: string; userDataDir: string } {
  const home = process.env.HOME ?? '/Users/tester';
  if (process.platform === 'darwin') {
    return {
      browserPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
    };
  }
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? '';
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return {
      browserPath: path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      userDataDir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    };
  }
  return {
    browserPath: '/usr/bin/google-chrome',
    userDataDir: path.join(home, '.config', 'google-chrome'),
  };
}

describe('ChromeProfileReader', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('discovers Chromium profiles and keeps the default profile first', async () => {
    const install = chromeInstallPaths();
    const localStatePath = path.join(install.userDataDir, 'Local State');
    const defaultProfilePath = path.join(install.userDataDir, 'Default');
    const profileOnePath = path.join(install.userDataDir, 'Profile 1');

    fsMock.existsSync.mockImplementation((target) => {
      return [
        install.browserPath,
        install.userDataDir,
        localStatePath,
        path.join(defaultProfilePath, 'Preferences'),
        path.join(profileOnePath, 'Bookmarks'),
      ].includes(target);
    });

    fsMock.readFileSync.mockImplementation((target) => {
      if (target === localStatePath) {
        return JSON.stringify({
          profile: {
            info_cache: {
              Default: {
                name: 'Default',
                user_name: 'default@example.com',
              },
              'Profile 1': {
                name: 'Work',
                user_name: 'work@example.com',
              },
            },
          },
        });
      }
      throw new Error(`unexpected read: ${target}`);
    });

    fsMock.readdirSync.mockImplementation((target) => {
      if (target === install.userDataDir) {
        return [
          { name: 'Profile 1', isDirectory: () => true },
          { name: 'Default', isDirectory: () => true },
          { name: 'Crashpad', isDirectory: () => false },
        ];
      }
      throw new Error(`unexpected readdir: ${target}`);
    });

    const { listChromeProfiles } = await import('../../../src/main/chrome-import/ChromeProfileReader');
    const profiles = listChromeProfiles();

    expect(profiles).toHaveLength(2);
    expect(profiles[0]).toMatchObject({
      id: 'Google Chrome:Default',
      name: 'Default',
      email: 'default@example.com',
      profilePath: defaultProfilePath,
      browserName: 'Google Chrome',
      browserPath: install.browserPath,
      displayName: 'Google Chrome - Default',
    });
    expect(profiles[1]).toMatchObject({
      id: 'Google Chrome:Profile 1',
      name: 'Work',
      email: 'work@example.com',
      profilePath: profileOnePath,
      browserName: 'Google Chrome',
      browserPath: install.browserPath,
      displayName: 'Google Chrome - Work',
    });
  });
});
