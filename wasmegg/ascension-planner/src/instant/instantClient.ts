/**
 * One instant-answer worker for the page's life (the card's side of instant.worker.ts). Made on the
 * first request and kept across visits to My runs, so the table (a few MB) is fetched and read once;
 * the table's header and the last answers are kept here too, so coming back to the tab shows the
 * answer at once. The worker goes only when the page does (pagehide); the next request makes a new one.
 */
import type { TableHeader } from './precomputedTable';
import type { FoundRoutes } from './routeFinder';
import type { AnswerRequest } from './instantAnswer';
import type { InstantWorkerRequest, InstantWorkerResponse } from './instant.worker';

type Waiter = { resolve: (m: InstantWorkerResponse) => void; onProgress?: (done: number, of: number) => void };

let worker: Worker | null = null;
let lastId = 0;
/** The header's own ids (negative): asking for it must not make the card's run look superseded. */
let headerId = 0;
const waiting = new Map<number, Waiter>();

function theWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./instant.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<InstantWorkerResponse>) => {
    const r = e.data;
    const waiter = waiting.get(r.id);
    if (!waiter) return;
    if (r.kind === 'progress') return waiter.onProgress?.(r.done, r.of);
    waiting.delete(r.id);
    waiter.resolve(r);
  };
  w.onerror = e => {
    // A worker that failed to start: every waiting request gets the error; the next one retries.
    for (const [id, waiter] of waiting) waiter.resolve({ kind: 'error', id, message: e.message || 'worker failed' });
    waiting.clear();
    endWorker();
  };
  worker = w;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', endWorker, { once: true });
  return w;
}

/** The page is going: stop the worker (a page restored from the back/forward cache makes a new one). */
export function endWorker(): void {
  worker?.terminate();
  worker = null;
}

/** A new request id; the newest one asked is the one the card shows. */
export function newRequestId(): number {
  return ++lastId;
}
export function isNewest(id: number): boolean {
  return id === lastId;
}

function ask(m: InstantWorkerRequest, onProgress?: (done: number, of: number) => void): Promise<InstantWorkerResponse> {
  return new Promise(resolve => {
    waiting.set(m.id, { resolve, ...(onProgress ? { onProgress } : {}) });
    theWorker().postMessage(m);
  });
}

const headers = new Map<string, Promise<TableHeader | null>>();

function askHeader(url: string, probe: boolean): Promise<TableHeader | null> {
  const known = headers.get(url);
  if (known) return known;
  const got = ask({ kind: 'header', id: --headerId, url, ...(probe ? { probe } : {}) }).then(r =>
    r.kind === 'header' ? r.header : null
  );
  headers.set(url, got);
  // A failure is asked again next time (the table may be put up later); a probe's miss is kept
  // per save by tableChoice.ts instead.
  void got.then(h => {
    if (!h && headers.get(url) === got) headers.delete(url);
  });
  return got;
}

/** The table's header, asked once per page (null: missing, unreadable or another simulator's). */
export function tableHeader(url: string): Promise<TableHeader | null> {
  return askHeader(url, false);
}

/** An account or gear table's header (tableChoice.ts), or null when it is not there: one request on
 *  a miss (tableFetch.ts probe), no error shown or logged. */
export function probeHeader(url: string): Promise<TableHeader | null> {
  return askHeader(url, true);
}

/** How long a kept answer is shown again for the same request (its start moves with the clock). */
export const ANSWER_KEPT_SECONDS = 15 * 60;
const kept = new Map<string, { start: number; found: FoundRoutes }>();

/** A kept answer for `key` (the save and the goal, InstantAnswer.vue) when worked out under
 *  ANSWER_KEPT_SECONDS before `start`. */
export function keptAnswer(key: string, start: number): FoundRoutes | null {
  const k = kept.get(key);
  return k && start >= k.start && start - k.start < ANSWER_KEPT_SECONDS ? k.found : null;
}

/** Keep an answer (the newest eight). */
export function keepAnswer(key: string, start: number, found: FoundRoutes): void {
  kept.delete(key);
  if (kept.size >= 8) kept.delete(kept.keys().next().value as string);
  kept.set(key, { start, found });
}

/** The request last sent to the worker, while it runs: asking the same again joins it. */
let inFlight: { key: string; id: number; reply: Promise<InstantWorkerResponse> } | null = null;

/**
 * The answer for `req` (`key` names the tables too: InstantAnswer.vue `answerKey`), worked out on the worker, or kept from a moment ago for the same `key`, or
 * the run already going for the same `key` when nothing newer was sent since (Egg Day -> Fastest
 * (kept) -> Egg Day costs one run). Resolves to the worker's reply; 'dropped' when a newer request
 * superseded it.
 */
export async function answer(
  id: number,
  url: string,
  req: AnswerRequest,
  key: string,
  onProgress?: (done: number, of: number) => void,
  /** An account or gear table joined to the maxed one at `url` (instant.worker.ts). */
  own?: string
): Promise<InstantWorkerResponse> {
  const k = keptAnswer(key, req.start);
  if (k) return { kind: 'answer', id, found: k };
  if (inFlight?.key === key) {
    const joined = inFlight;
    const w = waiting.get(joined.id);
    if (w && onProgress) w.onProgress = onProgress;
    return joined.reply;
  }
  const reply = ask({ kind: 'answer', id, url, ...(own ? { own } : {}), req }, onProgress);
  const mine = { key, id, reply };
  inFlight = mine;
  const r = await reply;
  if (inFlight === mine) inFlight = null;
  if (r.kind === 'answer') keepAnswer(key, req.start, r.found);
  return r;
}
