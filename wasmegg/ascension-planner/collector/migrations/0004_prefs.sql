-- "Prefs in the cloud" (prefs.js): each account's consent choices and Setup, kept so that entering the player
-- ID on any device loads them. Same key as the followed routes: SHA-256("aaap-follow-v1:" + ID), computed in
-- the browser, so the collector never sees the ID. Only adds a table; nothing existing changes.
--   kind      'consent' or 'setup'
--   version   1, 2, ...; the last 5 versions of a kind are kept
--   value     JSON, at most 4,096 bytes (prefs.js `readConsent` / `readSetup`)
--   updated   when it was stored, ms since 1970 (the collector's clock)
-- The hourly write budget per key reuses `follow_rate` (migration 0002) under the key 'prefs|<key>'.
CREATE TABLE IF NOT EXISTS prefs (
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  value TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (key, kind, version)
) WITHOUT ROWID;
