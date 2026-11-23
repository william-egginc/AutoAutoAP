/**
 * Optional PIN for everything saved online for one account (design: ~/code/aaap-tools/notes/pin-cloud-design-2026-11-17.md).
 * OFF by default and per account. Once an account has a PIN, every cloud request for it (follow, prefs, answers, sync, forget,
 * calendar new and revoke-all) needs the header `x-aaap-session`, which a browser gets from POST /pin/verify with the browser's
 * slow hash of the PIN (`pk`, 64 hex; the server never sees the PIN). Without a good session: 401 { error: 'pin required', pin: true }.
 *
 *   GET  /pin/status?k=                  { pin, resetAt? }
 *   POST /pin/set      { k, pk }         first PIN. 200 { ok, session, expires, recovery, revokedLinks }. recovery is shown ONCE.
 *   POST /pin/verify   { k, pk }         200 { session, expires } or 401 / 429 (throttled).
 *   POST /pin/refresh  { k }             (session) a fresh session.
 *   POST /pin/change   { k, pk }         (session) a new PIN; every older session dies.
 *   POST /pin/remove   { k }             (session) PIN off.
 *   POST /pin/recover  { k, recovery, pk }   the recovery code sets a new PIN and gives a new recovery code.
 *   POST /pin/reset    { k }             start the 7-day wait-and-delete reset (no login: that is the point of a reset).
 *   POST /pin/reset/cancel { k }         (session) cancel it; no new reset for 7 days.
 *
 * Needs ACCOUNT_KEY_SALT (a PIN row under a raw key would mean nothing) and PIN_ENABLED="1". With the flag off and a PIN row present
 * the account answers 503, never open (a rollback must not unlock accounts). Guessing: 5 tries free, then one an hour, 10 a day an
 * account, a right PIN resets the count; 30 tries an hour an address. Nothing here reads a player ID; a pk, a recovery code and a
 * session are never put in a URL or logged.
 */
import { hmacHex, AccountKeyError, accountKey, accountKeyDown } from './acct.js';
import { DAY_MS, spend, waitSeconds } from './budget.js';
import { PLAYER_ID, isKey, overLimit, reply, retry } from './follow.js';

export const PIN_FREE_TRIES = 5;
export const PIN_TRIES_PER_DAY = 10;
/** Wrong recovery codes one account may see a day, from anywhere: a backstop only, far above what an honest owner types. */
export const PIN_RECOVERY_WRONG_PER_ACCOUNT_DAY = 1000;
export const PIN_TRY_GAP_MS = 3_600_000;
export const PIN_SESSION_MS = 30 * DAY_MS;
export const PIN_RESET_MS = 7 * DAY_MS;
export const PIN_TRIES_PER_ADDRESS_HOUR = 30;
export const PIN_RESETS_PER_ADDRESS_DAY = 3;
export const PIN_RESETS_PER_DAY = 50;
export const PIN_SETS_PER_ADDRESS_DAY = 20;
const MAX_BODY = 512;
const HOUR_MS = 3_600_000;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SESSION_RE = /^v1\.(\d{10,16})\.(\d{1,9})\.([0-9a-f]{64})$/;
const TABLES = ['follows', 'prefs', 'answers', 'synced', 'cal_feeds', 'pin'];

export const isPinRequest = url => url.pathname.startsWith('/pin/') && /^\/pin\/(status|set|verify|refresh|change|remove|recover|reset|reset\/cancel)$/.test(url.pathname);
export const pinOn = env => env.PIN_ENABLED === '1';

const bad = problems => reply({ error: 'rejected', problems }, 400);
const pinRequired = () => reply({ error: 'pin required', pin: true }, 401);
const unavailable = () => reply({ error: 'the PIN is not available on this collector right now' }, 503);

const sameText = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const recoveryCode = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => B32[b % 32]).join('');
const proofOf = (env, sk, pk) => hmacHex(env.ACCOUNT_KEY_SALT, `pin-proof-v1:${sk}:${pk}`);
const recProofOf = (env, sk, code) => hmacHex(env.ACCOUNT_KEY_SALT, `pin-rec-v1:${sk}:${code}`);

// The MAC covers the row's `created` as well as the epoch: a PIN that is removed, reset or forgotten and then set again restarts
// at epoch 1, and without `created` an old epoch-1 session would be valid for the new PIN (review 22 Nov 2026, C1.1).
async function sessionFor(env, sk, epoch, now, created) {
  const exp = now + PIN_SESSION_MS;
  const mac = await hmacHex(env.ACCOUNT_KEY_SALT, `pin-session-v1:${sk}:${created}:${exp}:${epoch}`);
  return { session: `v1.${exp}.${epoch}.${mac}`, expires: exp };
}

