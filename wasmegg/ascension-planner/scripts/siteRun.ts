/**
 * The site's own searches, from the command line: Smart search (`--effort`), the Full sweep
 * (`--bands`) and Highest TE by a date (`--by-date`), with `--submit` sending the result to the board.
 *
 * NOT A COPY. Each one is the planner's chain-search store (src/stores/chainSearch.ts) doing exactly
 * what it does in the browser: the same pre-flight checks, pool, driver, result checks, CSV, and the
 * same submission builder and send. The only thing swapped is the worker: the browser starts a Web
 * Worker, and here the pool is handed a Node worker thread running the very same worker module
 * (scripts/node-worker.ts, via search/pool.ts `setDefaultWorkerSpawn`). So a result from here and one
 * from the browser, from the same save and settings, are the same result, and they go on the board
 * the same way.
 *
 * The command line's older tools (`--exhaustive --range`, `--stages`, `--grid`, the what-ifs and the
 * diagnostics) stay in fastsearch.ts on their own evaluator: none of them is something the site does.
 *
 * The scripts/pc harness (zz_e2e_fine.spec.ts) proved the store runs under Node this way; this is the
 * same idea without vitest.
 */
import { writeFileSync } from 'node:fs';
import { Worker as NodeWorker } from 'node:worker_threads';
import { watch } from 'vue';
import { setDefaultWorkerSpawn } from '@/search/pool';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { sendRunResult } from '@/search/sendRun';
import { eggDayYearOf } from '@/lib/eggDay';
import type { Availability } from '@/search/availability';
import type { Milestone } from '@/search/milestones';
import type { TimeOffDates } from '@/search/timeOff';
import type { EffortTier } from '@/search/types';

export type SiteKind = 'smart' | 'full' | 'by-date';

export interface SiteRunOptions {
  kind: SiteKind;
  /** The account the run is for (the player ID, or the save's own user id). Only ever hashed, on
   *  this machine, to find the account's owner code (search/owner.ts); never sent. */
  account: string;
  jobs: number;
  tz: string;
  startDate: string;
  startTime: string;
  final: number;
  availability: Availability | null;
  deferShifts: boolean;
  milestones: Milestone[];
  timeOff: TimeOffDates[];
  forceContinue: boolean;
  /** Smart search. */
  effort: EffortTier;
  seed: number[];
  findSeed: boolean;
  minPrestiges: number;
  maxPrestiges: number;
  pin: number;
  /** Full sweep: one band per checkpoint, as typed and parsed; the sweep tag, if any. */
  bandsText: string;
  bands: number[][];
  minGap: number;
  tag: string | null;
  /** Highest TE by a date. `chains` set means "I'll set the stops"; null means "Pick them for me". */
  deadline: number;
  chains: { asc: number; bands: number[][] }[] | null;
  lastRange: [number, number] | null;
  minStops: number;
  maxStops: number;
  lastHi: number;
  step: number;
  maxShapes: number;
  ascendNeeded: boolean;
  /** Send the result when it finishes (stopped early, it still sends: the board marks it partial). */
  submit: { nickname: string; csv: boolean } | null;
  csvPath: string | null;
  top: number;
}

/** A Node worker thread dressed as the Web Worker the pool expects (onmessage, onerror, postMessage,
 *  terminate: all the pool uses). */
function nodeWorker(): Worker {
  const thread = new NodeWorker(new URL('./chain-worker.js', import.meta.url));
  let ended = false;
  const w = {
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onerror: null as ((e: { message: string }) => void) | null,
    postMessage(message: unknown) {
      thread.postMessage(message);
    },
    terminate() {
      ended = true;
      void thread.terminate();
    },
  };
  thread.on('message', data => w.onmessage?.({ data }));
  thread.on('error', err => w.onerror?.({ message: err.message }));
  thread.on('exit', code => {
    if (!ended && code !== 0) w.onerror?.({ message: `worker thread exited with code ${code}` });
  });
  return w as unknown as Worker;
}

function days(seconds: number): string {
  return (seconds / 86400).toFixed(3) + ' d';
}

