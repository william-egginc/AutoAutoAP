-- "Instant answers in the cloud" (answers.js): the page's computed instant answer and pricing record per account,
-- kept so another device shows it at once and then rechecks. Keyed by the follow key (SHA-256 of the ID, computed in
-- the browser) and an opaque entry key the app builds. Only adds a table.
--   data     the gzip bytes as base64 text (D1 hands BLOBs back as number arrays; text is the safe way), at most
--            65,536 bytes of gzip = about 87,400 characters
--   at       the client's clock when it was computed, ms
--   updated  the collector's clock when it was stored, ms
--   bytes    the gzip size, for the list
-- The hourly write budget per key reuses `follow_rate` (migration 0002) under 'answers|<key>'.
CREATE TABLE IF NOT EXISTS answers (
  key TEXT NOT NULL,
  e TEXT NOT NULL,
  at INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (key, e)
) WITHOUT ROWID;
