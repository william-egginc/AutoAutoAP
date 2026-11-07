-- "Long-run alert" (runs.js): one row per long search a page announces, so the maintainer can see one is running before a
-- deploy or a forced reload. No player ID, no owner code, no address: a random run code, what kind, how long it expects to
-- take, which build, when it started and, if it said so, how it ended.
--   run      the page's random 22-character code for this run
--   kind     fast, exact, custom, bydate or other
--   est      the estimated duration in hours
--   build    the page's build stamp
--   started  ms since 1970, the page's clock (within 10 minutes of the collector's)
--   recv     ms since 1970, the collector's clock when the start arrived
--   ended    ms since 1970 the stop arrived; NULL while it has not
--   reason   done, cancelled, closed or failed
-- Rows are deleted 3 days after the run ended, or after it should have ended (the cron).
-- WITHOUT ROWID: the key is the table's own index.
CREATE TABLE IF NOT EXISTS runs (
  run TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  est REAL NOT NULL,
  build TEXT NOT NULL,
  started INTEGER NOT NULL,
  recv INTEGER NOT NULL,
  ended INTEGER,
  reason TEXT
) WITHOUT ROWID;
