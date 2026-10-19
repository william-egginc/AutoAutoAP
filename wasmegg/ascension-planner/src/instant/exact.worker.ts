/**
 * The exact check's worker (exactCheck.ts `runExactCheck`): Joo's simulator on one route, off the
 * page's thread, a minute or more. One check per worker; the page ends it (terminate) to cancel, and
 * makes a new one for the next check, so a cancelled run leaves nothing behind.
 */
import { runExactCheck, type ExactInputs, type ExactProgress, type ExactResult } from './exactCheck';

export type ExactWorkerRequest = { kind: 'check'; id: number; inputs: ExactInputs };
export type ExactWorkerResponse =
  | { kind: 'progress'; id: number; progress: ExactProgress }
  | { kind: 'done'; id: number; result: ExactResult }
  | { kind: 'error'; id: number; message: string };

const ctx = self as unknown as Worker;

ctx.onmessage = async (event: MessageEvent<ExactWorkerRequest>) => {
  const m = event.data;
  if (m.kind !== 'check') return;
  try {
    const result = await runExactCheck(m.inputs, progress => ctx.postMessage({ kind: 'progress', id: m.id, progress }));
    ctx.postMessage({ kind: 'done', id: m.id, result } satisfies ExactWorkerResponse);
  } catch (err) {
    ctx.postMessage({ kind: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) } satisfies ExactWorkerResponse);
  }
};
