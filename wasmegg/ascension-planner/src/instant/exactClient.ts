/**
 * The page's side of the exact check (exact.worker.ts): one check at a time for the whole page, its
 * state per route (exactCheck.ts CheckState) kept in memory for the page's life, so reopening a row
 * (or the same route on the Saved runs) shows the result without checking again. Cancel ends the
 * worker. The instant answer's own worker (instantClient.ts) is separate and keeps answering.
 */
import { reactive, ref } from 'vue';
import { nextCheckState, type CheckState, type ExactInputs, type ExactResult } from './exactCheck';
import type { ExactWorkerRequest, ExactWorkerResponse } from './exact.worker';

const states = reactive(new Map<string, CheckState>());
/** The route being checked (its key), or null. */
export const runningKey = ref<string | null>(null);
/** Milliseconds now, ticking every second while a check runs (for the elapsed time). */
export const nowMs = ref(Date.now());

let worker: Worker | null = null;
let lastId = 0;
let tick: ReturnType<typeof setInterval> | undefined;

const IDLE: CheckState = { kind: 'idle' };

/** The check's state for `key` (idle when never run). */
export function checkState(key: string): CheckState {
  return states.get(key) ?? IDLE;
}

/** The exact result for `key`, if a check finished. */
export function checkResult(key: string): ExactResult | null {
  const s = states.get(key);
  return s?.kind === 'done' ? s.result : null;
}

/** Keep a result found elsewhere (a saved entry's exact times) under `key`. */
export function rememberResult(key: string, result: ExactResult): void {
  if (states.get(key)?.kind !== 'running') states.set(key, { kind: 'done', result, ms: 0 });
}

function set(key: string, e: Parameters<typeof nextCheckState>[1]): void {
  states.set(key, nextCheckState(checkState(key), e));
}

function finish(): void {
  worker?.terminate();
  worker = null;
  runningKey.value = null;
  clearInterval(tick);
  tick = undefined;
}

/**
 * Start the check for `key` (inputs read now by `inputs`). Refused (false) while another check runs.
 * Resolves when it ends: the result, or null (error or cancelled).
 */
export function startCheck(key: string, inputs: () => ExactInputs): Promise<ExactResult | null> | false {
  if (runningKey.value !== null) return false;
  let inp: ExactInputs;
  try {
    inp = inputs();
  } catch (err) {
    states.set(key, { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    return Promise.resolve(null);
  }
  const id = ++lastId;
  runningKey.value = key;
  nowMs.value = Date.now();
  set(key, { kind: 'start', atMs: nowMs.value });
  tick = setInterval(() => (nowMs.value = Date.now()), 1000);
  return new Promise(resolve => {
    const w = new Worker(new URL('./exact.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = (e: MessageEvent<ExactWorkerResponse>) => {
      const r = e.data;
      if (r.id !== id || worker !== w) return;
      if (r.kind === 'progress') return set(key, { kind: 'progress', progress: r.progress });
      finish();
      if (r.kind === 'done') {
        set(key, { kind: 'done', result: r.result, atMs: Date.now() });
        resolve(r.result);
      } else {
        set(key, { kind: 'error', message: r.message });
        resolve(null);
      }
    };
    w.onerror = e => {
      if (worker !== w) return;
      finish();
      set(key, { kind: 'error', message: e.message || 'the simulator stopped' });
      resolve(null);
    };
    cancels.set(key, () => resolve(null));
    w.postMessage({ kind: 'check', id, inputs: inp } satisfies ExactWorkerRequest);
  });
}

const cancels = new Map<string, () => void>();

/** Cancel the running check for `key` (nothing when it is not the one running). */
export function cancelCheck(key: string): void {
  if (runningKey.value !== key) return;
  finish();
  set(key, { kind: 'cancel' });
  cancels.get(key)?.();
  cancels.delete(key);
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => worker?.terminate());

/** Specs only: put a check in a given state (server renders of the running, done and error states). */
export function setCheckStateForSpecs(key: string, state: CheckState | null): void {
  if (state) states.set(key, state);
  else states.delete(key);
  runningKey.value = state?.kind === 'running' ? key : runningKey.value === key ? null : runningKey.value;
}