/** True when the request carries a session that is valid for this key and this PIN epoch. */
async function sessionOk(env, request, sk, row, now) {
  const m = SESSION_RE.exec(request.headers.get('x-aaap-session') || '');
  if (!m) return false;
  if (Number(m[1]) <= now || Number(m[2]) !== row.epoch) return false;
  return sameText(m[3], await hmacHex(env.ACCOUNT_KEY_SALT, `pin-session-v1:${sk}:${row.created}:${m[1]}:${m[2]}`));
}

const rowOf = (env, sk) => env.WATCH.prepare('SELECT * FROM pin WHERE key = ?').bind(sk).first();

/** Removes everything saved online under the key, the PIN row last (the reset's end, and /forget's reach for a PIN account). */
export async function deleteAccount(env, sk) {
  await env.WATCH.batch(TABLES.map(t => env.WATCH.prepare(`DELETE FROM ${t} WHERE key = ?`).bind(sk)));
}

/**
 * The guard every cloud handler calls right after it has the account key. null = go on; otherwise the answer to send.
 * No `pin` table yet (migration not applied) and no flag: no PIN exists, go on. Any other D1 error: 503, never "assume no PIN".
 */
export async function pinGuard(env, request, sk, now = Date.now()) {
  if (!env.WATCH) return null;
  let row;
  try {
    row = await rowOf(env, sk);
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return pinOn(env) ? unavailable() : null;
    return unavailable();
  }
  if (!row) return null;
  if (!pinOn(env)) return unavailable();
  if (row.reset_at && row.reset_at <= now) {
    await deleteAccount(env, sk);
    return null;
  }
  return (await sessionOk(env, request, sk, row, now)) ? null : pinRequired();
}

/** The hourly cron: due resets are carried out even if nobody asks again. */
export async function pinResetsDue(env, now, limit = 50) {
  // The PIN off means the owner cannot cancel a reset either: nothing is carried out until it is on again (review 22 Nov, C1.4).
  if (!env.WATCH || !pinOn(env)) return 0;
  let n = 0;
  try {
    const { results } = await env.WATCH.prepare('SELECT key FROM pin WHERE reset_at > 0 AND reset_at <= ? LIMIT ?').bind(now, limit).all();
    for (const r of results || []) {
      await deleteAccount(env, r.key);
      n++;
    }
  } catch {
    // No pin table yet, or a failure: the next run tries again.
  }
  return n;
}

async function readBody(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_BODY) return { res: reply({ error: 'too big' }, 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return { res: reply({ error: 'too big' }, 413) };
  if (PLAYER_ID.test(text)) return { res: bad(['send the key, never the player id']) };
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { res: bad(['the body must be a JSON object']) };
    return { body: v };
  } catch {
    return { res: reply({ error: 'body must be JSON' }, 400) };
  }
}

const only = (body, fields) => Object.keys(body).every(f => fields.includes(f));
const ipHash = async (env, request) => (await hmacHex(env.ACCOUNT_KEY_SALT || 'none', `pin-ip-v1:${request.headers.get('cf-connecting-ip') || 'unknown'}`)).slice(0, 24);

