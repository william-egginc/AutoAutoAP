/**
 * The site's own searches, from the command line: Smart search (`--effort`), the Full sweep
 * (`--bands`, `--suggest`, `--preset`) and Highest TE by a date (`--by-date`, `--egg-day`), with
 * `--submit` sending the result to the board, or `--out DIR` leaving it on disk to send later.
 *
 * NOT A COPY. Each one is the planner's chain-search store (src/stores/chainSearch.ts) doing exactly
 * what it does in the browser: the same pre-flight checks, pool, driver, result checks, CSV, and the
 * same submission builder and send. The only thing swapped is the worker: the browser starts a Web
 * Worker, and here the pool is handed a Node worker thread running the very same worker module
 * (scripts/node-worker.ts, via search/pool.ts `setDefaultWorkerSpawn`). So a result from here and one
 * from the browser, from the same save and settings, are the same result, and they go on the board
 * the same way.
 *
 * CHECKPOINTS. The store keeps a run's priced chains in IndexedDB. With `--out DIR`, fastsearch.ts
 * installs a file-backed IndexedDB under DIR (scripts/node-idb.ts), so the store's own checkpoint and
 * carry-on code works unchanged: this file only has to ask for the resume (Smart search, By a date) or
 * start the same space again (Full sweep, which replays what it finds). See `resume` below.
 *
 * The command line's older tools (`--exhaustive --range`, `--stages`, `--grid`, the what-ifs and the
 * diagnostics) stay in fastsearch.ts on their own evaluator: none of them is something the site does.
 *
 * The scripts/pc harness (zz_e2e_fine.spec.ts) proved the store runs under Node this way; this is the
 * same idea without vitest.
 */
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { Worker as NodeWorker } from 'node:worker_threads';
import { watch } from 'vue';
import { setDefaultWorkerSpawn } from '@/search/pool';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { sendRunResult } from '@/search/sendRun';
import { eggDayYearOf } from '@/lib/eggDay';
import { sentence } from '@/utils/errors';
import { hashID } from '@/lib/storage/db';
import { scrubIdentifiers } from '@/search/submission';
import { countBanded, formatBands, formatHours } from '@/search/exhaustive';
import { sweepSeconds, workerSecondsPerChain } from '@/search/speed';
import { coverageAfterText, coverageBeforeText } from '@/search/bandCheck';
import { countSpaceShapes } from '@/search/deadline';
import { estimateNote, plannedRoutes } from '@/search/deadlineEstimate';
import { buildOfflineSubmission, CSV_FILE, edgeLines, SUBMISSION_FILE, type OfflineKind } from '@/search/offline';
import type { Availability } from '@/search/availability';
import type { Milestone } from '@/search/milestones';
import type { TimeOffDates } from '@/search/timeOff';
import type { EffortTier } from '@/search/types';

export type SiteKind = 'smart' | 'full' | 'by-date';

/** One space of the Full sweep: a count of ascensions and a band per checkpoint. The panel queues
 *  these ("more chains for the same click"); `auto` ones are the neighbouring counts Suggest a space
 *  adds, which are cheaper and the player's to drop. */
export interface FullSweep {
  asc: number;
  bandsText: string;
  bands: number[][];
  minGap: number;
  /** A Science sweep's name (e.g. M2), when this space is that sweep's own. */
  tag: string | null;
  auto: boolean;
}

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
  /** Full sweep: the first space, then any queued after it. */
  sweeps: FullSweep[];
  /** Widen a band the winner sits on the edge of and run again, up to this many times. */
  widen: number;
  /** Highest TE by a date. `chains` set means "I'll set the stops"; null means the retired "Pick them
   *  for me" (still here for reproducing an old run). */
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
  /** `--out DIR`: leave the table and a submission file here for `submit --from`. */
  out: { dir: string; nickname: string; csv: boolean; plainCsv: boolean } | null;
  /** A plain CSV at this path (`--csv`). */
  csvPath: string | null;
  top: number;
  /** Ask the store to carry on from a checkpoint when it finds one for these settings. */
  resume: boolean;
  /** Say what would run, and about how long it takes on the board's typical speeds, then stop. */
  dryRun: boolean;
  /** Called with the run's state as it changes, so the directory can say "running", "stopped"... */
  onStatus?: (status: 'running' | 'stopped' | 'done' | 'failed') => void;
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

/** Chunks of text to a gzip file, one at a time, so a table of hundreds of thousands of chains never
 *  exists as one string. Resolves when the file is closed. */
