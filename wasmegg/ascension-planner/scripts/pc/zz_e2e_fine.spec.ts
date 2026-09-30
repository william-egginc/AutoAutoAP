/**
 * END-TO-END, NOT COMMITTED. Runs the planner's real Insane-mode path on a saved backup and submits
 * the result to the live collector, the way the Submit button does:
 *   initPlanFuture (backup served from disk instead of the game API)
 *   -> store.startExhaustive over the M1 preset bands (the Explorer link's own bands)
 *   -> store.buildRunSubmission + store.exportCsv + store.sendSubmission (token + gzip CSV)
 *   -> read the row and the CSV back from the collector and check them.
 * The only swap is the worker transport: the pool evaluates in-process, on the same sanitised
 * inputs the real pool posts to its workers. No player ID is used or sent.
 */
import '../../scripts/node-shims';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';

const BACKUP = process.env.E2E_BACKUP!;
const OUT = process.env.E2E_OUT!;
const log = (s: string) => appendFileSync(OUT, s + '\n');

vi.mock('@/lib/modes/fetchBackup', () => ({
  fetchPlayerBackup: async () => {
    const b = JSON.parse(readFileSync(BACKUP, 'utf8'));
    resolveColleggtibleContracts(b);
    return { backup: markRaw(b), pHash: 'local' };
  },
}));

