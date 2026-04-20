/**
 * Onboarding flow E2E tests.
 *
 * Keeps real executable coverage on the current 4-step onboarding flow:
 * welcome -> chrome-import -> account -> complete.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { launchApp, teardownApp, type AppHandle } from '../setup/electron-launcher';

const GET_STARTED_LABEL = /get started with setup/i;
const STEP_PROGRESS_LABEL = /step \d of 4/i;
const SKIP_IMPORT_LABEL = /skip/i;
const CONTINUE_WITH_GOOGLE_LABEL = /continue with google/i;
const SHELL_TAB_STRIP_SELECTOR = '.tab-strip__tabs';
const ONBOARDING_HTML_PATH = path.join(process.cwd(), 'dist', 'src', 'renderer', 'onboarding', 'onboarding.html');

async function ensureOnboardingRendererBuilt(): Promise<void> {
  if (fs.existsSync(ONBOARDING_HTML_PATH)) return;
  await viteBuild({ configFile: 'vite.onboarding.config.mts', logLevel: 'warn' });
}

test.describe('Onboarding Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await ensureOnboardingRendererBuilt();
  });

  let app: AppHandle;

  test.beforeEach(async () => {
    app = await launchApp({
      env: {
        NODE_ENV: 'test',
        DEV_MODE: '1',
        KEYCHAIN_MOCK: '1',
        POSTHOG_API_KEY: '',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    });
  });

  test.afterEach(async () => {
    await teardownApp(app);
  });

  test('fresh userData opens the welcome step instead of the shell', async () => {
    await expect(app.firstWindow.getByRole('progressbar', { name: STEP_PROGRESS_LABEL })).toBeVisible();
    await expect(app.firstWindow.getByRole('button', { name: GET_STARTED_LABEL })).toBeVisible();
    await expect(app.firstWindow.locator(SHELL_TAB_STRIP_SELECTOR)).toHaveCount(0);
  });

  test('welcome -> chrome import -> account flow is navigable and opens the Google scopes modal', async () => {
    await app.firstWindow.getByRole('button', { name: GET_STARTED_LABEL }).click();
    await expect(app.firstWindow.getByRole('heading', { name: /import from chrome/i })).toBeVisible();

    await app.firstWindow.getByRole('button', { name: SKIP_IMPORT_LABEL }).click();
    await expect(app.firstWindow.getByRole('heading', { name: /create your account/i })).toBeVisible();

    await app.firstWindow.getByRole('button', { name: CONTINUE_WITH_GOOGLE_LABEL }).click();
    await expect(app.firstWindow.getByRole('dialog', { name: /connect google services/i })).toBeVisible();

    const scopeCheckboxes = app.firstWindow.locator('input[type="checkbox"]');
    await expect(scopeCheckboxes).toHaveCount(5);

    await app.firstWindow.locator('[data-service="gmail"]').click();
    await expect(scopeCheckboxes.first()).not.toBeChecked();
  });

  test('relaunch after a completed account record skips onboarding and opens the shell', async () => {
    const accountPath = path.join(app.userDataDir, 'account.json');
    fs.writeFileSync(
      accountPath,
      JSON.stringify(
        {
          agent_name: 'Aria',
          email: 'test@example.com',
          created_at: new Date().toISOString(),
          onboarding_completed_at: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    );

    const savedDir = app.userDataDir;
    app.cleanupUserData = false;
    await app.electronApp.close().catch(() => undefined);

    const relaunched = await launchApp({
      userDataDir: savedDir,
      env: {
        NODE_ENV: 'test',
        DEV_MODE: '1',
        KEYCHAIN_MOCK: '1',
        POSTHOG_API_KEY: '',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    });

    try {
      await expect(relaunched.firstWindow.locator(SHELL_TAB_STRIP_SELECTOR)).toBeVisible({ timeout: 10_000 });
      await expect(relaunched.firstWindow.getByRole('button', { name: GET_STARTED_LABEL })).toHaveCount(0);
    } finally {
      await teardownApp(relaunched);
      fs.rmSync(savedDir, { recursive: true, force: true });
    }
  });
});
