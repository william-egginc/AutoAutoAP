/**
 * "Long-run alert" (design: ~/code/aaap-tools/notes/long-run-alert-design-2026-11-07.md). A page that starts a long search
 * (estimated over 2 hours) tells the collector, anonymously, and tells it again when the search ends, so the maintainer can see
 * that one is running before a deploy or a forced reload. The simple version: start and stop only, no heartbeat ("if it dies
 * it dies": a run whose tab is lost simply stays listed until its expected end plus a margin).
 *
 *   POST /runs   { t: 'start', run, kind, estHours, build, startedAt }   or   { t: 'stop', run, reason }
 *                text body of at most 512 bytes (so `navigator.sendBeacon` works: it sends text/plain, no preflight).
 *   GET /runs/active   owner only (header `x-admin-token` = the Worker secret RUNS_ADMIN_TOKEN; 404 without the secret):
 *                the runs with no stop whose expected end plus the margin (1 hour) has not passed, and a count of the rest.
 *   scheduled()  pruneRuns: rows are deleted 3 days after the stop, or 3 days after an unstopped run should have ended.
 *
 * NO PLAYER ID, NO OWNER CODE, NO ADDRESS. A row holds a random run code, the kind, the estimate, the page's build stamp, the
 * page's start time and the collector's, and how it ended. The address is only counted, under a keyed hash (HMAC with
 * CSV_UPLOAD_KEY, never a plain hash), in `follow_rate`, and dropped with the other budget rows after 3 days. A body holding
 * `EI` + 16 digits (any case) is refused.
 *
 * D1, NOT KV: a start and a stop are 2 rows written; none of it touches SUBMISSIONS.
 *
 * ABUSE CAPS (anyone can call it): body 512 bytes; every field whitelisted; 6 new runs a day an address and
 * RUNS_NEW_PER_DAY (200) for the whole collector; at most RUNS_MAX_OPEN (100) listed unfinished runs; the FOLLOW_LIMIT edge
 * binding per address; at most RUNS_PUSH_PER_DAY (20) ntfy notes a day. A flood can only keep fake runs listed; it cannot
 * fill D1 or spam the maintainer's phone.
 *
 * THE NOTE. With the Worker secret RUNS_NTFY_TOPIC set, a start and a stop each post one fixed-text note to ntfy.sh (the
 * topic name is the secret, as with the phone watch). It names no run code, no build and no address.
 */
import { DAY_MS, spend, waitSeconds } from './budget.js';
import { PLAYER_ID, overLimit } from './follow.js';

export const RUNS_MAX_BYTES = 512;
export const RUNS_MARGIN_MS = 3_600_000;
export const RUNS_KEEP_MS = 3 * DAY_MS;
const HOUR_MS = 3_600_000;
const NTFY = 'https://ntfy.sh';
const KINDS = ['fast', 'exact', 'custom', 'bydate', 'other'];
const KIND_LABEL = { fast: 'Fast', exact: 'Exact', custom: 'Custom', bydate: 'By a date', other: 'Other' };
const REASONS = ['done', 'cancelled', 'closed', 'failed'];
const REASON_TEXT = { done: 'finished', cancelled: 'cancelled', closed: 'the tab was closed', failed: 'failed' };
const RUN_RE = /^[A-Za-z0-9_-]{22}$/;
const BUILD_RE = /^[A-Za-z0-9:._-]{1,40}$/;
const CLOCK_SLACK_MS = 600_000;

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
const reply = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const retry = (seconds, error) => reply({ error, retryAfter: seconds }, 429, { 'retry-after': String(seconds) });
const bad = problems => reply({ error: 'rejected', problems }, 400);

export const isRunsRequest = url => url.pathname === '/runs' || url.pathname === '/runs/active';

const marginOf = env => (Number(env.RUNS_MARGIN_MIN) > 0 ? Number(env.RUNS_MARGIN_MIN) * 60_000 : RUNS_MARGIN_MS);
const capOf = (v, d) => (Number(v) > 0 ? Number(v) : d);

