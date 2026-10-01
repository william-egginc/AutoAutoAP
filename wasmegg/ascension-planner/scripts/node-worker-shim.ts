/**
 * Makes a Node worker thread look like a Web Worker's global scope, for
 * src/workers/chainSearch.worker.ts. Imported FIRST by node-worker.ts: the worker module reads
 * `self` at its top level, so `self.postMessage` has to exist before it is evaluated.
 */
import './node-shims';
import { parentPort } from 'node:worker_threads';

const g = globalThis as any;
g.self = g;
g.postMessage = (message: unknown) => parentPort!.postMessage(message);
// The worker module sets `self.onmessage`; deliver each message the way a browser does, as an event.
parentPort!.on('message', (data: unknown) => g.onmessage?.({ data }));

export {};
