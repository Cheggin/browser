import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function readLocal(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

describe('unshipped contract checks', () => {
  it('does not keep the onboarding E2E suite permanently skipped behind a hard-coded gate', () => {
    const source = readLocal('tests/e2e/onboarding-flow.spec.ts');

    expect(source).not.toContain("test.skip(true, 'Awaiting built artifact");
  });

  it('does not keep the session restore E2E suite permanently skipped for file:// fixtures', () => {
    const source = readLocal('tests/e2e/session-restore.spec.ts');

    expect(source).not.toContain('Fix TabManager file:// handling, then unskip.');
  });

  it('does not leave the accessibility audit suite as a skip-only placeholder', () => {
    const source = readLocal('tests/a11y/axe-audit.spec.ts');

    expect(source).not.toContain('test.skip(true, \'axe-core not installed');
    expect(source).not.toContain('Remove this placeholder block.');
  });

  it('does not ship parity capture with a hard-coded "not yet implemented" notice', () => {
    const source = readLocal('tests/parity/run-parity.ts');

    expect(source).not.toContain('Real agentic capture not yet implemented.');
  });

  it('does not keep the presence subsystem as an intentional no-op stub', () => {
    const source = readLocal('src/main/presence.ts');

    expect(source).not.toContain('This module is intentionally a stub.');
    expect(source).not.toContain('stub — no-op in v0.1');
  });

  it('does not instantiate ZoomStore without the profile-scoped data directory', () => {
    const source = readLocal('src/main/tabs/TabManager.ts');

    expect(source).not.toContain('this.zoomStore = new ZoomStore();');
  });

  it('does not admit that recently closed tabs drop their captured history stack on restore', () => {
    const source = readLocal('src/main/tabs/TabManager.ts');

    expect(source).not.toContain('history restore is a best-effort no-op today');
  });

  it('does not leave updater tests hard-coded to browser-use/desktop-app', () => {
    const source = readLocal('tests/unit/updater/updater.spec.ts');

    expect(source).not.toContain('browser-use');
    expect(source).not.toContain('desktop-app');
  });

  it('does not keep README references on the removed vite.settings.config.ts filename', () => {
    const source = readLocal('README.md');

    expect(source).not.toContain('vite.settings.config.ts');
    expect(source).toContain('vite.settings.config.mts');
  });

  it('does not describe electron-updater as intentionally missing when the package is installed', () => {
    const docs = readLocal('docs/CURRENT_STATE.md');
    const pkg = JSON.parse(readLocal('package.json')) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.['electron-updater']).toBeTypeOf('string');
    expect(docs).not.toContain('electron-updater not installed');
  });
});
