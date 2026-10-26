-- Big CSV uploads to R2 (bigcsv.js). The R2 binding cannot list the parts of a multipart upload, so the
-- Worker keeps them here, which is also what makes an upload resumable. Only adds two tables.
--   bigcsv       one row per board row that started a big upload (id = the row's id, no player ID anywhere)
--     state        'open' (parts being sent), 'done' (kept), 'deleted' (removed by the maintainer)
--     owner        the first 12 hex of the row's owner hash, for the per-account cap; null when the row has none
--     bytes        the declared total size; part_size / parts as chosen at start
--   bigcsv_parts one row per part received (n from 1), with R2's etag and the bytes taken
CREATE TABLE IF NOT EXISTS bigcsv (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  part_size INTEGER NOT NULL,
  parts INTEGER NOT NULL,
  state TEXT NOT NULL,
  owner TEXT,
  created INTEGER NOT NULL,
  done INTEGER
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS bigcsv_parts (
  id TEXT NOT NULL,
  n INTEGER NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (id, n)
) WITHOUT ROWID;
