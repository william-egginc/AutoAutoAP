/**
 * The line shown while a search is stopping (18 Oct 2026): Stop keeps the best route so far, but the routes the
 * workers were already handed finish first. About 15 s mid-run, up to a minute or more early on or on a phone, so
 * "Stopping…" alone looked stuck. Exhaustive says the same at length (InsanePanel.vue, "Stop is checked between
 * chunks"). One wording for every place a stopping button shows.
 */
/*
 * 23 Oct 2026: "up to about a minute" was wrong. Stop is honoured between batches (search/driver.ts `stopRequested`),
 * and each worker prices the whole share of the batch it was handed before it answers (workers/chainSearch.worker.ts
 * loops over its chains with no way to hear Stop), so the wait is the slowest worker's remaining routes, not one
 * route. Measured: 35 to 121 s on a computer, over 180 s on a phone on Fastest (3 workers, routes of 15 to 40 s
 * each). The Running pill and the instant card's pointer wait for the same end (the run is still running).
 */
export const STOPPING_NOTE =
  'Stopping: finishing the routes the workers already have. This can take a few minutes, longer on a phone or on Fastest, where each route is long. Your best so far is kept.';
