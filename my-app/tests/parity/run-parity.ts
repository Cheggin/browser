/**
 * Chrome parity smoke runner.
 *
 * Methodology (plan §8, Critic M1):
 *   1. For each URL in sites.json:
 *      a. Navigate via The Browser (Playwright-Electron)
 *      b. Collect console messages during a 30s load window
 *      c. Filter to level='error' only
 *   2. Load chrome-baseline.json (captured from stock Chrome separately)
 *   3. Diff: new_errors = agentic_errors - chrome_baseline_errors
 *   4. Ship gate: new_errors.length === 0 for all 20 sites
 *   5. Output: tests/results/parity-report.json
 *
 * Dry-run mode (--dry-run): uses stub baseline + empty agentic errors.
 * Baseline capture mode (--capture-baseline): captures from stock Chrome
 * using Playwright chromium; writes to chrome-baseline.json.
 *
 * Usage:
 *   npx ts-node tests/parity/run-parity.ts [--dry-run] [--capture-baseline]
 *
 * Track H owns this file.
 */

import { chromium, ConsoleMessage } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { launchApp, teardownApp } from '../setup/electron-launcher';
import type { AppHandle } from '../setup/electron-launcher';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MY_APP_ROOT = path.resolve(__dirname, '../..');
const SITES_JSON = path.join(__dirname, 'sites.json');
const BASELINE_JSON = path.join(__dirname, 'chrome-baseline.json');
const RESULTS_DIR = path.join(MY_APP_ROOT, 'tests', 'results');
const REPORT_PATH = path.join(RESULTS_DIR, 'parity-report.json');

