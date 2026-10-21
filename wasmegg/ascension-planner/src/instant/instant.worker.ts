/**
 * The instant answer's worker: it fetches each table once (a few MB) and keeps the last few for its
 * life (the maxed one, and an account or gear table when one fits the save, tableChoice.ts), and
 * works out an answer per request (instantAnswer.ts `workOutAnswer`), off the page's thread. The
 * newest answer request wins (latestOnly.ts): an older one still waiting is skipped and one running
 * stops at its next pause, each answered 'dropped'.
 */
import { fetchTable } from './tableFetch';
import { workOutAnswer, type AnswerRequest } from './instantAnswer';
import { latestOnly, pauseFor, Superseded } from './latestOnly';
import { compositeTable, shiftedTable, type Table, type TableHeader } from './precomputedTable';
import type { FoundRoutes } from './routeFinder';

export type InstantWorkerRequest =
  /** `probe`: a table that is usually not there (fetchTable's probe: one request on a miss). */
  | { kind: 'header'; id: number; url: string; probe?: boolean }
  /** `url`: the maxed table; `own`: an account, gear or delivery table joined to it per leg
   *  (compositeTable); `shift`: `own` read with that earnings shift (precomputedTable.ts shiftedTable;
   *  `own` may be the maxed table itself); `ownScale`: `own`'s cells scaled to the player's delivery
   *  rate (a delivery table, or the maxed one shifted: compositeTable; absent is 1). */
  | { kind: 'answer'; id: number; url: string; own?: string; shift?: number; ownScale?: number; req: AnswerRequest };

export type InstantWorkerResponse =
  | { kind: 'header'; id: number; header: TableHeader }
  | { kind: 'progress'; id: number; done: number; of: number }
  | { kind: 'answer'; id: number; found: FoundRoutes }
  | { kind: 'dropped'; id: number }
  | { kind: 'error'; id: number; message: string };

const ctx = self as unknown as Worker;
/** The tables fetched, the most recently used last: the maxed one, a probed one or two, a joined one. */
const tables = new Map<string, Promise<Table>>();
const KEEP_TABLES = 4;
const latest = latestOnly();

function keep(key: string, make: () => Promise<Table>): Promise<Table> {
  let t = tables.get(key);
  if (t) tables.delete(key);
  else {
    t = make();
    // A failed load is asked again on the next request rather than remembered.
    const failed = t;
    failed.catch(() => tables.get(key) === failed && tables.delete(key));
  }
  tables.set(key, t);
  if (tables.size > KEEP_TABLES) tables.delete(tables.keys().next().value as string);
  return t;
}

function load(url: string, probe = false): Promise<Table> {
  return keep(url, () => fetchTable(url, undefined, probe));
}

/** `own` (read with the earnings `shift`, its cells scaled by `ownScale`) joined to the maxed table at
 *  `url`, its cells scaled by `scale`. */
function joined(own: string, url: string, scale: number, shift = 0, ownScale = 1): Promise<Table> {
  return keep(JSON.stringify([own, url, scale, shift, ownScale]), async () =>
    compositeTable(shiftedTable(await load(own, own !== url), shift), await load(url), scale, ownScale)
  );
}

function reply(m: InstantWorkerResponse): void {
  ctx.postMessage(m);
}

ctx.onmessage = async (event: MessageEvent<InstantWorkerRequest>) => {
  const m = event.data;
  if (m.kind === 'answer') latest.note(m.id);
  try {
    if (m.kind === 'header') return reply({ kind: 'header', id: m.id, header: (await load(m.url, m.probe)).header });
    // With an own table the maxed cells (and a delivery table's, by ownScale) are scaled in the join,
    // and the search runs at a scale of 1.
    const t = m.own ? await joined(m.own, m.url, m.req.deliveryScale, m.shift, m.ownScale) : await load(m.url);
    const req = m.own ? { ...m.req, deliveryScale: 1 } : m.req;
    const pause = pauseFor(m.id, latest);
    await pause();
    const found = await workOutAnswer(t, req, (done, of) => reply({ kind: 'progress', id: m.id, done, of }), pause);
    reply({ kind: 'answer', id: m.id, found });
  } catch (err) {
    if (err instanceof Superseded) return reply({ kind: 'dropped', id: m.id });
    reply({ kind: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
