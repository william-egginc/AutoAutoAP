-- "Which table answered" ping (tablepick.js; Jordan 25 Nov 2026, R10.1): one anonymous DAILY COUNT per combination, no row per
-- request, no player ID, no owner code, no address, no time of day.
--   day        UTC date, 'YYYY-MM-DD'
--   kind       own, gear, delivery or maxed (maxed = the main table, the fallback)
--   answered   the delivery key whose table answered (kind delivery only), else ''
--   own        the player's own delivery key (metronome-compass-gusset), '' when unknown
--   no_table   1: no table is listed for their set; 0: one is; -1: not said
--   te         the largest of 0, 50, 75, 100, 125, 150, 200, 250, 300, 340, 400 at or below the player's TE
--   build      the page's build stamp
--   n          how many pings (the page sends at most one a day per browser per combination, so about browser-days)
-- Kept with no automatic deletion (Jordan's call, 25 Nov 2026: "just in case we need them"): anonymous daily counts only.
-- WITHOUT ROWID: the key is the table's own index.
CREATE TABLE IF NOT EXISTS table_picks (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  answered TEXT NOT NULL DEFAULT '',
  own TEXT NOT NULL DEFAULT '',
  no_table INTEGER NOT NULL DEFAULT -1,
  te INTEGER NOT NULL,
  build TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, answered, own, no_table, te, build)
) WITHOUT ROWID;