const LOAD_WINDOW_MS = 30_000;
const PAGE_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 250;
const LOG_PREFIX = '[Parity]';
const COMPLETED_ACCOUNT_JSON = JSON.stringify({
  agent_name: 'Parity Runner',
  email: 'parity@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  onboarding_completed_at: '2026-01-01T00:00:00.000Z',
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsoleError {
  text: string;
  url?: string;
  lineNumber?: number;
}

export interface SiteParityResult {
  url: string;
  chrome_console_errors: ConsoleError[];
  agentic_console_errors: ConsoleError[];
  /** Errors present in agentic but NOT in chrome baseline — the ship gate */
  new_errors: ConsoleError[];
  /** Errors present in chrome baseline but NOT in agentic (informational) */
  missing_errors: ConsoleError[];
  error?: string;
}

export interface ParityReport {
  generated_at: string;
  baseline_source: 'stub' | 'real';
  total_sites: number;
  sites_with_new_errors: number;
  gate_passed: boolean;
  results: SiteParityResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseErrorText(text: string): string {
  // Strip stack trace line numbers and dynamic identifiers to allow
  // fuzzy matching between Chrome and The Browser console errors.
  return text
    .replace(/:\d+:\d+/g, '') // strip :line:col
    .replace(/https?:\/\/[^\s]+/g, '[URL]') // strip URLs
    .trim()
    .toLowerCase();
}

function isNewError(agError: ConsoleError, baselineErrors: ConsoleError[]): boolean {
  const normAg = normaliseErrorText(agError.text);
  return !baselineErrors.some((be) => normaliseErrorText(be.text) === normAg);
}

function isMissingError(chromeError: ConsoleError, agErrors: ConsoleError[]): boolean {
  const normCh = normaliseErrorText(chromeError.text);
  return !agErrors.some((ae) => normaliseErrorText(ae.text) === normCh);
}

function createSeededUserDataDir(): string {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-agentic-'));
  fs.writeFileSync(path.join(userDataDir, 'account.json'), COMPLETED_ACCOUNT_JSON, 'utf-8');
  return userDataDir;
}

function cleanupSeededUserDataDir(userDataDir: string): void {
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

async function getActiveTabSnapshot(app: AppHandle): Promise<{
  url: string | null;
  isLoading: boolean;
} | null> {
  return app.electronApp.evaluate(() => {
    const tm = (global as typeof globalThis & {
      __tabManager__?: {
        getState: () => {
          tabs: Array<{ id: string; url: string; isLoading: boolean }>;
          activeTabId: string | null;
        };
      };
    }).__tabManager__;
    if (!tm) return null;

    const state = tm.getState();
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab) return null;

    return {
      url: activeTab.url || null,
      isLoading: activeTab.isLoading,
    };
  });
}

async function waitForAgenticNavigation(app: AppHandle): Promise<void> {
  const deadline = Date.now() + PAGE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const snapshot = await getActiveTabSnapshot(app);
    if (
      snapshot &&
      snapshot.url &&
      snapshot.url !== 'about:blank' &&
      snapshot.url !== 'chrome://newtab/' &&
      !snapshot.isLoading
    ) {
      return;
    }
    await app.firstWindow.waitForTimeout(POLL_INTERVAL_MS);
  }

  throw new Error(`Active tab did not finish loading within ${PAGE_TIMEOUT_MS}ms`);
}

async function startAgenticCapture(app: AppHandle, url: string): Promise<void> {
  await app.electronApp.evaluate((_ctx, targetUrl: string) => {
    type CaptureListener = (...args: unknown[]) => void;
    type CaptureStore = {
      errors: ConsoleError[];
      cleanup: () => void;
    };
    const globalState = global as typeof globalThis & {
      __tabManager__?: {
        getActiveWebContents: () => {
          id: number;
          getURL: () => string;
          on: (event: string, listener: CaptureListener) => void;
          off: (event: string, listener: CaptureListener) => void;
          executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
        } | null;
        navigateActive: (input: string) => void;
      };
      __parityCapture__?: CaptureStore;
    };

    globalState.__parityCapture__?.cleanup();

    const tabManager = globalState.__tabManager__;
    if (!tabManager) {
      throw new Error('global.__tabManager__ is unavailable; launch parity capture with NODE_ENV=test');
    }

    const webContents = tabManager.getActiveWebContents();
    if (!webContents) {
      throw new Error('No active webContents available for parity capture');
    }

    const errors: ConsoleError[] = [];
    const pushError = (text: string, sourceUrl?: string, lineNumber?: number): void => {
      errors.push({
        text,
        url: sourceUrl || undefined,
        lineNumber: typeof lineNumber === 'number' ? lineNumber : undefined,
      });
    };

    const onConsoleMessage: CaptureListener = (
      _event,
      level,
      message,
      line,
      sourceId,
    ) => {
      if (typeof level === 'number' && level >= 3 && typeof message === 'string') {
        pushError(message, typeof sourceId === 'string' ? sourceId : webContents.getURL(), typeof line === 'number' ? line : undefined);
      }
    };

    const onDidFailLoad: CaptureListener = (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    ) => {
      if (typeof isMainFrame === 'boolean' && !isMainFrame) return;
      if (typeof errorDescription !== 'string') return;
      const code = typeof errorCode === 'number' ? errorCode : 0;
      const target = typeof validatedURL === 'string' ? validatedURL : webContents.getURL();
      pushError(`[did-fail-load] ${errorDescription} (${code})`, target);
    };

    const onRenderProcessGone: CaptureListener = (_event, details) => {
      const reason =
        details && typeof details === 'object' && 'reason' in details
          ? String((details as { reason?: unknown }).reason ?? 'unknown')
          : 'unknown';
      pushError(`[render-process-gone] ${reason}`, webContents.getURL());
    };

    const onDidFinishLoad: CaptureListener = () => {
      void webContents.executeJavaScript(
        `(() => {
          if ((window).__parityPageErrorHookInstalled) return true;
          Object.defineProperty(window, '__parityPageErrorHookInstalled', {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false,
          });
          window.addEventListener('error', (event) => {
            const error = event && typeof event === 'object' ? event.error : undefined;
            const message =
              error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : String(event?.message ?? 'unknown error');
            console.error('[pageerror] ' + message);
          });
          window.addEventListener('unhandledrejection', (event) => {
            const reason = event?.reason;
            const message =
              reason instanceof Error
                ? reason.message
                : typeof reason === 'string'
                  ? reason
                  : String(reason);
            console.error('[unhandledrejection] ' + message);
          });
          return true;
        })();`,
        true,
      ).catch(() => {
        // Some pages forbid script injection or navigate away before the eval resolves.
      });
    };

    webContents.on('console-message', onConsoleMessage);
    webContents.on('did-fail-load', onDidFailLoad);
    webContents.on('render-process-gone', onRenderProcessGone);
    webContents.on('did-finish-load', onDidFinishLoad);

    globalState.__parityCapture__ = {
      errors,
      cleanup: () => {
        webContents.off('console-message', onConsoleMessage);
        webContents.off('did-fail-load', onDidFailLoad);
        webContents.off('render-process-gone', onRenderProcessGone);
        webContents.off('did-finish-load', onDidFinishLoad);
        delete globalState.__parityCapture__;
      },
    };

    tabManager.navigateActive(targetUrl);
  }, url);
}

async function finishAgenticCapture(app: AppHandle): Promise<ConsoleError[]> {
  return app.electronApp.evaluate(() => {
    const globalState = global as typeof globalThis & {
      __parityCapture__?: {
        errors: ConsoleError[];
        cleanup: () => void;
      };
    };
    const capture = globalState.__parityCapture__;
    if (!capture) return [];

    const errors = [...capture.errors];
    capture.cleanup();
    return errors;
  });
}

// ---------------------------------------------------------------------------
// Capture from a Playwright browser (Chrome or Agentic)
// ---------------------------------------------------------------------------

async function captureConsoleErrors(
  browserType: 'chromium',
  url: string,
): Promise<ConsoleError[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const errors: ConsoleError[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push({
        text: msg.text(),
        url: msg.location().url,
        lineNumber: msg.location().lineNumber,
      });
    }
  });

  page.on('pageerror', (err: Error) => {
    errors.push({ text: `[pageerror] ${err.message}` });
  });

  try {
    await page.goto(url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'networkidle' });
    // Observe for the full load window
    await page.waitForTimeout(LOAD_WINDOW_MS - PAGE_TIMEOUT_MS > 0 ? 5_000 : LOAD_WINDOW_MS);
  } catch (err) {
    console.warn(`${LOG_PREFIX} Navigation error for ${url}: ${(err as Error).message}`);
  } finally {
    await browser.close();
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Dry-run mode: returns empty agentic errors (no Electron required)
// ---------------------------------------------------------------------------

async function captureAgenticErrors(
  url: string,
  dryRun: boolean,
): Promise<ConsoleError[]> {
  if (dryRun) {
    console.log(`${LOG_PREFIX} [dry-run] Returning empty agentic errors for ${url}`);
    return [];
  }

  const userDataDir = createSeededUserDataDir();
  let app: AppHandle | null = null;

  try {
    app = await launchApp({
      userDataDir,
      env: {
        NODE_ENV: 'test',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    });

    const captureStartedAt = Date.now();
    await startAgenticCapture(app, url);

    try {
      await waitForAgenticNavigation(app);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Agentic navigation warning for ${url}: ${(err as Error).message}`);
    }

    const elapsedMs = Date.now() - captureStartedAt;
    const remainingObserveMs = Math.max(5_000, LOAD_WINDOW_MS - elapsedMs);
    await app.firstWindow.waitForTimeout(remainingObserveMs);

    return await finishAgenticCapture(app);
  } finally {
    if (app) {
      await teardownApp(app);
    }
    cleanupSeededUserDataDir(userDataDir);
  }
}

// ---------------------------------------------------------------------------
// Main parity runner
// ---------------------------------------------------------------------------

async function runParity(opts: {
  dryRun: boolean;
  captureBaseline: boolean;
}): Promise<ParityReport> {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Load sites
  const sites: string[] = JSON.parse(fs.readFileSync(SITES_JSON, 'utf-8'));
  console.log(`${LOG_PREFIX} Running parity for ${sites.length} sites`);

  // Load or capture baseline
  let baseline: Record<string, ConsoleError[]>;
  let baselineSource: 'stub' | 'real' = 'stub';

  if (opts.captureBaseline) {
    console.log(`${LOG_PREFIX} Capturing Chrome baseline for ${sites.length} sites...`);
    baseline = {};
    for (const url of sites) {
      console.log(`${LOG_PREFIX}   Capturing Chrome baseline: ${url}`);
      baseline[url] = await captureConsoleErrors('chromium', url);
      console.log(`${LOG_PREFIX}   → ${baseline[url].length} errors`);
    }
    const baselineData = Object.assign({ _comment: 'Captured by run-parity.ts --capture-baseline' }, baseline);
    fs.writeFileSync(BASELINE_JSON, JSON.stringify(baselineData, null, 2), 'utf-8');
    console.log(`${LOG_PREFIX} Baseline written to ${BASELINE_JSON}`);
    baselineSource = 'real';
  } else {
    const raw = JSON.parse(fs.readFileSync(BASELINE_JSON, 'utf-8')) as Record<string, unknown>;
    baseline = {};
    for (const [url, errors] of Object.entries(raw)) {
      if (url.startsWith('_')) continue; // skip metadata keys
      baseline[url] = Array.isArray(errors) ? (errors as ConsoleError[]) : [];
    }
    baselineSource = Object.values(baseline).some((v) => v.length > 0) ? 'real' : 'stub';
    console.log(`${LOG_PREFIX} Loaded baseline (source=${baselineSource})`);
  }

  // Run parity checks
  const results: SiteParityResult[] = [];

  for (const url of sites) {
    console.log(`${LOG_PREFIX} Checking: ${url}`);
    let agenticErrors: ConsoleError[] = [];
    let error: string | undefined;

    try {
      agenticErrors = await captureAgenticErrors(url, opts.dryRun);
    } catch (err) {
      error = (err as Error).message;
      console.error(`${LOG_PREFIX} Error capturing agentic errors for ${url}: ${error}`);
    }

    const chromeErrors = baseline[url] ?? [];
    const newErrors = agenticErrors.filter((ae) => isNewError(ae, chromeErrors));
    const missingErrors = chromeErrors.filter((ce) => isMissingError(ce, agenticErrors));

    console.log(
      `${LOG_PREFIX}   chrome=${chromeErrors.length} agentic=${agenticErrors.length} ` +
      `new=${newErrors.length} missing=${missingErrors.length}`,
    );

    results.push({
      url,
      chrome_console_errors: chromeErrors,
      agentic_console_errors: agenticErrors,
      new_errors: newErrors,
      missing_errors: missingErrors,
      error,
    });
  }

  // Build report
  const sitesWithNewErrors = results.filter((r) => r.new_errors.length > 0).length;
  const gatePassed = sitesWithNewErrors === 0;

  const report: ParityReport = {
    generated_at: new Date().toISOString(),
    baseline_source: baselineSource,
    total_sites: sites.length,
    sites_with_new_errors: sitesWithNewErrors,
    gate_passed: gatePassed,
    results,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\n${LOG_PREFIX} =============================================`);
  console.log(`${LOG_PREFIX} Parity report written to: ${REPORT_PATH}`);
  console.log(`${LOG_PREFIX} Gate passed: ${gatePassed}`);
  console.log(`${LOG_PREFIX} Sites with new errors: ${sitesWithNewErrors} / ${sites.length}`);

  if (!gatePassed) {
    console.error(`\n${LOG_PREFIX} GATE FAILED — new_errors detected:`);
    for (const r of results.filter((x) => x.new_errors.length > 0)) {
      console.error(`  ${r.url}: ${r.new_errors.length} new error(s)`);
      for (const e of r.new_errors) {
        console.error(`    - ${e.text.slice(0, 120)}`);
      }
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const captureBaseline = args.includes('--capture-baseline');

  console.log(`${LOG_PREFIX} Starting parity run (dry-run=${dryRun}, capture-baseline=${captureBaseline})`);

  runParity({ dryRun, captureBaseline })
    .then((report) => {
      process.exit(report.gate_passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`${LOG_PREFIX} Fatal error:`, err);
      process.exit(1);
    });
}

export { runParity };
