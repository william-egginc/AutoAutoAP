/**
 * The line shown while a search is stopping (18 Oct 2026): Stop keeps the best route so far, but the routes the
 * workers were already handed finish first. About 15 s mid-run, up to a minute or more early on or on a phone, so
 * "Stopping…" alone looked stuck. Exhaustive says the same at length (InsanePanel.vue, "Stop is checked between
 * chunks"). One wording for every place a stopping button shows.
 */
export const STOPPING_NOTE = 'Stopping: finishing the routes already started (up to about a minute).';
