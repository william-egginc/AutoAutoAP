/**
 * Salted account codes (red team P2; design: ~/code/aaap-tools/notes/p2-salt-plan-2026-11-08.md).
 *
 * The client's account code `k` is SHA-256("aaap-follow-v1:" + player ID): unsalted, about 10^16 possible IDs, so anyone who sees
 * a stored `k` (a D1 export or backup, a log) can work the ID out offline. With the Worker secret ACCOUNT_KEY_SALT set, the
 * collector stores every account's rows under
 *     's1:' + HMAC-SHA-256(ACCOUNT_KEY_SALT, 'acct-key-v1:' + k)
 * instead (follows, prefs, answers, synced, and their budget rows). The client changes nothing: it still sends `k`. A stored key
 * cannot be sent back as a code (it has the prefix and is not 64 hex), so a leaked database is no longer a list of working codes
 * either. What it does NOT hide: `k` itself in a request's URL while it is in flight (a log would see it): that needs the client
 * to derive `k` with a slow hash (the R9 client step in the plan).
 *
 *   accountKey(env, k)   the key to use in SQL for this request. Without the secret: `k` itself (today's behaviour), unless salted
 *                        rows already exist, when it throws (fail closed: writing raw codes beside salted rows would fork an
 *                        account's data). With the secret: the salted key, after moving this account's rows from the raw code
 *                        (first touch), unless ACCOUNT_KEY_LEGACY is '0' (the sweep is done).
 *   rekeyLegacy(env)     the hourly cron: moves up to 50 raw-keyed accounts a run to their salted keys, so every old row is
 *                        covered without waiting for its player to return.
 *
 * Raw codes are 64 lowercase hex characters, which all sort before 's1:' ('0'-'9' and 'a'-'f' come before 's'), so a legacy row is
 * simply `key < 's1:'`. The secret cannot be rotated by a sweep (the raw code is gone once moved); a new secret only re-keys the
 * accounts whose player comes back, and the old rows are then lost to lookups: keep the secret (a backup copy is in the plan).
 */
export const SALTED_PREFIX = 's1:';
const TABLES = ['follows', 'prefs', 'answers', 'synced', 'cal_feeds'];

export class AccountKeyError extends Error {}

export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const saltedKeyOf = async (secret, k) => SALTED_PREFIX + (await hmacHex(secret, `acct-key-v1:${k}`));

/** Salted rows exist in D1 (cached 30 s per binding): the secret must not go missing then. */
const seen = new WeakMap();
async function saltedRowsExist(env) {
  const c = seen.get(env.WATCH);
  const now = Date.now();
  if (c && now - c.at < 30_000) return c.exists;
  let exists = false;
  for (const t of TABLES) {
    // A table this binding does not have yet (a migration not applied) holds no salted rows.
    const r = await env.WATCH.prepare(`SELECT 1 AS x FROM ${t} WHERE key >= 's1:' AND key < 's1;' LIMIT 1`).first().catch(() => null);
    if (r) {
      exists = true;
      break;
    }
  }
  seen.set(env.WATCH, { at: now, exists });
  return exists;
}

/**
 * Moves every row of the raw code `k` to the salted key `sk`; a record already under `sk` wins over the raw one.
 * One atomic batch for all the tables (UPDATE then DELETE of the leftovers, per table): if the UPDATE fails nothing is deleted. Only
 * "no such table" (a migration this database has not had yet) is swallowed; any other error is thrown, the raw
 * rows stay where they were and the next touch (or the next sweep) tries again.
 */
async function moveRows(env, k, sk) {
  const step = t => [
    env.WATCH.prepare(`UPDATE OR IGNORE ${t} SET key = ? WHERE key = ?`).bind(sk, k),
    env.WATCH.prepare(`DELETE FROM ${t} WHERE key = ?`).bind(k),
  ];
  // Every table in ONE batch: between two table moves the hourly cron's pruneCal would find a callink record (moved) with no link
  // row (not yet moved) and delete it (21 Nov 2026). A database that lacks a table (a migration not applied) falls back to one batch a table.
  try {
    await env.WATCH.batch(TABLES.flatMap(step));
    return;
  } catch (e) {
    if (!/no such table/i.test(String(e?.message ?? e))) throw e;
  }
  for (const t of TABLES) {
    try {
      await env.WATCH.batch(step(t));
    } catch (e) {
      if (!/no such table/i.test(String(e?.message ?? e))) throw e;
    }
  }
}

export async function accountKey(env, k) {
  const secret = env.ACCOUNT_KEY_SALT;
  if (!secret) {
    if (env.WATCH && (await saltedRowsExist(env))) throw new AccountKeyError('the account key secret is missing');
    return k;
  }
  const sk = await saltedKeyOf(secret, k);
  if (env.WATCH && env.ACCOUNT_KEY_LEGACY !== '0') {
    let has = false;
    for (const t of TABLES) {
      if (await env.WATCH.prepare(`SELECT 1 AS x FROM ${t} WHERE key = ? LIMIT 1`).bind(k).first().catch(() => null)) {
        has = true;
        break;
      }
    }
    if (has) await moveRows(env, k, sk);
  }
  return sk;
}

/** The cron: up to `limit` raw-keyed accounts moved to their salted keys. Returns how many. */
export async function rekeyLegacy(env, now, limit = 50) {
  if (!env.WATCH || !env.ACCOUNT_KEY_SALT) return 0;
  const legacy = new Set();
  for (const t of TABLES) {
    if (legacy.size >= limit) break;
    const { results } = await env.WATCH.prepare(`SELECT DISTINCT key FROM ${t} WHERE key < 's1:' LIMIT ?`).bind(limit).all().catch(() => ({ results: [] }));
    for (const r of results || []) if (legacy.size < limit) legacy.add(r.key);
  }
  let moved = 0;
  for (const key of legacy) {
    if (!/^[0-9a-f]{64}$/.test(key)) continue;
    try {
      await moveRows(env, key, await saltedKeyOf(env.ACCOUNT_KEY_SALT, key));
      moved++;
    } catch {
      // This account's move failed and left its rows as they were; the other accounts still move, this one is tried next run.
    }
  }
  return moved;
}

/** A 503 for a request whose account key cannot be made (the secret went missing after salting began). */
export const accountKeyDown = reply => reply({ error: 'account keys are not available on this collector right now' }, 503);
