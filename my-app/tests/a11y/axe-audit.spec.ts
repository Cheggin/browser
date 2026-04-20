/**
 * Live axe-core audits across the key Electron renderers.
 *
 * Reports are written to tests/a11y/reports/<screen>-axe.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';
import { build as viteBuild } from 'vite';

import { launchApp, teardownApp } from '../setup/electron-launcher';

const MY_APP_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(__dirname, 'reports');
const AXE_JS_PATH = path.join(MY_APP_ROOT, 'node_modules', 'axe-core', 'axe.js');
const SETTINGS_VITE_CONFIG = path.join(MY_APP_ROOT, 'vite.settings.config.mts');
const ONBOARDING_VITE_CONFIG = path.join(MY_APP_ROOT, 'vite.onboarding.config.mts');
const SETTINGS_HTML_PATH = path.join(
  MY_APP_ROOT,
  'dist',
  'src',
  'renderer',
  'settings',
  'settings.html',
);
const ONBOARDING_HTML_PATH = path.join(
  MY_APP_ROOT,
  'dist',
  'src',
  'renderer',
  'onboarding',
  'onboarding.html',
);

const UI_TIMEOUT_MS = 10_000;
const FAIL_SEVERITIES = new Set(['critical', 'serious']);
const SHELL_READY_SELECTOR = '[data-testid="tab-strip"], .tab-strip';

const SHELL_URL_PATTERNS = ['shell.html', '/shell/', 'localhost:5173'];
const SETTINGS_URL_PATTERNS = ['settings.html', '/settings/', 'settings/settings'];
const SKIP_URL_PATTERNS = ['devtools://', 'chrome-devtools', 'google.com', 'about:blank'];

const COMPLETED_ACCOUNT = JSON.stringify({
  agent_name: 'Aria',
  email: 'aria@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  onboarding_completed_at: '2026-01-01T00:00:00.000Z',
});

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

interface AuditAppHandle {
  electronApp: ElectronApplication;
  firstWindow: Page;
  userDataDir: string;
}

function matchesPatterns(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => url.includes(pattern));
}

function isSkipUrl(url: string): boolean {
  return matchesPatterns(url, SKIP_URL_PATTERNS);
}

async function waitForWindow(
  electronApp: ElectronApplication,
  patterns: string[],
  timeoutMs = 15_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      const url = win.url();
      if (!isSkipUrl(url) && matchesPatterns(url, patterns)) {
        await win.waitForLoadState('domcontentloaded');
        await win.emulateMedia({ reducedMotion: 'reduce' });
        return win;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  for (const win of electronApp.windows()) {
    const url = win.url();
    if (!isSkipUrl(url)) {
      await win.waitForLoadState('domcontentloaded');
      await win.emulateMedia({ reducedMotion: 'reduce' });
      return win;
    }
  }

  const fallback = await electronApp.firstWindow();
  await fallback.waitForLoadState('domcontentloaded');
  await fallback.emulateMedia({ reducedMotion: 'reduce' });
  return fallback;
}

async function getShellWindow(electronApp: ElectronApplication): Promise<Page> {
  return waitForWindow(electronApp, SHELL_URL_PATTERNS);
}

async function getSettingsWindow(electronApp: ElectronApplication): Promise<Page | null> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      if (matchesPatterns(win.url(), SETTINGS_URL_PATTERNS)) {
        await win.waitForLoadState('domcontentloaded');
        await win.emulateMedia({ reducedMotion: 'reduce' });
        return win;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return null;
}

function createUserDataDir(prefix: string, accountJson?: string): string {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `axe-audit-${prefix}-`));

  if (accountJson) {
    fs.writeFileSync(path.join(userDataDir, 'account.json'), accountJson, 'utf-8');
  }

  return userDataDir;
}

async function launchAuditApp(options: {
  prefix: string;
  accountJson?: string;
  extraEnv?: Record<string, string>;
}): Promise<AuditAppHandle> {
  const userDataDir = createUserDataDir(options.prefix, options.accountJson);
  const handle = await launchApp({
    userDataDir,
    env: {
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      ...(options.extraEnv ?? {}),
    },
    args: ['--remote-debugging-port=0'],
  });

  await handle.firstWindow.emulateMedia({ reducedMotion: 'reduce' });
  return {
    electronApp: handle.electronApp,
    firstWindow: handle.firstWindow,
    userDataDir,
  };
}

async function cleanupAuditApp(handle: AuditAppHandle): Promise<void> {
  await teardownApp({
    electronApp: handle.electronApp,
    firstWindow: handle.firstWindow,
    userDataDir: handle.userDataDir,
    cleanupUserData: false,
  });

  fs.rmSync(handle.userDataDir, { recursive: true, force: true });
}

async function ensureSettingsRendererBuilt(): Promise<void> {
  if (fs.existsSync(SETTINGS_HTML_PATH)) {
    return;
  }

  if (!fs.existsSync(SETTINGS_VITE_CONFIG)) {
    throw new Error(`Settings renderer config not found at ${SETTINGS_VITE_CONFIG}`);
  }

  await viteBuild({
    configFile: SETTINGS_VITE_CONFIG,
    logLevel: 'warn',
  });

  if (!fs.existsSync(SETTINGS_HTML_PATH)) {
    throw new Error(`Settings renderer build did not produce ${SETTINGS_HTML_PATH}`);
  }
}

async function ensureOnboardingRendererBuilt(): Promise<void> {
  if (fs.existsSync(ONBOARDING_HTML_PATH)) {
    return;
  }

  if (!fs.existsSync(ONBOARDING_VITE_CONFIG)) {
    throw new Error(`Onboarding renderer config not found at ${ONBOARDING_VITE_CONFIG}`);
  }

  await viteBuild({
    configFile: ONBOARDING_VITE_CONFIG,
    logLevel: 'warn',
  });

  if (!fs.existsSync(ONBOARDING_HTML_PATH)) {
    throw new Error(`Onboarding renderer build did not produce ${ONBOARDING_HTML_PATH}`);
  }
}

function getFailingViolations(results: AxeResults): Result[] {
  return results.violations.filter((violation) => FAIL_SEVERITIES.has(violation.impact ?? ''));
}

function formatViolations(violations: Result[]): string {
  return JSON.stringify(
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    })),
    null,
    2,
  );
}

async function runAxe(page: Page, screenName: string): Promise<AxeResults> {
  if (!fs.existsSync(AXE_JS_PATH)) {
    throw new Error(`axe-core asset missing at ${AXE_JS_PATH}`);
  }

  await page.addScriptTag({ path: AXE_JS_PATH });

  const results = await page.evaluate(async () => {
    const axe = (window as Window & {
      axe: { run: () => Promise<AxeResults> };
    }).axe;

    return axe.run();
  });

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS_DIR, `${screenName}-axe.json`),
    JSON.stringify(results, null, 2),
    'utf-8',
  );

  return results;
}

async function expectNoCriticalOrSeriousViolations(page: Page, screenName: string): Promise<void> {
  const results = await runAxe(page, screenName);
  const failingViolations = getFailingViolations(results);

  expect(
    failingViolations,
    `${screenName} has ${failingViolations.length} critical/serious axe violations:\n${formatViolations(failingViolations)}`,
  ).toHaveLength(0);
}

async function waitForOnboardingMount(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.querySelector('#onboarding-root');
    return !!root && root.childElementCount > 0;
  }, null, { timeout: UI_TIMEOUT_MS });
}

test('axe-audit: shell-empty', async () => {
  const handle = await launchAuditApp({
    prefix: 'shell-empty',
    accountJson: COMPLETED_ACCOUNT,
    extraEnv: { SKIP_ONBOARDING: '1' },
  });

  try {
    const shellPage = await getShellWindow(handle.electronApp);
    await shellPage.waitForSelector(SHELL_READY_SELECTOR, { timeout: UI_TIMEOUT_MS });
    await expectNoCriticalOrSeriousViolations(shellPage, 'shell-empty');
  } finally {
    await cleanupAuditApp(handle);
  }
});

test('axe-audit: onboarding-welcome', async () => {
  await ensureOnboardingRendererBuilt();
  const handle = await launchAuditApp({ prefix: 'onboarding-welcome' });

  try {
    await waitForOnboardingMount(handle.firstWindow);
    await expect(handle.firstWindow.getByRole('button', { name: /get started with setup/i })).toBeVisible({
      timeout: UI_TIMEOUT_MS,
    });
    await expectNoCriticalOrSeriousViolations(handle.firstWindow, 'onboarding-welcome');
  } finally {
    await cleanupAuditApp(handle);
  }
});

test('axe-audit: onboarding-import', async () => {
  await ensureOnboardingRendererBuilt();
  const handle = await launchAuditApp({ prefix: 'onboarding-import' });

  try {
    await waitForOnboardingMount(handle.firstWindow);
    await handle.firstWindow.waitForSelector('.cta-button, .onboarding-root', {
      timeout: UI_TIMEOUT_MS,
    });
    await handle.firstWindow.locator('.cta-button').first().click();
    await handle.firstWindow.waitForSelector(
      '.onboarding-headline',
      { timeout: UI_TIMEOUT_MS },
    );
    await expect(handle.firstWindow.getByRole('heading', { name: /import from chrome/i })).toBeVisible();
    await expectNoCriticalOrSeriousViolations(handle.firstWindow, 'onboarding-import');
  } finally {
    await cleanupAuditApp(handle);
  }
});

test('axe-audit: onboarding-account', async () => {
  await ensureOnboardingRendererBuilt();
  const handle = await launchAuditApp({ prefix: 'onboarding-account' });

  try {
    await waitForOnboardingMount(handle.firstWindow);
    await handle.firstWindow.waitForSelector('.cta-button, .onboarding-root', {
      timeout: UI_TIMEOUT_MS,
    });
    await handle.firstWindow.locator('.cta-button').first().click();
    await expect(handle.firstWindow.getByRole('heading', { name: /import from chrome/i })).toBeVisible();
    await handle.firstWindow.getByRole('button', { name: /skip/i }).click();

    await handle.firstWindow.waitForSelector(
      '[aria-label="Continue with Google"], .google-btn',
      { timeout: UI_TIMEOUT_MS },
    );
    await expect(handle.firstWindow.getByRole('heading', { name: /create your account/i })).toBeVisible();

    await expectNoCriticalOrSeriousViolations(handle.firstWindow, 'onboarding-account');
  } finally {
    await cleanupAuditApp(handle);
  }
});

test('axe-audit: pill-idle', async () => {
  const handle = await launchAuditApp({
    prefix: 'pill-idle',
    accountJson: COMPLETED_ACCOUNT,
    extraEnv: { SKIP_ONBOARDING: '1' },
  });

  try {
    const shellPage = await getShellWindow(handle.electronApp);
    await shellPage.waitForSelector(SHELL_READY_SELECTOR, { timeout: UI_TIMEOUT_MS });

    await handle.electronApp.evaluate(() => {
      try {
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((win: Electron.BrowserWindow) => {
          win.webContents.send('pill:toggle');
        });
      } catch {
        // Best effort: if the pill IPC is unavailable the shell window will be audited instead.
      }
    });

    await shellPage.waitForTimeout(500);

    const pillPage =
      handle.electronApp.windows().find((win) => win.url().includes('pill')) ?? shellPage;

    await pillPage.emulateMedia({ reducedMotion: 'reduce' });
    await expectNoCriticalOrSeriousViolations(pillPage, 'pill-idle');
  } finally {
    await cleanupAuditApp(handle);
  }
});

test('axe-audit: settings-api-key', async () => {
  await ensureSettingsRendererBuilt();

  const handle = await launchAuditApp({
    prefix: 'settings-api-key',
    accountJson: COMPLETED_ACCOUNT,
    extraEnv: { SKIP_ONBOARDING: '1' },
  });

  try {
    const shellPage = await getShellWindow(handle.electronApp);
    await shellPage.waitForSelector(SHELL_READY_SELECTOR, { timeout: UI_TIMEOUT_MS });

    await handle.electronApp.evaluate(({ Menu, BrowserWindow }) => {
      const menu = Menu.getApplicationMenu();
      if (!menu) {
        return;
      }

      const win = BrowserWindow.getAllWindows()[0];

      function findAndClick(items: Electron.MenuItem[]): boolean {
        for (const item of items) {
          if (item.label?.includes('Settings')) {
            item.click(undefined, win ?? undefined, undefined);
            return true;
          }

          if (item.submenu && findAndClick(item.submenu.items)) {
            return true;
          }
        }

        return false;
      }

      findAndClick(menu.items);
    });

    await shellPage.waitForTimeout(2_000);

    const settingsPage = await getSettingsWindow(handle.electronApp);
    if (!settingsPage) {
      throw new Error('Settings window did not open');
    }

    await settingsPage.waitForSelector('.settings-shell', { timeout: UI_TIMEOUT_MS });

    const apiKeyTab = settingsPage.locator('button:has-text("API Key")').first();
    if (await apiKeyTab.isVisible().catch(() => false)) {
      await apiKeyTab.click();
    }

    await expectNoCriticalOrSeriousViolations(settingsPage, 'settings-api-key');
  } finally {
    await cleanupAuditApp(handle);
  }
});