async function writeGzip(path: string, chunks: Iterable<string>): Promise<void> {
  const gz = createGzip();
  const file = createWriteStream(path);
  const done = new Promise<void>((resolve, reject) => {
    file.on('finish', resolve);
    file.on('error', reject);
    gz.on('error', reject);
  });
  gz.pipe(file);
  for (const chunk of chunks) {
    if (!gz.write(chunk)) await new Promise<void>(r => gz.once('drain', () => r()));
  }
  gz.end();
  await done;
}

async function writePlain(path: string, chunks: Iterable<string>): Promise<void> {
  const file = createWriteStream(path);
  const done = new Promise<void>((resolve, reject) => {
    file.on('finish', resolve);
    file.on('error', reject);
  });
  for (const chunk of chunks) {
    if (!file.write(chunk)) await new Promise<void>(r => file.once('drain', () => r()));
  }
  file.end();
  await done;
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
  if (o.out) console.log(`    files for \`submit --from\` go to ${o.out.dir}`);
  if (o.dryRun) return dryRun(o, store);
  const partition = await hashID(o.account);

  // Progress, every 15 seconds and whenever the stage changes.
  let lastStage = '';
  let lastPrint = 0;
  let saidReplayed = false;
  const stopWatching = watch(
    () => store.runProgress,
    p => {
      if (!p) return;
      if (!saidReplayed && store.chainsReplayed > 0) {
        saidReplayed = true;
        console.log(`  ${store.chainsReplayed.toLocaleString()} chains were already priced (this run's checkpoint): they replay at no cost`);
      }
      const now = Date.now();
      if (p.stage === lastStage && now - lastPrint < 15000) return;
      lastStage = p.stage;
      lastPrint = now;
      const total = p.total ? ` of ${p.total.toLocaleString()}` : '';
      const left = p.secondsLeft && p.secondsLeft > 60 ? `   ~${(p.secondsLeft / 3600).toFixed(1)} h left` : '';
      const best = p.best ? `   best ${p.best.chain.join(' ')} -> ${p.best.te} on ${show(p.best.at)}` : '';
      // The By a date total is a guess until enough sets have finished; then it is re-worked from what
      // they cost, and the note says so (as the panel does).
      const learned = p.kind === 'by-date' ? estimateNote(store.deadlineEstimateNow) : '';
      const rss = `rss ${Math.round(process.memoryUsage().rss / 1048576).toLocaleString()} MB`;
      console.log(`  ${p.stage}: ${p.done.toLocaleString()}${total} ${p.unit}${left}   ${rss}${best}${learned ? `   (${learned})` : ''}`);
    },
    { deep: true }
  );

  // Ctrl+C once: stop and keep the best so far, as the site's Stop does (and still send, marked
  // partial, when --submit was asked). Twice: quit at once.
  let interrupts = 0;
  const onSigint = () => {
    interrupts++;
    if (interrupts > 1) process.exit(130);
    console.log(
      `\n  stopping: keeping the best so far${o.out ? '; the checkpoint is kept, so running the same command again carries on' : ''} (Ctrl+C again to quit at once)`
    );
    store.stopRun();
  };
  process.on('SIGINT', onSigint);

  // Without --out there is no database for the store's checkpoints and saved runs, so it warns at each
  // failed write and carries on. Said once here instead of at every chunk. Recognised by the error
  // itself (no indexedDB to open), so any other warning still shows.
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
        console.log('  (no checkpoints without --out DIR: a run stopped here starts again from the top)');
      storageNoted = true;
    };
  console.error = quiet(consoleError);
  console.warn = quiet(consoleWarn);

  o.onStatus?.('running');
  try {
    const code =
      o.kind === 'by-date'
        ? await runByDate(o, store, show, partition)
        : await runChains(o, store, show, partition);
    o.onStatus?.(store.error || code ? 'failed' : store.stoppedEarly || store.deadlineResult?.stoppedEarly ? 'stopped' : 'done');
    return code;
  } catch (e) {
    o.onStatus?.('failed');
    throw e;
  } finally {
    console.error = consoleError;
    console.warn = consoleWarn;
    stopWatching();
    process.off('SIGINT', onSigint);
    store.submitsWhenDone = false;
  }
}

type Store = ReturnType<typeof useChainSearchStore>;

