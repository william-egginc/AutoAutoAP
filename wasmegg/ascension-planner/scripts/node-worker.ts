/**
 * The command line's search worker: the browser's own worker module (src/workers/chainSearch.worker.ts),
 * run in a Node worker thread. Bundled beside fastsearch.js as chain-worker.js; scripts/siteRun.ts
 * hands it to the store's pool (search/pool.ts `setDefaultWorkerSpawn`), so a command-line run goes
 * through the same pool, protocol and evaluator as a run in the browser.
 */
import './node-worker-shim';
import '../src/workers/chainSearch.worker';
