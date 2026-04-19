import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

function readLocal(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', '..', relPath), 'utf8');
}

function getCurrentRepo(): { owner: string; repo: string } {
  const remote = execSync('git remote get-url origin', {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
  }).trim();

  const match =
    remote.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/) ??
    remote.match(/https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/);

  if (!match?.groups?.owner || !match?.groups?.repo) {
    throw new Error(`Could not parse GitHub remote: ${remote}`);
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
  };
}

describe('repo wiring regression checks', () => {
  it('targets the current GitHub repo for auto-updates', () => {
    const { owner, repo } = getCurrentRepo();
    const updaterSource = readLocal('src/main/updater.ts');

    expect(updaterSource).toContain(`const GITHUB_OWNER = '${owner}'`);
    expect(updaterSource).toContain(`const GITHUB_REPO = '${repo}'`);
  });

  it('points "Report an Issue…" menu actions at the current repo issues page', () => {
    const { owner, repo } = getCurrentRepo();
    const indexSource = readLocal('src/main/index.ts');

    expect(indexSource).toContain(`https://github.com/${owner}/${repo}/issues`);
    expect(indexSource).not.toContain('https://github.com/anthropics/desktop-app/issues');
  });

  it('does not ship a re-consent handler that hard-throws "not implemented"', () => {
    const settingsIpcSource = readLocal('src/main/settings/ipc.ts');

    expect(settingsIpcSource).not.toContain('Re-consent OAuth flow is not yet implemented');
  });

  it('keeps the visual capture harness in sync with the actual settings Vite config filename', () => {
    const captureSource = readLocal('tests/visual/capture.spec.ts');
    const hasMtsConfig = fs.existsSync(path.resolve(__dirname, '..', '..', '..', 'vite.settings.config.mts'));

    expect(hasMtsConfig).toBe(true);
    expect(captureSource).toContain('vite.settings.config.mts');
  });

  it('keeps test harness build instructions aligned with package.json scripts', () => {
    const pkg = JSON.parse(readLocal('package.json')) as { scripts?: Record<string, string> };
    const launcherSource = readLocal('tests/setup/electron-launcher.ts');
    const perfSource = readLocal('tests/perf/startup.spec.ts');

    const referencesPackageScript =
      launcherSource.includes('npm run package') ||
      perfSource.includes('npm run package');

    expect(launcherSource).not.toContain('npm run build');
    expect(perfSource).not.toContain('npm run build');
    expect(referencesPackageScript).toBe(true);
    expect(pkg.scripts?.package).toBeTypeOf('string');
  });
});

describe('settings content enforcement regression checks', () => {
  const settingsAppSource = readLocal('src/renderer/settings/SettingsApp.tsx');

  it.each([
    ['ads', 'Intrusive ads'],
    ['automatic-downloads', 'Automatic downloads'],
    ['protected-content', 'Protected content IDs'],
    ['clipboard-read', 'Clipboard read'],
    ['clipboard-write', 'Clipboard write'],
  ])('does not expose %s as a persisted-but-unenforced content setting', (category) => {
    const categoryPattern = new RegExp(
      `category:\\s*'${category}'[\\s\\S]*?enforced:\\s*false`,
      'm',
    );

    expect(settingsAppSource).not.toMatch(categoryPattern);
  });
});

describe('advertised feature regression checks', () => {
  const readmeSource = readLocal('../README.md');

  it('does not ship Tabs from other devices as a static placeholder-only history tab', () => {
    const historyPageSource = readLocal('src/renderer/history/HistoryPage.tsx');

    expect(readmeSource).toContain('Tabs from other devices tab in chrome://history');
    expect(historyPageSource).not.toContain('Sign in and enable sync to see open tabs from your other devices.');
  });

  it('does not ship Reading List as a side-panel placeholder with no backing feature', () => {
    const sidePanelSource = readLocal('src/renderer/shell/SidePanel.tsx');

    expect(readmeSource).toContain('reading list');
    expect(sidePanelSource).not.toContain('Reading list is empty.');
    expect(sidePanelSource).not.toContain('Add to Reading List');
  });

  it('keeps the Global Media Controls accelerator docs aligned with the Switch Profile shortcut', () => {
    const indexSource = readLocal('src/main/index.ts');

    expect(readmeSource).toContain(
      'Switch Profile (Cmd+Shift+M on macOS, Ctrl+Shift+M on Windows/Linux)',
    );
    expect(readmeSource).toContain('| Switch Profile | Cmd+Shift+M | Ctrl+Shift+M |');
    expect(readmeSource).not.toContain('Global Media Controls (Cmd+Shift+M)');
    expect(readmeSource).not.toContain('| Global Media Controls | Cmd+Shift+M | Ctrl+Shift+M |');
    expect(indexSource).toMatch(
      /label:\s*'Switch Profile…'[\s\S]*?accelerator:\s*'CommandOrControl\+Shift\+M'/m,
    );
    expect(indexSource).toMatch(
      /label:\s*'Switch Profile…'[\s\S]*?accelerator:\s*'Ctrl\+Shift\+M'/m,
    );
  });
});
