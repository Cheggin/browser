#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MY_APP_ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const PLAYWRIGHT_CLI = path.join(MY_APP_ROOT, 'node_modules', 'playwright', 'cli.js');
const SPEC_PATH = path.join(MY_APP_ROOT, 'tests', 'perf', 'startup.spec.ts');
const BUDGETS_PATH = path.join(MY_APP_ROOT, 'tests', 'perf', 'startup-budgets.json');
const DEFAULT_OUT_ROOT = path.join(MY_APP_ROOT, 'tests', 'results', 'perf', 'startup');
const DEFAULT_BASELINE_PATH = path.join(MY_APP_ROOT, 'tests', 'perf', 'baselines', 'startup-latest.json');

function parseArgs(argv) {
  const args = {
    outDir: '',
    baselinePath: DEFAULT_BASELINE_PATH,
    acceptBaseline: false,
    label: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length);
    else if (arg.startsWith('--baseline=')) args.baselinePath = arg.slice('--baseline='.length);
    else if (arg.startsWith('--label=')) args.label = arg.slice('--label='.length);
    else if (arg === '--accept-baseline') args.acceptBaseline = true;
  }

  return args;
}

function nowStamp() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '').replace('T', '-').replace('Z', 'Z');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function roundDelta(value) {
  return Math.round(value * 100) / 100;
}

function evaluateAgainstBudget(result) {
  const startupP95 = result.stats.spawnToNetworkIdle.p95;
  const startupBudget = result.budgets.startup.spawnToNetworkIdleP95MaxMs;
  const memoryValue = result.memory.totalRssMB;
  const memoryBudget = result.budgets.memory.totalRssMaxMB;

  return {
    startupP95: {
      actual: startupP95,
      budget: startupBudget,
      pass: startupP95 < startupBudget,
      marginMs: startupBudget - startupP95,
    },
    totalRssMB: {
      actual: memoryValue,
      budget: memoryBudget,
      pass: memoryValue == null ? false : memoryValue < memoryBudget,
      marginMB: memoryValue == null ? null : memoryBudget - memoryValue,
    },
  };
}

function compareToBaseline(current, baseline) {
  if (!baseline) return null;

  return {
    startupP95DeltaMs: roundDelta(current.stats.spawnToNetworkIdle.p95 - baseline.stats.spawnToNetworkIdle.p95),
    startupMeanDeltaMs: roundDelta(current.stats.spawnToNetworkIdle.mean - baseline.stats.spawnToNetworkIdle.mean),
    memoryDeltaMB:
      current.memory.totalRssMB == null || baseline.memory.totalRssMB == null
        ? null
        : roundDelta(current.memory.totalRssMB - baseline.memory.totalRssMB),
  };
}

function toMarkdown(summary) {
  const lines = [
    '# Startup Perf Evaluation',
    '',
    `- Generated: ${summary.generatedAt}`,
    `- Result file: ${summary.resultPath}`,
    `- Baseline file: ${summary.baselinePath}`,
    '',
    '## Current',
    '',
    `- Startup p95: ${summary.current.startupP95.actual} ms (budget ${summary.current.startupP95.budget} ms)`,
    `- Startup mean: ${summary.result.stats.spawnToNetworkIdle.mean} ms`,
    `- Memory RSS: ${summary.current.totalRssMB.actual ?? 'n/a'} MB (budget ${summary.current.totalRssMB.budget} MB)`,
    '',
    '## Budget Verdict',
    '',
    `- Startup p95: ${summary.current.startupP95.pass ? 'PASS' : 'FAIL'} (margin ${summary.current.startupP95.marginMs} ms)`,
    `- Memory RSS: ${summary.current.totalRssMB.pass ? 'PASS' : 'FAIL'} (margin ${summary.current.totalRssMB.marginMB ?? 'n/a'} MB)`,
  ];

  if (summary.delta) {
    lines.push(
      '',
      '## Delta vs Baseline',
      '',
      `- Startup p95 delta: ${summary.delta.startupP95DeltaMs} ms`,
      `- Startup mean delta: ${summary.delta.startupMeanDeltaMs} ms`,
      `- Memory delta: ${summary.delta.memoryDeltaMB ?? 'n/a'} MB`,
    );
  }

  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
const outDir = args.outDir || path.join(DEFAULT_OUT_ROOT, nowStamp() + (args.label ? `-${args.label}` : ''));
ensureDir(outDir);

const resultPath = path.join(outDir, 'startup-result.json');
const summaryPath = path.join(outDir, 'summary.json');
const summaryMdPath = path.join(outDir, 'summary.md');

const env = {
  ...process.env,
  PERF_RESULTS_PATH: resultPath,
};

const run = spawnSync(
  process.execPath,
  [PLAYWRIGHT_CLI, 'test', SPEC_PATH, '--reporter=line'],
  {
    cwd: MY_APP_ROOT,
    env,
    stdio: 'inherit',
  },
);

if (!fs.existsSync(resultPath)) {
  process.exit(run.status ?? 1);
}

const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
const baseline = fs.existsSync(args.baselinePath)
  ? JSON.parse(fs.readFileSync(args.baselinePath, 'utf-8'))
  : null;
const current = evaluateAgainstBudget(result);
const delta = compareToBaseline(result, baseline);

const summary = {
  generatedAt: new Date().toISOString(),
  playwrightExitCode: run.status ?? 1,
  resultPath,
  baselinePath: args.baselinePath,
  budgetsPath: BUDGETS_PATH,
  result,
  current,
  delta,
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
fs.writeFileSync(summaryMdPath, toMarkdown(summary), 'utf-8');

if (args.acceptBaseline) {
  ensureDir(path.dirname(args.baselinePath));
  fs.copyFileSync(resultPath, args.baselinePath);
  console.log(`[perf:eval] accepted baseline -> ${args.baselinePath}`);
}

console.log(`[perf:eval] result: ${resultPath}`);
console.log(`[perf:eval] summary: ${summaryPath}`);
console.log(`[perf:eval] summary-md: ${summaryMdPath}`);

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}
