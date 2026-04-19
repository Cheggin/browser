/**
 * Playwright config scoped to regression specs. These live outside the
 * tests/e2e/ testDir targeted by playwright.config.ts and don't use the
 * shared electron-launcher — each spec launches its own Electron with
 * whatever env/args it needs to isolate the regression under test.
 */

import { defineConfig } from '@playwright/test';
import path from 'node:path';

const MY_APP_ROOT = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: path.resolve(__dirname),
  // Only run the Playwright-Electron specs here. no-global-shortcuts.spec.ts
  // lives in the same directory but is a vitest spec picked up by
  // vitest.config.ts.
  testMatch: 'preload-path.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(MY_APP_ROOT, 'tests', 'results', 'regression-report.json') }],
  ],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