/** Run one of the site's searches; resolves to the process exit code. */
export async function runSiteSearch(o: SiteRunOptions): Promise<number> {
  setDefaultWorkerSpawn(nodeWorker);
  const store = useChainSearchStore();
  const planner = useAutoPlannerStore();
  const show = (unix: number) =>
    new Date(unix * 1000).toLocaleString('en-US', {
      timeZone: o.tz,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  // The settings, set where the site's panels set them.
  planner.timezone = o.tz;
  planner.startDate = o.startDate;
  planner.startTime = o.startTime;
  store.finalTE = o.final;
  store.forceContinue = o.forceContinue;
  store.workerBudget = Math.max(1, Math.min(store.machineThreads, o.jobs));
  store.scheduleEnabled = !!o.availability;
  if (o.availability) {
    store.availableFrom = o.availability.fromHour;
    store.availableTo = o.availability.toHour;
    store.availableDays = o.availability.days.length ? [...o.availability.days] : [0, 1, 2, 3, 4, 5, 6];
  }
  store.deferShifts = o.deferShifts;
  store.milestones = o.milestones;
  store.timeOff = o.timeOff;
  store.effort = o.effort;
  store.seedOverride = o.seed.join(' ');
  store.findSeedFirst = o.findSeed;
  store.minPrestiges = o.minPrestiges;
  store.maxPrestiges = o.maxPrestiges;
  store.pin = o.pin;
  store.sweepTag = o.kind === 'full' && o.tag ? { preset: o.tag, bands: o.bandsText, minGap: o.minGap } : null;
  store.submitsWhenDone = !!o.submit;

  const label = o.kind === 'smart' ? 'Smart search' : o.kind === 'full' ? 'Full sweep' : 'Highest TE by a date';
  console.log(
    `\n--- ${label} (the site's own search), ${store.workerBudget} worker thread${store.workerBudget === 1 ? '' : 's'}` +
      `, plan start ${show(store.planStart)}`
  );
  if (o.submit) {
    console.log(
      `    sends to ${store.leaderboardUrl || '(no collector configured: pass --collector URL)'} when it finishes` +
        `, ${o.submit.nickname ? `as "${o.submit.nickname}"` : 'anonymously'}`
    );
    if (!store.submitUrl) return 1;
  }

  // Progress, every 15 seconds and whenever the stage changes.
  let lastStage = '';
  let lastPrint = 0;
  const stopWatching = watch(
    () => store.runProgress,
    p => {
      if (!p) return;
      const now = Date.now();
      if (p.stage === lastStage && now - lastPrint < 15000) return;
      lastStage = p.stage;
      lastPrint = now;
      const total = p.total ? ` of ${p.total.toLocaleString()}` : '';
      const best = p.best ? `   best ${p.best.chain.join(' ')} -> ${p.best.te} on ${show(p.best.at)}` : '';
      console.log(`  ${p.stage}: ${p.done.toLocaleString()}${total} ${p.unit}${best}`);
    },
    { deep: true }
  );

  // Ctrl+C once: stop and keep the best so far, as the site's Stop does (and still send, marked
  // partial, when --submit was asked). Twice: quit at once.
  let interrupts = 0;
  const onSigint = () => {
    interrupts++;
    if (interrupts > 1) process.exit(130);
    console.log('\n  stopping: keeping the best so far (Ctrl+C again to quit at once)');
    store.stopRun();
  };
  process.on('SIGINT', onSigint);

  // Checkpoints, saved runs and the date search's carry-on (search/persistence.ts and friends) are
  // kept in the browser's IndexedDB, which Node has none of: the store warns at each failed write and
  // carries on. Said once here instead of at every chunk. Recognised by the error itself (no
  // indexedDB to open), so any other warning still shows.
  const noIndexedDb = (args: unknown[]) =>
    args.some(a => a instanceof Error && /reading 'open'|indexedDB/.test(a.message));
  const consoleError = console.error;
  const consoleWarn = console.warn;
  let storageNoted = false;
  const quiet =
    (original: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (!noIndexedDb(args)) return original(...args);
      if (!storageNoted)
        console.log('  (no checkpoints on the command line: a run stopped here starts again from the top)');
      storageNoted = true;
    };
  console.error = quiet(consoleError);
  console.warn = quiet(consoleWarn);

  const startedAt = Date.now();
  try {
    if (o.kind === 'smart') {
      await store.start(o.account, { recheck: !!o.submit });
    } else if (o.kind === 'full') {
      const n = o.bands.length + 1;
      await store.startExhaustive(
        o.account,
        { lo: 0, hi: 0, step: 1, minAsc: n, maxAsc: n, minGap: o.minGap, bands: o.bands.map(b => [...b]) },
        { recheck: !!o.submit }
      );
    } else if (o.chains && o.lastRange) {
      const counts = o.chains.map(c => c.asc);
      await store.startDeadline(o.account, {
        deadline: o.deadline,
        minStops: Math.min(...counts),
        maxStops: Math.max(...counts),
        lastLo: o.lastRange[0],
        lastHi: o.lastRange[1],
        step: 1,
        ascendNeeded: o.ascendNeeded,
        extend: true,
        bandSets: o.chains.map(c => (c.asc <= 1 ? [] : c.bands.map(b => [...b]))),
      });
    } else {
      await store.startDeadline(o.account, {
        deadline: o.deadline,
        minStops: o.minStops,
        maxStops: o.maxStops,
        lastHi: Math.min(490, o.lastHi),
        step: o.step,
        maxShapes: o.maxShapes,
        ascendNeeded: o.ascendNeeded,
        extend: true,
      });
    }
  } finally {
    console.error = consoleError;
    console.warn = consoleWarn;
    stopWatching();
    process.off('SIGINT', onSigint);
    store.submitsWhenDone = false;
  }

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  if (store.error) console.error(`\n  ${store.error}`);

  // ------------------------------------------------------------------ the answer
  if (o.kind === 'by-date') {
    const r = store.deadlineResult;
    const best = r && r.at >= startedAt ? r.routes[0] : null;
    if (!r || !best) {
      console.error('\n  no route reaches anything by that date');
      return 1;
    }
    console.log(
      `\n=== done (${minutes} min, ${r.priced.toLocaleString()} routes${r.stoppedEarly ? ', stopped early' : ''})`
    );
    console.log(`\n  ${best.chain.join(' ')}   reaches ${best.chain[best.chain.length - 1]} on ${show(best.reachAt)}`);
    for (const route of r.routes.slice(1, o.top + 1)) {
      console.log(`    ${route.chain.join(' ')}   ${route.chain[route.chain.length - 1]} on ${show(route.reachAt)}`);
    }
    if (o.csvPath) {
      writeFileSync(o.csvPath, store.deadlineCsv());
      console.log(`\n  routes -> ${o.csvPath}`);
    }
    if (o.submit && !store.error) {
      const payload = store.buildDeadlineSubmission(best, o.submit.nickname);
      if (!payload) {
        console.error('\n  not sent: nothing to send');
        return 1;
      }
      const res = await store.sendSubmission(payload, o.submit.csv ? store.deadlineCsv() : undefined);
      const year = eggDayYearOf(r.deadline);
      console.log(
        res.ok
          ? `\n  sent: ${res.message} (Compare > ${year ? `Egg Day ${year}` : 'By a date'})`
          : `\n  not sent: ${res.message}`
      );
      return res.ok ? 0 : 1;
    }
    return store.error ? 1 : 0;
  }

  // A refused start (another check failed) leaves the last run's numbers; only this run's count.
  const ran = store.runStartedAt >= startedAt && store.bestDays > 0;
  if (!ran) return 1;
  const seconds = store.bestDays * 86400;
  console.log(
    `\n=== done (${minutes} min, ${store.chainsDone.toLocaleString()} chains${store.stoppedEarly ? ', stopped early' : ''})`
  );
  console.log(`\n  ${days(seconds)}   ${store.bestChain.join(' ')}`);
  console.log(`    ends ${show((store.planStartUsed || store.planStart) + seconds)}`);
  const rows = store.shortlist.slice(1, o.top + 1);
  if (rows.length) {
    console.log('\n  next best:');
    for (const row of rows) console.log(`    ${days(row.seconds)}  +${days(row.gapSeconds)}   ${row.chain.join(' ')}`);
  }
  if (o.csvPath) {
    writeFileSync(o.csvPath, store.exportCsv());
    console.log(`\n  every chain priced -> ${o.csvPath}`);
  }
  if (o.submit && !store.error) {
    // The site's own send (search/sendRun.ts): summary, then the table, with its re-checks.
    const res = await sendRunResult(store, o.submit.nickname, o.submit.csv, stage => console.log(`  ${stage}`));
    console.log(res.ok ? `\n  sent: ${res.text}` : `\n  ${res.text}`);
    return res.ok ? 0 : 1;
  }
  return store.error ? 1 : 0;
}
