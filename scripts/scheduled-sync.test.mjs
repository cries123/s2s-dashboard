/**
 * The scheduled PBS pull, run against stand-ins for PBS and Firestore.
 *
 * The real job (netlify/functions/pbs-daily-sync.ts) is bundled with its PBS,
 * Firestore and heartbeat imports swapped for fakes, so what is tested is its
 * own decisions: when to start, how many stages to run before Netlify's time
 * limit, how to carry on, when to stand aside, when to give up.
 *
 * Run: npm run test:scheduled
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const FAKE = `
  const T = globalThis.__T;
  export const PBS_SYNC_STAGES = ['customers', 'repair-orders', 'appointments', 'performance', 'extended'];
  export const PBS_AUTOMATED_SYNC_DEALERSHIP_ID = 'hyundai';
  export const getAdminFirestore = () => ({});
  export const isPbsPartnerHubConfigured = () => true;
  export const readPbsSyncStateFor = async () => T.state;
  export const startStagedPbsSync = async (opts) => {
    T.calls.push('start');
    T.state = { ...T.state, syncInProgress: true, syncStartedAt: new Date(T.now).toISOString(),
      stagedRun: { runId: new Date(T.now).toISOString(), triggeredBy: 'cron', completedStages: [] } };
    return { ok: true, startedAt: T.state.stagedRun.runId, nextStage: 'customers' };
  };
  export const executePbsSyncStage = async (runId, stage) => {
    T.calls.push(stage);
    T.now += T.stageMs[stage] ?? 10_000;
    if (T.failOn === stage) return { ok: false, error: 'PBS said no' };
    const done = [...T.state.stagedRun.completedStages, stage];
    const next = PBS_SYNC_STAGES.find((s) => !done.includes(s));
    if (!next) {
      T.state = { ...T.state, syncInProgress: false, stagedRun: null, lastSuccessfulSyncAt: new Date(T.now).toISOString() };
      return { ok: true, done: true, result: { summary: 'pulled' } };
    }
    T.state = { ...T.state, syncStartedAt: new Date(T.now).toISOString(), stagedRun: { ...T.state.stagedRun, completedStages: done } };
    return { ok: true, nextStage: next };
  };
  export const failStagedPbsSync = async (reason) => { T.calls.push('give-up'); T.state = { ...T.state, syncInProgress: false, stagedRun: null }; return null; };
  export const recordPbsCronHeartbeat = async (db, outcome, note) => { T.beats.push(outcome); };
  export const backfillOnePastMonth = async () => { T.calls.push('backfill'); return { month: '2026-03' }; };
`;

const outDir = mkdtempSync(join(tmpdir(), 's2s-scheduled-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['netlify/functions/pbs-daily-sync.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: entry,
  logLevel: 'error',
  plugins: [
    {
      name: 'fakes',
      setup(build) {
        const faked = /(initFirebaseAdmin|partnerHubConfig|pbs\/pbsSync|pbsDealershipScope|pbsCronHeartbeat|pbsMonthRebuild)\.js$/;
        build.onResolve({ filter: faked }, (args) => ({ path: args.path, namespace: 'fake' }));
        build.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: FAKE, loader: 'js' }));
      },
    },
  ],
});

const T = (globalThis.__T = {});
const realNow = Date.now;
Date.now = () => T.now;
const { handler } = await import(pathToFileURL(entry).href);
const quiet = console.log;
console.log = () => {};
console.error = () => {};
console.warn = () => {};

const pdt = (iso) => new Date(`${iso}-07:00`).getTime();
function reset(at, state) {
  Object.assign(T, { now: pdt(at), state, calls: [], beats: [], stageMs: {}, failOn: undefined });
}
const wake = () => handler({}, {});

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  quiet(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    quiet(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  } else passed++;
}

const pulledYesterday = { lastSuccessfulSyncAt: new Date(pdt('2026-10-15T16:50')).toISOString(), syncInProgress: false };

// --- not due -------------------------------------------------------------------------
reset('2026-10-16T05:55', pulledYesterday);
await wake();
check('5:55 AM: nothing to do', [T.calls, T.beats], [[], ['skipped-not-due']]);

// --- a quiet morning: five quick stages fit in one wake-up -----------------------------
reset('2026-10-16T06:00', pulledYesterday);
T.stageMs = { customers: 5_000, 'repair-orders': 5_000, appointments: 5_000, performance: 5_000, extended: 5_000 };
await wake();
check('6:00 AM: starts and runs every stage', T.calls, ['start', 'customers', 'repair-orders', 'appointments', 'performance', 'extended']);
check('and says it pulled', T.beats, ['pulled']);
T.calls = []; T.beats = []; T.now = pdt('2026-10-16T06:05');
await wake();
check('6:05 AM after that: not due again', T.beats, ['skipped-not-due']);

// --- a slow morning: stops before the limit, carries on next wake-up ---------------------
reset('2026-10-16T06:00', pulledYesterday);
T.stageMs = { customers: 15_000, 'repair-orders': 25_000, appointments: 15_000, performance: 20_000, extended: 10_000 };
await wake();
check('stops starting stages after 35 s (two done)', T.calls, ['start', 'customers', 'repair-orders']);
check('and says it is part way', T.beats, ['in-progress']);
T.calls = []; T.beats = []; T.now = pdt('2026-10-16T06:05');
await wake();
check('6:05: carries on where it stopped, no restart', T.calls, ['appointments', 'performance']);
T.calls = []; T.beats = []; T.now = pdt('2026-10-16T06:10');
await wake();
check('6:10: finishes', [T.calls, T.beats], [['extended'], ['pulled']]);

// --- a stage cut off by Netlify: the lock is left behind, the stage is rerun ----------------
reset('2026-10-16T06:05', {
  ...pulledYesterday,
  syncInProgress: true,
  syncStartedAt: new Date(pdt('2026-10-16T06:00:40')).toISOString(),
  stagedRun: { runId: new Date(pdt('2026-10-16T06:00')).toISOString(), triggeredBy: 'cron', completedStages: ['customers'] },
});
await wake();
check('the stage that was cut off runs again, then the rest', T.calls, ['repair-orders', 'appointments', 'performance', 'extended']);
check('and it finishes', T.beats, ['pulled']);

// --- someone else is mid-stage right now --------------------------------------------------
reset('2026-10-16T06:05', {
  ...pulledYesterday,
  syncInProgress: true,
  syncStartedAt: new Date(pdt('2026-10-16T06:04:30')).toISOString(),
  stagedRun: { runId: new Date(pdt('2026-10-16T06:00')).toISOString(), triggeredBy: 'cron', completedStages: ['customers'] },
});
await wake();
check('a scheduled pull touched 30 s ago is left alone', [T.calls, T.beats], [[], ['skipped-already-running']]);

reset('2026-10-16T16:45', {
  ...pulledYesterday,
  syncInProgress: true,
  syncStartedAt: new Date(pdt('2026-10-16T16:44:40')).toISOString(),
  stagedRun: { runId: new Date(pdt('2026-10-16T16:40')).toISOString(), triggeredBy: 'manual', completedStages: ['customers'] },
});
await wake();
check('a manual "Pull changes" in progress is left alone', [T.calls, T.beats], [[], ['skipped-already-running']]);

// --- an old abandoned manual lock does not block the schedule ------------------------------
reset('2026-10-16T06:00', {
  ...pulledYesterday,
  syncInProgress: true,
  syncStartedAt: new Date(pdt('2026-10-15T18:00')).toISOString(),
  stagedRun: { runId: new Date(pdt('2026-10-15T18:00')).toISOString(), triggeredBy: 'manual', completedStages: [] },
});
await wake();
check("yesterday's abandoned manual pull doesn't stop 6 AM", T.calls[0], 'start');

// --- a failing stage ---------------------------------------------------------------------
reset('2026-10-16T06:00', pulledYesterday);
T.failOn = 'appointments';
await wake();
check('a PBS error stops the run and is recorded', [T.calls, T.beats], [['start', 'customers', 'repair-orders', 'appointments'], ['failed']]);

// --- a run that never finishes is given up on, visibly -----------------------------------------
reset('2026-10-16T07:35', {
  ...pulledYesterday,
  syncInProgress: true,
  syncStartedAt: new Date(pdt('2026-10-16T07:30')).toISOString(),
  stagedRun: { runId: new Date(pdt('2026-10-16T06:00')).toISOString(), triggeredBy: 'cron', completedStages: ['customers'] },
});
await wake();
check('after 90 minutes: failed and logged, not retried forever', [T.calls, T.beats], [['give-up'], ['failed']]);

// --- the afternoon pull ------------------------------------------------------------------
reset('2026-10-16T16:45', { lastSuccessfulSyncAt: new Date(pdt('2026-10-16T06:03')).toISOString(), syncInProgress: false });
await wake();
check('4:45 PM: starts the afternoon pull', T.calls.slice(0, 2), ['start', 'customers']);
T.calls = []; T.beats = []; T.now = pdt('2026-10-16T16:50');
await wake();
check('4:50 PM: a typical pull (~11 s a stage, as in the logs) is done by the second wake-up', T.beats, ['pulled']);

// --- the overnight backfill -------------------------------------------------------------------
reset('2026-10-16T02:00', pulledYesterday);
await wake();
check('2:00 AM, nothing due: one past month backfilled', [T.calls, T.beats], [['backfill'], ['backfilled']]);
reset('2026-10-16T02:05', pulledYesterday);
await wake();
check('2:05 AM: not again', [T.calls, T.beats], [[], ['skipped-not-due']]);

Date.now = realNow;
console.log = quiet;
rmSync(outDir, { recursive: true, force: true });
quiet(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
