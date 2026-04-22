#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MY_APP_ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const RUNNER = path.join(MY_APP_ROOT, 'scripts', 'perf', 'run-startup-eval.mjs');
const DEFAULT_OUT_ROOT = path.join(MY_APP_ROOT, 'tests', 'results', 'perf', 'loops');

function parseArgs(argv) {
  const args = {
    iterations: 3,
    outDir: '',
    baselinePath: '',
    acceptBest: false,
    failFast: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--iterations=')) args.iterations = Number(arg.slice('--iterations='.length));
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length);
    else if (arg.startsWith('--baseline=')) args.baselinePath = arg.slice('--baseline='.length);
    else if (arg === '--accept-best') args.acceptBest = true;
    else if (arg === '--fail-fast') args.failFast = true;
  }

  return args;
}

function stamp() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '').replace('T', '-').replace('Z', 'Z');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function mean(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

const args = parseArgs(process.argv.slice(2));
const outDir = args.outDir || path.join(DEFAULT_OUT_ROOT, `startup-loop-${stamp()}`);
ensureDir(outDir);

const runs = [];

for (let i = 0; i < args.iterations; i += 1) {
  const runDir = path.join(outDir, `run-${String(i + 1).padStart(2, '0')}`);
  ensureDir(runDir);

  const childArgs = [RUNNER, `--out-dir=${runDir}`, `--label=iter-${i + 1}`];
  if (args.baselinePath) childArgs.push(`--baseline=${args.baselinePath}`);

  const result = spawnSync(process.execPath, childArgs, {
    cwd: MY_APP_ROOT,
    stdio: 'inherit',
  });

  const summaryPath = path.join(runDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    if (args.failFast) process.exit(result.status ?? 1);
    continue;
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  runs.push(summary);

  if (result.status !== 0 && args.failFast) {
    break;
  }
}

if (runs.length === 0) {
  console.error('[perf:loop] no successful runs');
  process.exit(1);
}

const p95s = runs.map((run) => run.result.stats.spawnToNetworkIdle.p95);
const memories = runs
  .map((run) => run.result.memory.totalRssMB)
  .filter((value) => typeof value === 'number');

const bestRun = [...runs].sort((a, b) => a.result.stats.spawnToNetworkIdle.p95 - b.result.stats.spawnToNetworkIdle.p95)[0];

const aggregate = {
  generatedAt: new Date().toISOString(),
  iterationsRequested: args.iterations,
  iterationsCompleted: runs.length,
  runs: runs.map((run) => ({
    resultPath: run.resultPath,
    startupP95: run.result.stats.spawnToNetworkIdle.p95,
    startupMean: run.result.stats.spawnToNetworkIdle.mean,
    totalRssMB: run.result.memory.totalRssMB,
    startupBudgetPass: run.current.startupP95.pass,
    memoryBudgetPass: run.current.totalRssMB.pass,
  })),
  startup: {
    bestP95: Math.min(...p95s),
    worstP95: Math.max(...p95s),
    meanP95: mean(p95s),
    spreadP95: Math.max(...p95s) - Math.min(...p95s),
  },
  memory: {
    bestMB: memories.length ? Math.min(...memories) : null,
    worstMB: memories.length ? Math.max(...memories) : null,
    meanMB: memories.length ? mean(memories) : null,
  },
  bestRunPath: bestRun.resultPath,
};

fs.writeFileSync(path.join(outDir, 'loop-summary.json'), JSON.stringify(aggregate, null, 2), 'utf-8');

const markdown = [
  '# Startup Perf Loop',
  '',
  `- Generated: ${aggregate.generatedAt}`,
  `- Iterations completed: ${aggregate.iterationsCompleted}/${aggregate.iterationsRequested}`,
  `- Best run: ${aggregate.bestRunPath}`,
  '',
  '## Startup',
  '',
  `- Best p95: ${aggregate.startup.bestP95} ms`,
  `- Worst p95: ${aggregate.startup.worstP95} ms`,
  `- Mean p95: ${aggregate.startup.meanP95} ms`,
  `- Spread p95: ${aggregate.startup.spreadP95} ms`,
  '',
  '## Memory',
  '',
  `- Best RSS: ${aggregate.memory.bestMB ?? 'n/a'} MB`,
  `- Worst RSS: ${aggregate.memory.worstMB ?? 'n/a'} MB`,
  `- Mean RSS: ${aggregate.memory.meanMB ?? 'n/a'} MB`,
  '',
].join('\n');

fs.writeFileSync(path.join(outDir, 'loop-summary.md'), `${markdown}\n`, 'utf-8');

if (args.acceptBest && args.baselinePath) {
  fs.copyFileSync(bestRun.resultPath, args.baselinePath);
  console.log(`[perf:loop] accepted best run as baseline -> ${args.baselinePath}`);
}

console.log(`[perf:loop] loop summary: ${path.join(outDir, 'loop-summary.json')}`);