export async function handlePin(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'the PIN is not set up on this collector' }, 503);
  if (!pinOn(env)) return reply({ error: 'not found' }, 404);
  const url = new URL(request.url);
  const route = url.pathname.slice('/pin/'.length);
  if (!env.ACCOUNT_KEY_SALT) return unavailable();

  let rawK;
  let body = {};
  if (route === 'status') {
    if (request.method !== 'GET') return reply({ error: 'method not allowed' }, 405);
    if (PLAYER_ID.test(url.search)) return bad(['send the key, never the player id']);
    rawK = url.searchParams.get('k');
  } else {
    if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
    if (url.search) return bad(['send the key in the body, never in the address']);
    const r = await readBody(request);
    if (r.res) return r.res;
    body = r.body;
    rawK = body.k;
  }
  if (!isKey(rawK)) return bad(['k must be 64 lowercase hex characters']);
  const slow = await overLimit(env, request, 'pin');
  if (slow) return slow;
  let sk;
  try {
    sk = await accountKey(env, rawK);
  } catch (e) {
    if (e instanceof AccountKeyError) return accountKeyDown(reply);
    throw e;
  }
  let row;
  try {
    row = await rowOf(env, sk);
  } catch {
    return unavailable();
  }
  if (row && row.reset_at && row.reset_at <= now) {
    await deleteAccount(env, sk);
    row = null;
  }

  if (route === 'status') return reply({ pin: !!row, ...(row && row.reset_at ? { resetAt: row.reset_at } : {}) });

  if (route === 'set') {
    if (!only(body, ['k', 'pk']) || !isKey(body.pk)) return bad(['send { k, pk }, pk 64 lowercase hex characters']);
    if (row) return reply({ error: 'a PIN is already set: change it with a session' }, 409);
    const day = await spend(env, `pinset|${await ipHash(env, request)}`, 1, PIN_SETS_PER_ADDRESS_DAY, now, DAY_MS);
    if (!day.ok) return retry(waitSeconds(day.since, DAY_MS, now), 'too many PINs set from this address today');
    const code = recoveryCode();
    const revoked = await env.WATCH.prepare('SELECT COUNT(*) AS n FROM cal_feeds WHERE key = ?').bind(sk).first();
    await env.WATCH.batch([
      env.WATCH.prepare('INSERT INTO pin (key, proof, rec_proof, epoch, created) VALUES (?, ?, ?, 1, ?)').bind(sk, await proofOf(env, sk, body.pk), await recProofOf(env, sk, code), now),
      env.WATCH.prepare('DELETE FROM cal_feeds WHERE key = ?').bind(sk),
      // The saved (encrypted) copy of those links goes with them (sync.js kind `callink`).
      env.WATCH.prepare("DELETE FROM synced WHERE key = ? AND kind = 'callink'").bind(sk),
    ]);
    return reply({ ok: true, ...(await sessionFor(env, sk, 1, now, now)), recovery: code, revokedLinks: revoked?.n ?? 0 });
  }

  if (!row) return reply({ error: 'no PIN is set', pin: false }, 404);

  if (route === 'verify') {
    if (!only(body, ['k', 'pk']) || !isKey(body.pk)) return bad(['send { k, pk }, pk 64 lowercase hex characters']);
    const addr = await spend(env, `pinip|${await ipHash(env, request)}`, 1, PIN_TRIES_PER_ADDRESS_HOUR, now, HOUR_MS);
    if (!addr.ok) return retry(waitSeconds(addr.since, HOUR_MS, now), 'too many tries from this address');
    // Reserve the try BEFORE comparing, in one statement, so parallel guesses cannot all slip under the cap.
    const r = await env.WATCH.prepare(
      `UPDATE pin SET
         fail_n = CASE WHEN fail_n = 0 OR fail_first <= ? THEN 1 ELSE fail_n + 1 END,
         fail_first = CASE WHEN fail_n = 0 OR fail_first <= ? THEN ? ELSE fail_first END,
         fail_last = ?
       WHERE key = ? AND (fail_n = 0 OR fail_first <= ? OR fail_n < ? OR (fail_n < ? AND fail_last <= ?))`
    )
      .bind(now - DAY_MS, now - DAY_MS, now, now, sk, now - DAY_MS, PIN_FREE_TRIES, PIN_TRIES_PER_DAY, now - PIN_TRY_GAP_MS)
      .run();
    if (!r.meta || !r.meta.changes) {
      const wait = row.fail_n >= PIN_TRIES_PER_DAY ? row.fail_first + DAY_MS - now : row.fail_last + PIN_TRY_GAP_MS - now;
      return retry(Math.max(1, Math.ceil(wait / 1000)), 'too many wrong PINs: wait before trying again');
    }
    if (!sameText(await proofOf(env, sk, body.pk), row.proof)) return reply({ error: 'wrong PIN', pin: true }, 401);
    await env.WATCH.prepare('UPDATE pin SET fail_n = 0, fail_first = 0, fail_last = 0 WHERE key = ?').bind(sk).run();
    return reply(await sessionFor(env, sk, row.epoch, now, row.created));
  }

  if (route === 'recover') {
    if (!only(body, ['k', 'recovery', 'pk']) || !isKey(body.pk) || !/^[A-Z2-7]{16}$/.test(body.recovery || '')) return bad(['send { k, recovery, pk }']);
    // The code is compared FIRST: a correct one always works, whatever anyone has guessed (80 bits make a guess hopeless), so a
    // griefer who knows the ID cannot lock the owner out. Only a WRONG code spends, counted per ADDRESS (10 a day), with a high
    // per-account backstop that a correct code never meets (code review round 2, C1.6; Jordan 22 Nov).
    if (!sameText(await recProofOf(env, sk, body.recovery), row.rec_proof)) {
      const ip = await spend(env, `pinrec|${await ipHash(env, request)}`, 1, PIN_TRIES_PER_DAY, now, DAY_MS);
      if (!ip.ok) return retry(waitSeconds(ip.since, DAY_MS, now), 'too many recovery tries today from this address');
      const acct = await spend(env, `pinrec|${sk}`, 1, PIN_RECOVERY_WRONG_PER_ACCOUNT_DAY, now, DAY_MS);
      if (!acct.ok) return retry(waitSeconds(acct.since, DAY_MS, now), 'too many wrong recovery codes today');
      return reply({ error: 'wrong recovery code', pin: true }, 401);
    }
    const code = recoveryCode();
    // One statement: the epoch moves up from whatever it is NOW (a change at the same moment cannot be overwritten with a stale
    // epoch+1), and only while the recovery code is still the one that was just proved (review 22 Nov, C1.3).
    const done = await env.WATCH.prepare(
      'UPDATE pin SET proof = ?, rec_proof = ?, epoch = epoch + 1, fail_n = 0, fail_first = 0, fail_last = 0, reset_at = 0 WHERE key = ? AND rec_proof = ? RETURNING epoch'
    )
      .bind(await proofOf(env, sk, body.pk), await recProofOf(env, sk, code), sk, row.rec_proof)
      .first();
    if (!done) return reply({ error: 'wrong recovery code', pin: true }, 401); // 401, not 409: the client reads a 409 here as a reset cooldown
    return reply({ ok: true, ...(await sessionFor(env, sk, done.epoch, now, row.created)), recovery: code });
  }

  if (route === 'reset') {
    if (!only(body, ['k'])) return bad(['send only k']);
    if (row.reset_at) return reply({ ok: true, resetAt: row.reset_at });
    if (row.reset_cooldown > now) return retry(Math.ceil((row.reset_cooldown - now) / 1000), 'a reset was cancelled recently: wait before asking again', 409);
    // The address's own cap first: a refused address must not spend the whole collector's resets for the day (review 22 Nov, C1.2).
    const a = await spend(env, `pinreset|${await ipHash(env, request)}`, 1, PIN_RESETS_PER_ADDRESS_DAY, now, DAY_MS);
    if (!a.ok) return retry(waitSeconds(a.since, DAY_MS, now), 'too many resets asked today');
    const all = await spend(env, 'pinreset-day', 1, PIN_RESETS_PER_DAY, now, DAY_MS);
    if (!all.ok) return retry(waitSeconds(all.since, DAY_MS, now), 'too many resets asked today');
    const resetAt = now + PIN_RESET_MS;
    await env.WATCH.prepare('UPDATE pin SET reset_at = ? WHERE key = ? AND reset_at = 0').bind(resetAt, sk).run();
    return reply({ ok: true, resetAt });
  }

  // From here on a good session is required.
  if (!(await sessionOk(env, request, sk, row, now))) return pinRequired();

  if (route === 'refresh') return reply(await sessionFor(env, sk, row.epoch, now, row.created));

  if (route === 'change') {
    if (!only(body, ['k', 'pk']) || !isKey(body.pk)) return bad(['send { k, pk }, pk 64 lowercase hex characters']);
    const epoch = row.epoch + 1;
    // Only from the epoch this session was read at: a recover or change that got there first wins, and this one is told to look again.
    const r = await env.WATCH.prepare('UPDATE pin SET proof = ?, epoch = ?, fail_n = 0, fail_first = 0, fail_last = 0, reset_at = 0 WHERE key = ? AND epoch = ?')
      .bind(await proofOf(env, sk, body.pk), epoch, sk, row.epoch)
      .run();
    if (!r.meta || !r.meta.changes) return pinRequired(); // the session's epoch is gone: 401 reads as "sign in again" (a 409 would read as a reset cooldown)
    return reply({ ok: true, ...(await sessionFor(env, sk, epoch, now, row.created)) });
  }

  if (route === 'remove') {
    if (!only(body, ['k'])) return bad(['send only k']);
    const r = await env.WATCH.prepare('DELETE FROM pin WHERE key = ? AND epoch = ?').bind(sk, row.epoch).run();
    if (!r.meta || !r.meta.changes) return pinRequired(); // the session's epoch is gone: 401 reads as "sign in again" (a 409 would read as a reset cooldown)
    return reply({ ok: true });
  }

  if (route === 'reset/cancel') {
    if (!only(body, ['k'])) return bad(['send only k']);
    await env.WATCH.prepare('UPDATE pin SET reset_at = 0, reset_cooldown = ? WHERE key = ?').bind(now + PIN_RESET_MS, sk).run();
    return reply({ ok: true });
  }
  return reply({ error: 'not found' }, 404);
}
