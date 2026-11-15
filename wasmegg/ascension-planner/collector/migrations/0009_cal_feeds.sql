-- Calendar feeds (cal.js): a secret link per device that a calendar app (Google, Apple, Outlook) subscribes to. The link's
-- token is random and stored only as its SHA-256; `key` is the account key (the SALTED key once ACCOUNT_KEY_SALT is set, so
-- acct.js moves these rows with the others and a leaked database shows no player ID and no usable link).
--   token_hash  SHA-256 hex of the 22-character token
--   created     the collector's clock when the link was made (ms)
--   last_fetch  the collector's clock at the last fetch, written at most once an hour (0 = never fetched)
--   fetches     fetches counted when last_fetch is written (an estimate)
-- A link nobody fetched for 90 days is deleted by the hourly cron (the player makes a new one).
CREATE TABLE IF NOT EXISTS cal_feeds (
  token_hash TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_fetch INTEGER NOT NULL DEFAULT 0,
  fetches INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cal_feeds_key ON cal_feeds (key);
