-- "Follow in the cloud" (follow.js). The route a player is following, per goal, kept so that entering the
-- player ID on any device loads it. The key is SHA-256("aaap-follow-v1:" + ID), computed in the browser: the
-- collector never sees the ID. Anyone who knows the ID can compute the key (accepted by design).
--   follows   one row per (key, goal, version); the last 5 versions of a goal are kept
--     value     JSON of the followed route (follow.js `readValue`), at most 4,096 bytes
--     updated   when it was stored, ms since 1970 (the collector's clock)
--   follow_rate   one row per key: the start of its current hour and the writes made in it (30 an hour)
-- WITHOUT ROWID: the primary key is the table's own index.
CREATE TABLE IF NOT EXISTS follows (
  key TEXT NOT NULL,
  goal TEXT NOT NULL,
  version INTEGER NOT NULL,
  value TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (key, goal, version)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS follow_rate (
  key TEXT PRIMARY KEY,
  since INTEGER NOT NULL,
  n INTEGER NOT NULL
) WITHOUT ROWID;