vi.mock('@/search/pool', async orig => {
  const real = (await orig()) as Record<string, unknown>;
  const { createChainEvaluator } = await import('@/search/chain');
  const { sanitizeLongs } = await import('@/lib/artifacts/utils');
  const { splitByPrefix, workersForBatch } = await import('@/search/batch');
  const { integrityWaitSeconds } = await import('@/search/leg');
  type Result = { chain: number[]; seconds: number };
  return {
    ...real,
    createChainSearchPool: async (inputs: unknown) => {
      const clean = structuredClone(sanitizeLongs(inputs as never)) as Record<string, unknown>;
      // The continue rule under test (see --continue-pin-days); unset keeps the shipped default.
      if (process.env.E2E_PIN_DAYS) clean.continuePinSeconds = Number(process.env.E2E_PIN_DAYS) * 86400;
      const local = createChainEvaluator(clean as never);
      const workers = Number(process.env.E2E_WORKERS || 0);

      if (!workers) {
        // In-process: the same evaluator the browser's workers run, on the same sanitised inputs.
        return {
          size: 1,
          spawned: 1,
          suspendedSeconds: 0,
          async evaluate(chains: number[][], onDone?: (d: number, t: number) => void) {
            const before = local.legSims;
            const results = [];
            for (let i = 0; i < chains.length; i++) {
              const r = local.evaluate(chains[i]);
              if (r) results.push(r);
              onDone?.(i + 1, chains.length);
            }
            return { results, legSims: local.legSims - before, workersUsed: 1 };
          },
          async integrityWait() {
            return integrityWaitSeconds(clean as never);
          },
          terminate() {},
        };
      }

      // PARALLEL: the CLI's own `--worker` children (each loads the same backup and runs the same
      // chain.ts), dealt chains by prefix exactly as the browser pool deals them. The first result
      // of the run is re-priced in-process and must agree, so a run whose children were set up
      // differently from the store stops instead of saving a wrong answer.
      const { fork } = await import('node:child_process');
      const cli = (globalThis as unknown as { __E2E_CLI: { script: string; args: string[] } }).__E2E_CLI;
      const kids = await Promise.all(
        Array.from(
          { length: workers },
          (_, i) =>
            new Promise<ReturnType<typeof fork>>((res, rej) => {
              const c = fork(cli.script, [...cli.args, '--worker'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
              c.stderr?.on('data', d => {
                const t = String(d);
                if (!/ExperimentalWarning|trace-warnings|note: no current virtue/.test(t)) log(`[w${i}] ${t.trim()}`);
              });
              c.once('message', (m: { ready?: boolean }) => (m?.ready ? res(c) : rej(new Error(JSON.stringify(m)))));
              c.once('exit', code => rej(new Error(`worker ${i} exited ${code} during start-up`)));
            })
        )
      );
      for (const c of kids) c.removeAllListeners('exit');
      let probed = false;
      // E2E_BATCH_FACTOR: report a bigger pool than there are children, so the store's own chunk
      // rule (2 x size) hands each child several chains that share prefixes instead of two. Only
      // throughput changes -- every chain is priced the same way -- and the saved payload's worker
      // count is corrected back to the real number below.
      const factor = Math.max(1, Number(process.env.E2E_BATCH_FACTOR || 1));
      return {
        size: workers * factor,
        spawned: workers,
        suspendedSeconds: 0,
        async evaluate(chains: number[][], onDone?: (d: number, t: number) => void) {
          if (!chains.length) return { results: [], legSims: 0, workersUsed: 0 };
          const groups = splitByPrefix(chains, workersForBatch(chains.length, workers));
          const buckets: number[][][] = Array.from({ length: workers }, () => []);
          groups.forEach((g, i) => buckets[i % workers].push(...g));
          let done = 0;
          const replies = await Promise.all(
            buckets.map(
              (bucket, i) =>
                new Promise<{ results: Result[]; legSims: number }>((res, rej) => {
                  if (!bucket.length) return res({ results: [], legSims: 0 });
                  const c = kids[i];
                  const on = (m: { error?: string; results: Result[]; legSims: number }) => {
                    c.off('message', on);
                    if (m?.error) return rej(new Error(`worker ${i}: ${m.error}`));
                    done += bucket.length;
                    onDone?.(done, chains.length);
                    res(m);
                  };
                  c.on('message', on);
                  c.send({ chains: bucket });
                })
            )
          );
          const results = replies.flatMap(r => r.results);
          if (!probed && results.length) {
            probed = true;
            const theirs = results[0];
            const mine = local.evaluate(theirs.chain);
            const ok = !!mine && Math.abs(mine.seconds - theirs.seconds) <= 1;
            log(
              `parity probe ${ok ? 'ok' : 'FAILED'}: ${theirs.chain.join(' ')} workers ${(theirs.seconds / 86400).toFixed(4)} d, in-process ${mine ? (mine.seconds / 86400).toFixed(4) : 'null'} d`
            );
            if (!ok) throw new Error('parity probe failed: the CLI workers and the store disagree');
          }
          return {
            results,
            legSims: replies.reduce((n, r) => n + r.legSims, 0),
            workersUsed: buckets.filter(b => b.length).length,
          };
        },
        async integrityWait() {
          return integrityWaitSeconds(clean as never);
        },
        terminate() {
          for (const c of kids) c.kill();
        },
      };
    },
  };
});

it(
  'submits a real M1 sweep end to end',
  async () => {
    const COLLECTOR = 'https://ascension-chain-collector.williamthe5thc.workers.dev';
    vi.stubEnv('VITE_SUBMIT_URL', `${COLLECTOR}/submit`);
    setActivePinia(createPinia());

    // Capture the id the collector hands back, passing every request through untouched.
    const DRY = !!process.env.E2E_DRY;
    const store_: Record<string, Uint8Array> = {};
    const realFetch: typeof fetch = DRY
      ? ((async (url: string, init?: RequestInit) => {
          const u = String(url);
          if (u.endsWith('/submit'))
            return new Response(JSON.stringify({ ok: true, id: 'dry00001', uploadToken: 't' }), { status: 200 });
          if (u.includes('/csv?') && init?.method === 'POST') {
            store_.csv = new Uint8Array(init.body as ArrayBuffer);
            return new Response('{"ok":true}', { status: 200 });
          }
          if (u.includes('/csv?')) return new Response(store_.csv ?? new Uint8Array(), { status: 200 });
          if (u.includes('/leaderboard'))
            return new Response(JSON.stringify({ rows: [{ id: 'dry00001', hasCsv: true, chain: [], legs: [] }] }), {
              status: 200,
            });
          return new Response('', { status: 404 });
        }) as typeof fetch)
      : globalThis.fetch;
    let submittedId = '';
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const res = await realFetch(url, init);
      if (String(url).endsWith('/submit') && res.ok) {
        const body = await res.clone().json();
        submittedId = body.id;
      }
      log(`HTTP ${init?.method ?? 'GET'} ${String(url).replace(/\?.*/, '')} -> ${res.status}`);
      return res;
    });

    // Newer planners (2026-09-29, the black box) listen for 'pagehide'; the test's partial window has
    // no event methods, so give it inert ones before the store loads.
    const w = (globalThis as unknown as { window?: Record<string, unknown> }).window;
    if (w && typeof w.addEventListener !== 'function') {
      w.addEventListener = () => {};
      w.removeEventListener = () => {};
    }
    const { initPlanFuture } = await import('@/lib/modes/planFuture');
    const { useChainSearchStore } = await import('@/stores/chainSearch');
    const { useAutoPlannerStore } = await import('@/stores/autoPlanner');
    const { useInitialStateStore } = await import('@/stores/initialState');
    const { presetBandsFor } = await import('@/explorer/needs');
    const { parseBands } = await import('@/search/exhaustive');
    const { formatUnixToDateInput, formatUnixToTimeInput } = await import('@/lib/format');

    await initPlanFuture('local');
    const store = useChainSearchStore();
    const ap = useAutoPlannerStore();
    const tz = 'America/Denver';
    ap.timezone = tz;
    const backupTime = (useInitialStateStore().rawBackup as { approxTime?: number }).approxTime!;
    ap.startDate = formatUnixToDateInput(backupTime, tz);
    ap.startTime = formatUnixToTimeInput(backupTime, tz);
    // E2E_FINAL plans to a nearer target than 490 (horizon runs, 2026-09-28). E2E_AVAIL_FROM/_TO are
    // the player's hours every day in the plan's timezone (9 and 1 = 09:00 to 01:00); shifts are
    // held for them too, the panel's default. Both unset = the runs before 2026-09-28.
    if (process.env.E2E_FINAL) store.finalTE = Number(process.env.E2E_FINAL);
    const availFrom = process.env.E2E_AVAIL_FROM,
      availTo = process.env.E2E_AVAIL_TO;
    if (availFrom && availTo) {
      store.scheduleEnabled = true;
      store.availableFrom = Number(availFrom);
      store.availableTo = Number(availTo);
    }

    // E2E_PRESET picks the sweep (M1-M4, the Explorer link's own bands for this TE). E2E_OUTDIR set
    // means SAVE ONLY: the payload and table the Submit button would send, written to disk and not
    // posted. E2E_SUBMIT_DIR posts a saved pair instead of running anything.
    const preset = process.env.E2E_PRESET || 'M1';
    const minGapFor: Record<string, number> = { M1: 0, M2: 10, M3: 10, M4: 10 };
    const outDir = process.env.E2E_OUTDIR;
    const submitDir = process.env.E2E_SUBMIT_DIR;
    if (submitDir) {
      const saved = JSON.parse(readFileSync(submitDir + '/payload.json', 'utf8'));
      const table = readFileSync(submitDir + '/table.csv', 'utf8');
      const sent = await store.sendSubmission(saved, table);
      log('submit from ' + submitDir + ': ok ' + sent.ok + ', "' + sent.message + '", id ' + submittedId);
      return;
    }
    // E2E_BANDS / E2E_MINGAP run a sweep the PC's copy of the planner has no preset for (F4/F5, 2026-09-25).
    const bands = process.env.E2E_BANDS || (DRY ? '300-301:1' : presetBandsFor(preset, store.currentTE));
    const gapFor = (p: string) => (process.env.E2E_MINGAP ? Number(process.env.E2E_MINGAP) : (minGapFor[p] ?? 10));
    store.sweepTag = { preset, bands, minGap: gapFor(preset) };
    log(
      `TE ${store.currentTE}, plan start ${ap.startDate} ${ap.startTime} ${tz}, ${preset} bands ${bands}, continue pin ${process.env.E2E_PIN_DAYS ?? 'default'} d, final ${store.finalTE}, hours ${store.scheduleEnabled ? store.availableFrom + '-' + store.availableTo : 'any'}`
    );

    (globalThis as unknown as { __E2E_CLI: unknown }).__E2E_CLI = {
      script: process.env.E2E_CLI || 'dist-search/fastsearch.js',
      args: [
        '--backup',
        BACKUP,
        '--final',
        String(store.finalTE),
        '--start-date',
        ap.startDate,
        '--start-time',
        ap.startTime,
        '--timezone',
        tz,
        ...(store.forceContinue ? ['--force-continue'] : []),
        ...(process.env.E2E_PIN_DAYS ? ['--continue-pin-days', process.env.E2E_PIN_DAYS] : []),
        ...(store.scheduleEnabled
          ? ['--available-from', String(store.availableFrom), '--available-to', String(store.availableTo)]
          : []),
      ],
    };
    const t0 = Date.now();
    // A progress line every 10 minutes, so a long run shows how far along it is and when it should end.
    const ticker = setInterval(() => {
      const done = store.chainsDone,
        total = store.chainsEstimated || 1;
      const mins = (Date.now() - t0) / 60000;
      const eta = done ? (mins / done) * (total - done) : 0;
      log(
        `progress ${new Date().toISOString().slice(11, 16)}Z: ${done}/${total} chains, ${mins.toFixed(0)} min in, about ${(eta / 60).toFixed(1)} h to go`
      );
    }, 10 * 60_000);
    await store.startExhaustive('local', {
      lo: 0,
      hi: 0,
      step: 1,
      minAsc: 2,
      maxAsc: 2,
      minGap: gapFor(preset),
      bands: parseBands(bands),
    });
    clearInterval(ticker);
    log(
      `run: ${store.stage}, error ${store.error ?? 'none'}, ${store.csvRows} chains, ${((Date.now() - t0) / 60000).toFixed(1)} min`
    );
    log(`integrity check: ${store.integrityWait === null ? 'n/a' : Math.round(store.integrityWait / 60) + ' min'}`);
    log(
      `best ${store.bestChain.join(' ')} = ${store.bestDays.toFixed(3)} d, legs ${store.bestLegs.length}, issues ${store.resultIssues.length}`
    );

    const payload = store.buildRunSubmission(undefined);
    if (!payload) throw new Error('nothing to submit');
    log(
      `payload: flags ${JSON.stringify(payload.flags ?? [])}, schema ${payload.schema}, sweep ${JSON.stringify(payload.sweep)}, legs ${payload.legs.length}, chainsPriced ${payload.chainsPriced}, clothedTE ${payload.clothedTE}, fc ${payload.forceContinue}`
    );
    const csv = store.exportCsv();
    if (payload.run && process.env.E2E_WORKERS) payload.run.workers = Number(process.env.E2E_WORKERS);
    if (outDir) {
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      log(`run cost as the submission states it: ${JSON.stringify(payload.run ?? null)}`);
      writeFileSync(outDir + '/payload.json', JSON.stringify(payload, null, 1));
      writeFileSync(outDir + '/table.csv', csv);
      log('saved to ' + outDir + ' (not submitted)');
      log('done');
      return;
    }
    const res = await store.sendSubmission(payload, csv);
    log(`submit: ok ${res.ok}, "${res.message}", id ${submittedId}`);

    // Read it back as the Explorer would.
    const board = await (await realFetch(`${COLLECTOR}/leaderboard?limit=1000`)).json();
    const row = board.rows.find((r: { id: string }) => r.id === submittedId);
    log(
      `board row: ${row ? 'found' : 'MISSING'}; hasCsv ${row?.hasCsv}; chain ${row?.chain?.join(' ')}; legs ${row?.legs?.length}; sweep ${JSON.stringify(row?.sweep)}`
    );
    const gz = Buffer.from(await (await realFetch(`${COLLECTOR}/csv?id=${submittedId}`)).arrayBuffer());
    const text = gunzipSync(gz).toString('utf8');
    const dataRows = text.split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('rank,'));
    const chainsInCsv = new Set(dataRows.map(l => l.split(',')[1])).size;
    log(
      `csv back: ${gz.length} bytes gz, ${dataRows.length} leg rows, ${chainsInCsv} chains; matches chainsPriced: ${chainsInCsv === payload.chainsPriced}`
    );
    log(`csv mentions a player id: ${/EI\d{16}/.test(text)}`);
    log('done');
  },
  30 * 3600_000
);
