/**
 * The instant answer's worker: it fetches the table once (a few MB) and keeps it for its life, and
 * works out an answer per request (instantAnswer.ts `workOutAnswer`), off the page's thread.
 */
import { fetchTable } from './tableFetch';
import { workOutAnswer, type AnswerRequest } from './instantAnswer';
import type { Table, TableHeader } from './precomputedTable';
import type { FoundRoutes } from './routeFinder';

export type InstantWorkerRequest =
  | { kind: 'header'; id: number; url: string }
  | { kind: 'answer'; id: number; url: string; req: AnswerRequest };

export type InstantWorkerResponse =
  | { kind: 'header'; id: number; header: TableHeader }
  | { kind: 'progress'; id: number; done: number; of: number }
  | { kind: 'answer'; id: number; found: FoundRoutes }
  | { kind: 'error'; id: number; message: string };

const ctx = self as unknown as Worker;
let table: Promise<Table> | null = null;
let tableUrl = '';

function load(url: string): Promise<Table> {
  if (!table || tableUrl !== url) {
    tableUrl = url;
    table = fetchTable(url);
    // A failed load is retried on the next request rather than remembered.
    table.catch(() => (table = null));
  }
  return table;
}

function reply(m: InstantWorkerResponse): void {
  ctx.postMessage(m);
}

ctx.onmessage = async (event: MessageEvent<InstantWorkerRequest>) => {
  const m = event.data;
  try {
    const t = await load(m.url);
    if (m.kind === 'header') return reply({ kind: 'header', id: m.id, header: t.header });
    const found = await workOutAnswer(t, m.req, (done, of) => reply({ kind: 'progress', id: m.id, done, of }));
    reply({ kind: 'answer', id: m.id, found });
  } catch (err) {
    reply({ kind: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