/** `--dry-run`: the size of what would run, as the panels show it before Start. Nothing is simulated. */
function dryRun(o: SiteRunOptions, store: Store): number {
  const workers = store.workerBudget;
  const eta = (chains: number, asc: number) =>
    `about ${formatHours(sweepSeconds(chains, workers, workerSecondsPerChain(asc)) / 3600)} at the board's typical speed on ${workers} workers`;
  console.log('\n  dry run: nothing is priced.');
  if (o.kind === 'full') {
    for (const sp of o.sweeps) {
      const chains = sp.asc <= 1 ? 1 : countBanded(sp.bands, o.final, store.currentTE, sp.minGap);
      console.log(`  ${sp.asc} ascension${sp.asc === 1 ? '' : 's'}${sp.tag ? ` (${sp.tag})` : ''}: ${chains.toLocaleString()} chains, ${eta(chains, sp.asc)}${sp.asc > 1 ? `\n    ${formatBands(sp.bands)}   minimum gap ${sp.minGap}` : ''}`);
    }
  } else if (o.kind === 'by-date' && o.chains && o.lastRange) {
    const sets = countSpaceShapes(o.chains, store.currentTE, o.lastRange[1]);
    const routes = plannedRoutes({ sets, workers, currentTE: store.currentTE, rememberedPerSet: store.deadlineRoutesPerSet });
    console.log(`  ${sets.toLocaleString()} sets of early stops, about ${routes.toLocaleString()} routes (re-worked from what the sets cost as it runs), ${eta(routes, Math.max(...o.chains.map(c => c.asc)))}`);
  } else if (o.kind === 'smart') {
    const n = store.estimateForCurrentSettings;
    console.log(`  up to about ${n.toLocaleString()} chains (an upper bound: it stops when no axis moves), ${eta(n, 5)}`);
  }
  return 0;
}

/** The directory one chain's files go in: DIR itself for one chain, DIR/chain-K-Nasc for a queue. */
function chainDir(base: string, k: number, count: number, asc: number): string {
  return count === 1 ? base : join(base, `chain-${k + 1}-${asc}asc`);
}

// ---------------------------------------------------------------- Smart search and the Full sweep

