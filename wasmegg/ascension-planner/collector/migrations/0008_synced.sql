-- "Synced records" (sync.js): the starting-TE override, the Build-up tracker's ticks and its kept plan, per account (the
-- same 64-hex key as /follow), so every browser and device agrees. Last write wins by the client's `at`; one row per
-- record, no history.
--   kind     override (slot '0'), ticks or plan (slot = the ascension's start, unix seconds)
--   at       the client's clock, ms since 1970 (2020 to 2100)
--   updated  the collector's clock when stored
--   bytes    the stored size (plan: gzip bytes; the others: text bytes)
--   enc      'json' (data is the JSON text) or 'gz' (data is base64 of the gzip bytes)
-- WITHOUT ROWID: the primary key is the table's own index.
CREATE TABLE IF NOT EXISTS synced (
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  slot TEXT NOT NULL,
  at INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  enc TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (key, kind, slot)
) WITHOUT ROWID;
