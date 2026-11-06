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
/** /csvd writes a day for the whole collector: KV allows 1,000 writes a day and the board needs most of them. */
export const CSVD_DAY_WRITES = 300;

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
