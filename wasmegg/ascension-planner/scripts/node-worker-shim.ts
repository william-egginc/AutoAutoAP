/**
 * Makes a Node worker thread look like a Web Worker's global scope, for
 * src/workers/chainSearch.worker.ts. Imported FIRST by node-worker.ts: the worker module reads
 * `self` at its top level, so `self.postMessage` has to exist before it is evaluated.
 */
import './node-shims';
import { parentPort } from 'node:worker_threads';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a browser global scope, assembled by hand
const g = globalThis as any;
g.self = g;
g.postMessage = (message: unknown) => parentPort!.postMessage(message);
// The worker module sets `self.onmessage`; deliver each message the way a browser does, as an event.
// AAP_TEST_WORKER_EXIT_AFTER=N: the worker ends itself, with code 0, at its Nth message, to try what the
// run does when a worker goes away with requests in hand (scripts/siteRun.ts `nodeWorker`).
const exitAfter = Math.floor(Number(process.env.AAP_TEST_WORKER_EXIT_AFTER)) || 0;
let seen = 0;
parentPort!.on('message', (data: unknown) => {
  if (exitAfter && ++seen >= exitAfter) process.exit(0);
  g.onmessage?.({ data });
});

export {};