async function runChains(
  o: SiteRunOptions,
  store: Store,
  show: (unix: number) => string,
  partition: string
): Promise<number> {
  const spaces: (FullSweep | null)[] = o.kind === 'full' ? o.sweeps : [null];
  if (o.kind === 'full') {
    const counts = o.sweeps.filter(s => s.asc <= 1 || countBanded(s.bands, o.final, store.currentTE, s.minGap) > 0).map(s => s.asc);
    console.log(`  ${coverageBeforeText([...new Set(counts)].sort((a, b) => a - b), 'add --neighbours (or use --suggest) to try the counts either side')}`);
  }

  let worst = 0;
  let best: { days: number; chain: number[]; dir: string | null } | null = null;
  for (let k = 0; k < spaces.length; k++) {
    const space = spaces[k];
    if (spaces.length > 1) {
      console.log(`\n=== chain ${k + 1} of ${spaces.length}: ${space!.asc} ascension${space!.asc === 1 ? '' : 's'}${space!.auto ? ' (a neighbouring count, added like Suggest a space does)' : ''}`);
    }
    // The sweep's own name, only for the space it names (the site clears it as soon as the box is edited).
    store.sweepTag = space?.tag ? { preset: space.tag, bands: space.bandsText, minGap: space.minGap } : null;

    const startedAt = Date.now();
    let current = space;
    let rounds = 0;
    for (;;) {
      if (o.kind === 'smart') {
        // The store's own carry-on: a checkpoint for these settings (same save, plan start and
        // schedule) is picked up where it stopped, and a finished one replays under a higher tier.
        let resume = false;
        if (o.resume) {
          await store.checkResumable(o.account);
          const cp = store.resumable;
          if (cp) {
            resume = true;
            console.log(`  checkpoint found: ${cp.durations.length.toLocaleString()} chains already priced${cp.complete ? ' (a finished run: they replay at no cost)' : ''}; carrying on`);
          }
        }
        await store.start(o.account, { recheck: !!o.submit, resume });
      } else {
        const n = current!.asc;
        await store.startExhaustive(
          o.account,
          { lo: 0, hi: 0, step: 1, minAsc: n, maxAsc: n, minGap: current!.minGap, ...(n > 1 ? { bands: current!.bands.map(b => [...b]) } : {}) },
          { recheck: !!o.submit && spaces.length === 1 }
        );
        // The winner on the first or last value of its band, with room to go further.
        const sp = store.searchSpace;
        if (current && current.asc > 1 && sp?.bands?.length && store.bestDays > 0 && !store.error && !store.stoppedEarly) {
          const edge = edgeLines({
            bands: sp.bands,
            chain: store.bestChain,
            currentTE: store.currentTE,
            finalTE: store.finalTE,
            minGap: sp.minGap,
            countChains: b => countBanded(b, store.finalTE, store.currentTE, sp.minGap),
            hint: o.widen ? (rounds < o.widen ? 'running it next' : `raise --widen past ${o.widen} to go further`) : undefined,
          });
          for (const line of edge.lines) console.log(line);
          if (edge.widened && rounds < o.widen) {
            rounds++;
            console.log(`  widening (round ${rounds} of up to ${o.widen}) and running again`);
            current = { ...current, bands: edge.widened.bands, bandsText: formatBands(edge.widened.bands) };
            store.sweepTag = null; // no longer that sweep's own space
            continue;
          }
        }
      }
      break;
    }

    if (store.error) console.error(`\n  ${store.error}`);
    // A refused start (another check failed) leaves the last run's numbers; only this run's count.
    const ran = store.runStartedAt >= startedAt && store.bestDays > 0;
    if (!ran) {
      worst = 1;
      continue;
    }
    const seconds = store.bestDays * 86400;
    console.log(
      `\n=== done (${((Date.now() - startedAt) / 60000).toFixed(1)} min, ${store.chainsDone.toLocaleString()} chains${store.stoppedEarly ? ', stopped early' : ''})`
    );
    if (current && o.kind === 'full' && store.searchSpace) {
      console.log(`  ${coverageAfterText(store.searchSpace.minAscensions, store.searchSpace.maxAscensions)}`);
    }
    console.log(`\n  ${days(seconds)}   ${store.bestChain.join(' ')}`);
    console.log(`    ends ${show((store.planStartUsed || store.planStart) + seconds)}`);
    const rows = store.shortlist.slice(1, o.top + 1);
    if (rows.length) {
      console.log('\n  next best:');
      for (const row of rows) console.log(`    ${days(row.seconds)}  +${days(row.gapSeconds)}   ${row.chain.join(' ')}`);
    }
    if (o.csvPath && spaces.length === 1) {
      await writePlain(o.csvPath, store.exportCsvChunks());
      console.log(`\n  every chain priced -> ${o.csvPath}`);
    }
    let dir: string | null = null;
    if (o.out) {
      dir = chainDir(o.out.dir, k, spaces.length, current?.asc ?? store.bestChain.length);
      await writeRunFiles(o, store, 'chains', dir, partition);
    }
    if (!best || store.bestDays < best.days) best = { days: store.bestDays, chain: [...store.bestChain], dir };

    if (o.submit && !store.error) {
      // The site's own send (search/sendRun.ts): summary, then the table, with its re-checks.
      const res = await sendRunResult(store, o.submit.nickname, o.submit.csv, stage => console.log(`  ${stage}`));
      console.log(`\n  ${res.text}`);
      if (!res.ok) worst = 1;
    }
    if (store.error) worst = 1;
    if (store.stoppedEarly) break;
  }

  if (spaces.length > 1 && best) {
    console.log(`\n=== best of the ${spaces.length} chains: ${days(best.days * 86400)}   ${best.chain.join(' ')}${best.dir ? `   (${best.dir})` : ''}`);
  }
  return worst;
}

/** The table and the submission file for the run that just finished, into `dir`. */
async function writeRunFiles(
  o: SiteRunOptions,
  store: Store,
  kind: 'chains' | 'by-date',
  dir: string,
  partition: string,
  route?: Parameters<Store['buildDeadlineSubmission']>[0]
): Promise<void> {
  if (!o.out) return;
  mkdirSync(dir, { recursive: true });
  const nickname = o.out.nickname;
  const payload = kind === 'chains' ? store.buildRunSubmission(nickname) : route ? store.buildDeadlineSubmission(route, nickname) : null;
  const csvFile = join(dir, CSV_FILE);
  if (o.out.csv) {
    if (kind === 'chains') {
      await writeGzip(csvFile, store.exportCsvChunks());
      if (o.out.plainCsv) await writePlain(join(dir, 'run.csv'), store.exportCsvChunks());
    } else {
      const text = scrubIdentifiers(store.deadlineCsv());
      await writeGzip(csvFile, [text]);
      if (o.out.plainCsv) writeFileSync(join(dir, 'run.csv'), text);
    }
    console.log(`\n  table -> ${csvFile}`);
  }
  if (!payload) {
    console.error('\n  no submission file: nothing to send');
    return;
  }
  const file = buildOfflineSubmission({
    kind: kind === 'by-date' ? 'by-date' : o.kind === 'smart' ? 'smart' : ('full' satisfies OfflineKind),
    payload,
    partition,
    resultKey: store.safeResultKey(),
    csv: o.out.csv,
    stoppedEarly: kind === 'by-date' ? !!store.deadlineResult?.stoppedEarly : store.stoppedEarly,
  });
  writeFileSync(join(dir, SUBMISSION_FILE), JSON.stringify(file, null, 2));
  console.log(`  submission -> ${join(dir, SUBMISSION_FILE)}   (send it later, online, with: fastsearch submit --from ${dir})`);
}

