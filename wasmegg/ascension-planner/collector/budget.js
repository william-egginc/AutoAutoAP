/**
 * Byte and write budgets kept in D1 (red team 6 Nov 2026, C1 and C2/C6).
 *
 * KV's 1,000 writes a day and D1's size are shared by the whole collector, and a key is free to invent, so a
 * per-key limit alone does not stop one sender. These budgets are one upsert on `follow_rate` (migration 0002,
 * the table follow, prefs and answers already use for their hourly counts): `n` is what has been spent since
 * `since`, and the WHERE refuses the write, so a refused spend changes no row. No migration.
 */

export const DAY_MS = 86_400_000;
export const FOREVER_MS = 1e15;

/** Bytes one run's /csvd deltas may add up to (a long run's CSV in KV is a few MB; 8 MB is one request's cap). */
export const CSVD_RUN_BYTES = 32 * 1024 * 1024;
/** Gzip bytes of CSV (/csv heads, whole files, parts, and /csvd deltas) written to KV a day: real use is under 10 MB (measured 6 Nov: mean 0.15 MB a CSV, largest 1.7 MB). KV's free storage is 1 GB. */
export const CSV_DAY_BYTES = 32 * 1024 * 1024;
/** Accepted /submit sends a day for the whole collector (each is about 3 or 4 KV writes of the 1,000 a day). */
export const SUBMITS_PER_DAY = 100;
/** Seconds a /csvd delta lives in KV if nothing sweeps it first: the sweep deletes only 20 a day. A run's deltas are stitched into its CSV long before. */
export const CSVD_TTL_SECONDS = 7 * 86_400;
/** /csvd writes a day for the whole collector. KV's free plan allows 1,000 writes a day; worst case all paths together stay near 660 (see notes/quotas-2026-11-06.md). */
export const CSVD_DAY_WRITES = 200;
/** follow + prefs + answers PUTs a day for the whole collector (each is about 4 D1 rows written of the 100,000 a day; real use is a few hundred). */
export const CLOUD_PUTS_PER_DAY = 5000;
/** Brand-new follow or prefs keys a day: the new-key path counts the table (D1 reads are 5 million a day). */
export const CLOUD_NEW_KEYS_PER_DAY = 150;

/**
 * Spend `amount` of `cap` for `key` in a window of `windowMs` starting at the first spend. `{ ok: true }` or
 * `{ ok: false, since }`. Without D1, or if D1 errors, it lets the request through: the callers' other caps stay.
 */
export async function spend(env, key, amount, cap, now, windowMs) {
  if (!env.WATCH) return { ok: true, skipped: true };
  if (!(amount <= cap)) return { ok: false, since: now };
  const start = now - windowMs;
  try {
    const r = await env.WATCH.prepare(
      `INSERT INTO follow_rate (key, since, n) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         n = CASE WHEN follow_rate.since <= ? THEN excluded.n ELSE follow_rate.n + excluded.n END,
         since = CASE WHEN follow_rate.since <= ? THEN excluded.since ELSE follow_rate.since END
       WHERE follow_rate.since <= ? OR follow_rate.n + excluded.n <= ?`
    )
      .bind(key, now, amount, start, start, start, cap)
      .run();
    if (r.meta && r.meta.changes) return { ok: true };
    const row = await env.WATCH.prepare('SELECT since FROM follow_rate WHERE key = ?').bind(key).first();
    return { ok: false, since: row?.since ?? now };
  } catch {
    return { ok: true, skipped: true };
  }
}

/** Seconds until the window of a refused spend ends (at least 1). */
export const waitSeconds = (since, windowMs, now) => Math.max(1, Math.ceil((since + windowMs - now) / 1000));

/** The cron: budget rows from more than 3 days ago are spent windows. Hourly keys, daily keys and run keys alike. */
export async function pruneBudgets(env, now) {
  if (!env.WATCH) return;
  await env.WATCH.prepare('DELETE FROM follow_rate WHERE since < ?').bind(now - 3 * DAY_MS).run();
}

/** Spend `bytes` of the day's CSV budget. `null` if there is room, else the 429 `{ error, retryAfter }` to send. */
export async function csvDayRefusal(env, bytes, now, reply) {
  const cap = Number(env.CSV_DAY_BYTES) || CSV_DAY_BYTES;
  const r = await spend(env, 'csv-bytes-day', bytes, cap, now, DAY_MS);
  if (r.ok) return null;
  const retryAfter = waitSeconds(r.since, DAY_MS, now);
  return reply({ error: 'the collector has taken all the CSV bytes it can today', retryAfter }, 429, { 'retry-after': String(retryAfter) });
}

/** Spend one of a day-wide count. 0 if there is room, else the seconds to wait. */
export async function dayWait(env, key, cap, now) {
  const r = await spend(env, key, 1, cap, now, DAY_MS);
  return r.ok ? 0 : waitSeconds(r.since, DAY_MS, now);
}
