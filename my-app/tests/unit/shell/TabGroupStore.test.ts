import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TabGroupStore, TAB_GROUPS_FILE_NAME } from '../../../src/main/tabs/TabGroupStore';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-group-store-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('TabGroupStore persistence', () => {
  it('restores created groups from disk on a fresh store instance', () => {
    const dataDir = makeTempDir();
    const first = new TabGroupStore(dataDir);

    const created = first.createGroup('Work', 'blue', ['tab-1', 'tab-2']);
    first.updateGroup(created.id, { collapsed: true, name: 'Work Group' });
    first.flushSync();

    const persistedPath = path.join(dataDir, TAB_GROUPS_FILE_NAME);
    expect(fs.existsSync(persistedPath)).toBe(true);

    const second = new TabGroupStore(dataDir);
    const restored = second.getGroup(created.id);

    expect(restored).toBeTruthy();
    expect(restored).toMatchObject({
      id: created.id,
      name: 'Work Group',
      color: 'blue',
      tabIds: ['tab-1', 'tab-2'],
      collapsed: true,
    });
    expect(second.getGroupForTab('tab-2')?.id).toBe(created.id);
  });
});