/** Equal strings, in time that does not depend on where they differ. */
function sameText(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

async function keyedHash(env, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.CSV_UPLOAD_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...sig.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
/** 12-hour Mountain time, e.g. "4:04 pm MST". */
const timeText = ms => clock.format(new Date(ms)).replace(' AM', ' am').replace(' PM', ' pm');
/** "3 h 30 min", "45 min", "3 h". */
function spanText(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Listed runs: no stop, and the expected end plus the margin still ahead. */
const LISTED = 'ended IS NULL AND started + est * 3600000 + ? > ?';
const activeCount = async (env, now) => (await env.WATCH.prepare(`SELECT COUNT(*) AS n FROM runs WHERE ${LISTED}`).bind(marginOf(env), now).first())?.n ?? 0;

/** One note to ntfy, under its daily cap. Never throws: a failed note changes nothing. */
async function push(env, ctx, now, fetchImpl, title, message, tags) {
  if (!env.RUNS_NTFY_TOPIC) return;
  const day = await spend(env, 'runs-push-day', 1, capOf(env.RUNS_PUSH_PER_DAY, 20), now, DAY_MS);
  if (!day.ok) return;
  const send = fetchImpl(NTFY, { method: 'POST', body: JSON.stringify({ topic: env.RUNS_NTFY_TOPIC, title, message, tags }) }).catch(() => undefined);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(send);
  else await send;
}

/** `POST /runs`, `GET /runs/active`. */
export async function handleRuns(request, env, ctx, now = Date.now(), fetchImpl = (...a) => fetch(...a)) {
  if (!env.WATCH) return reply({ error: 'long-run alerts are not set up on this collector' }, 503);
  const url = new URL(request.url);

  if (url.pathname === '/runs/active') {
    if (request.method !== 'GET') return reply({ error: 'method not allowed' }, 405);
    if (!env.RUNS_ADMIN_TOKEN) return reply({ error: 'not found' }, 404);
    if (!sameText(request.headers.get('x-admin-token'), env.RUNS_ADMIN_TOKEN)) return reply({ error: 'missing or wrong token' }, 403);
    const margin = marginOf(env);
    const { results } = await env.WATCH.prepare('SELECT run, kind, est, build, started FROM runs WHERE ended IS NULL ORDER BY started LIMIT 300').all();
    const active = [];
    let overdue = 0;
    for (const r of results || []) {
      const expectedEnd = Math.round(r.started + r.est * HOUR_MS);
      if (expectedEnd + margin > now) {
        active.push({ run: r.run.slice(0, 6), kind: r.kind, estHours: r.est, build: r.build, startedAt: r.started, expectedEnd, listedUntil: expectedEnd + margin });
      } else overdue++;
    }
    return reply({ now, margin, active, overdue });
  }

  if (request.method !== 'POST' || url.pathname !== '/runs') return reply({ error: 'method not allowed' }, 405);
  const slow = await overLimit(env, request, 'runs');
  if (slow) return slow;
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > RUNS_MAX_BYTES) return reply({ error: 'too big' }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > RUNS_MAX_BYTES) return reply({ error: 'too big' }, 413);
  if (PLAYER_ID.test(text)) return bad(['no player id, ever']);
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return reply({ error: 'body must be JSON' }, 400);
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return reply({ error: 'body must be JSON' }, 400);

  if (b.t === 'stop') {
    const problems = [];
    if (!RUN_RE.test(b.run ?? '')) problems.push('run must be 22 base64url characters');
    if (!REASONS.includes(b.reason)) problems.push(`reason must be one of ${REASONS.join(', ')}`);
    if (problems.length) return bad(problems);
    const upd = await env.WATCH.prepare('UPDATE runs SET ended = ?, reason = ? WHERE run = ? AND ended IS NULL').bind(now, b.reason, b.run).run();
    if (upd.meta && upd.meta.changes) {
      const row = await env.WATCH.prepare('SELECT kind, started FROM runs WHERE run = ?').bind(b.run).first();
      const left = await activeCount(env, now);
      await push(env, ctx, now, fetchImpl, 'Long run ended', `${KIND_LABEL[row?.kind] ?? 'A'} search ended: ${REASON_TEXT[b.reason]}. It ran ${spanText(now - (row?.started ?? now))}. Active now: ${left}.`, ['checkered_flag']);
      return reply({ ok: true });
    }
    const have = await env.WATCH.prepare('SELECT 1 AS x FROM runs WHERE run = ?').bind(b.run).first();
    return have ? reply({ ok: true }) : reply({ error: 'no such run' }, 404);
  }

  if (b.t !== 'start') return bad(['t must be start or stop']);
  const problems = [];
  if (!RUN_RE.test(b.run ?? '')) problems.push('run must be 22 base64url characters');
  if (!KINDS.includes(b.kind)) problems.push(`kind must be one of ${KINDS.join(', ')}`);
  if (!(typeof b.estHours === 'number' && Number.isFinite(b.estHours) && b.estHours >= 0.25 && b.estHours <= 2000)) problems.push('estHours must be a number from 0.25 to 2000');
  if (typeof b.build !== 'string' || !BUILD_RE.test(b.build)) problems.push('build must be the page build stamp (1 to 40 characters)');
  if (!Number.isInteger(b.startedAt) || Math.abs(b.startedAt - now) > CLOCK_SLACK_MS) problems.push('startedAt must be milliseconds within 10 minutes of the collector clock');
  if (problems.length) return bad(problems);

  // A retried start (a lost answer) is ordinary: nothing new, nothing counted, nothing pushed.
  const have = await env.WATCH.prepare('SELECT 1 AS x FROM runs WHERE run = ?').bind(b.run).first();
  if (have) return reply({ ok: true });

  const margin = marginOf(env);
  const open = await env.WATCH.prepare(`SELECT COUNT(*) AS n FROM runs WHERE ${LISTED}`).bind(margin, now).first();
  if ((open?.n ?? 0) >= capOf(env.RUNS_MAX_OPEN, 100)) return retry(3600, 'too many long runs are listed right now');
  if (env.CSV_UPLOAD_KEY) {
    const ip = await keyedHash(env, `runs-ip|${request.headers.get('cf-connecting-ip') || 'unknown'}`);
    const mine = await spend(env, `runs-ip|${ip}`, 1, 6, now, DAY_MS);
    if (!mine.ok) return retry(waitSeconds(mine.since, DAY_MS, now), 'at most 6 long runs a day from one address');
  }
  const all = await spend(env, 'runs-new-day', 1, capOf(env.RUNS_NEW_PER_DAY, 200), now, DAY_MS);
  if (!all.ok) return retry(waitSeconds(all.since, DAY_MS, now), 'the collector takes at most 200 long-run announcements a day');

  const ins = await env.WATCH.prepare('INSERT OR IGNORE INTO runs (run, kind, est, build, started, recv, ended, reason) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)')
    .bind(b.run, b.kind, Math.round(b.estHours * 100) / 100, b.build, b.startedAt, now)
    .run();
  if (!ins.meta || !ins.meta.changes) return reply({ ok: true });
  const count = await activeCount(env, now);
  const end = b.startedAt + b.estHours * HOUR_MS;
  await push(
    env,
    ctx,
    now,
    fetchImpl,
    'Long run started',
    `${KIND_LABEL[b.kind]} search started ${timeText(b.startedAt)}. Estimated ${spanText(b.estHours * HOUR_MS)}, expected end about ${timeText(end)}. Active now: ${count}.`,
    ['hourglass_flowing_sand']
  );
  return reply({ ok: true });
}

/** The cron: rows 3 days after the stop, or 3 days after an unstopped run should have ended, are deleted. */
export async function pruneRuns(env, now) {
  if (!env.WATCH) return;
  await env.WATCH.prepare('DELETE FROM runs WHERE (ended IS NOT NULL AND ended < ?) OR (ended IS NULL AND started + est * 3600000 + ? < ?)')
    .bind(now - RUNS_KEEP_MS, marginOf(env), now - RUNS_KEEP_MS)
    .run();
}
