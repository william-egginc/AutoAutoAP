-- Optional PIN for everything saved online for one account (pin.js, notes/pin-cloud-design-2026-11-17.md).
-- `key` is the SALTED account key (the PIN needs ACCOUNT_KEY_SALT, so no row is ever keyed by a raw code).
--   proof        HMAC(secret, 'pin-proof-v1:' + key + ':' + pk), pk being the browser's slow hash of the PIN. Never the PIN.
--   rec_proof    the same for the recovery code (shown once at setup)
--   epoch        bumped when the PIN changes or is recovered; a session token carries it, so every older session dies at once
--   fail_n, fail_first, fail_last   wrong-or-pending tries in the current 24 h window (5 free, then one an hour, 10 a day)
--   reset_at     0, or when the wait-and-delete reset is due (ms); reset_cooldown: no new reset before this (ms)
CREATE TABLE IF NOT EXISTS pin (
  key TEXT PRIMARY KEY,
  proof TEXT NOT NULL,
  rec_proof TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL,
  fail_n INTEGER NOT NULL DEFAULT 0,
  fail_first INTEGER NOT NULL DEFAULT 0,
  fail_last INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL DEFAULT 0,
  reset_cooldown INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