// ---------------------------------------------------------------- Highest TE by a date

async function runByDate(
  o: SiteRunOptions,
  store: Store,
  show: (unix: number) => string,
  partition: string
): Promise<number> {
  const startedAt = Date.now();
  if (o.resume) {
    await store.loadDeadlineState(o.account);
    const u = store.deadlineUnfinished;
    if (u) {
      console.log(`  checkpoint found: ${u.priced.toLocaleString()} routes already priced${u.saveKept ? '' : ' (its save was not kept, so it cannot carry on)'}; carrying on`);
      if (u.saveKept) await store.resumeDeadline(o.account);
    }
  }
  if (!store.deadlineRunning && !(store.deadlineResult && store.deadlineResult.at >= startedAt)) {
    if (o.chains && o.lastRange) {
      const counts = o.chains.map(c => c.asc);
      const rows = o.chains.map(c => ({ asc: c.asc, bands: c.bands }));
      const sets = countSpaceShapes(rows, store.currentTE, o.lastRange[1]);
      await store.startDeadline(o.account, {
        deadline: o.deadline,
        minStops: Math.min(...counts),
        maxStops: Math.max(...counts),
        lastLo: o.lastRange[0],
        lastHi: o.lastRange[1],
        step: 1,
        ascendNeeded: o.ascendNeeded,
        estimate: plannedRoutes({
          sets,
          workers: store.workerBudget,
          currentTE: store.currentTE,
          rememberedPerSet: store.deadlineRoutesPerSet,
        }),
        extend: true,
        bandSets: o.chains.map(c => (c.asc <= 1 ? [] : c.bands.map(b => [...b]))),
        sets,
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
  }

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  if (store.error) console.error(`\n  ${store.error}`);
  const r = store.deadlineResult;
  const best = r && r.at >= startedAt ? r.routes[0] : null;
  if (!r || !best) {
    console.error('\n  no route reaches anything by that date');
    return 1;
  }
  console.log(
    `\n=== done (${minutes} min, ${r.priced.toLocaleString()} routes${r.stoppedEarly ? ', stopped early' : ''})`
  );
  // As the panel's table head says it: a complete walk of the player's own space is a finished run.
  if (!r.step && !r.stoppedEarly) console.log(`  Every route in your space: ${r.priced.toLocaleString()} priced, run complete.`);
  else if (r.stoppedEarly) console.log('  Stopped early: the best so far, not necessarily the highest reachable. The checkpoint is kept.');
  console.log(`\n  ${best.chain.join(' ')}   reaches ${best.chain[best.chain.length - 1]} on ${show(best.reachAt)}`);
  for (const route of r.routes.slice(1, o.top + 1)) {
    console.log(`    ${route.chain.join(' ')}   ${route.chain[route.chain.length - 1]} on ${show(route.reachAt)}`);
  }
  if (o.csvPath) {
    writeFileSync(o.csvPath, store.deadlineCsv());
    console.log(`\n  routes -> ${o.csvPath}`);
  }
  if (o.out) await writeRunFiles(o, store, 'by-date', o.out.dir, partition, best);
  if (o.submit && !store.error) {
    const payload = store.buildDeadlineSubmission(best, o.submit.nickname);
    if (!payload) {
      console.error('\n  not sent: nothing to send');
      return 1;
    }
    const res = await store.sendSubmission(payload, o.submit.csv ? store.deadlineCsv() : undefined);
    const year = eggDayYearOf(r.deadline);
    // Worded as the site's Share says it (DeadlinePanel.vue `share`).
    console.log(
      res.ok
        ? `\n  ${res.duplicate === 'exact' ? res.message : `Thanks! ${sentence(res.message)}`} It's on Compare > ${year ? `Egg Day ${year}` : 'By a date'}.`
        : `\n  Not sent: ${res.message}`
    );
    return res.ok ? 0 : 1;
  }
  return store.error ? 1 : 0;
}
