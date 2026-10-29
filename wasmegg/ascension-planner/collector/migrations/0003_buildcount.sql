-- "Which build is in use" (buildcount.js). One row per UTC day and page build (the hashed entry script name,
-- e.g. index-BGv8tSVu) with how many browsers said they had it open that day. Nothing else: no address, no time
-- beyond the day. Rows older than 30 days are deleted by the cron; at most 200 builds a day are counted.
-- WITHOUT ROWID: the primary key is the table's own index.
CREATE TABLE IF NOT EXISTS build_counts (
  day TEXT NOT NULL,
  build TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, build)
) WITHOUT ROWID;
