-- "Watch this run from your phone" (watch.js). One row per watched run, keyed by its random watch id.
--   data     JSON { iv, ct, status }: the heartbeat sealed with AES-GCM under a secret the collector
--            never sees (it lives only in the watch link's #fragment), and the plain status
--   updated  when it was stored, ms since 1970 (the collector's clock)
--   notify   the player's ntfy topic, only when they opted in to notifications; never served back
--   alerted  1 once the "stopped reporting" note went out; a fresh heartbeat sets it back to 0
-- WITHOUT ROWID: the key is the table's own index, so an update is one row written.
CREATE TABLE IF NOT EXISTS watch (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL,
  notify TEXT,
  alerted INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
