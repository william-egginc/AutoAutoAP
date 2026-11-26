/**
 * "Which table answered" ping (Jordan 25 Nov 2026, R10.1; plan agreed with the UI specialist and the orchestrator). A page says,
 * anonymously, which instant answer table it used, so the owner can see who falls back to the main table.
 *
 *   POST /tablepick   text body of at most 256 bytes (so `navigator.sendBeacon` works), JSON:
 *       { kind: own|gear|delivery|maxed,
 *         answered?: the delivery key whose table answered (kind delivery only, required there),
 *         delivery?: the player's OWN delivery key (metronome-compass-gusset), every kind when known,
 *         noTable?: true when no table is listed for their set,
 *         te: the largest of 0, 50, 75, 100, 125, 150, 200, 250, 300, 340, 400 at or below the player's TE,
 *         build: the page's build stamp }
 *     A good ping, and one dropped by a cap, answer 204 (the page ignores the answer). A bad one is a 400 and writes nothing.
 *   GET /tablepick/report[?days=N|all][&bands=coarse|fine]   owner only (x-admin-token = TABLEPICK_ADMIN_TOKEN, else RUNS_ADMIN_TOKEN; 404 without
 *     either): counts only, summed over the window (never a day), cells under 3 hidden.
 *
 * NO PLAYER ID, NO OWNER CODE, NO ADDRESS, NO STAMP HASH. Storage is D1 (migration 0011): one counter per (day, kind, answered,
 * own, noTable, te, build), one upsert a ping. Never KV (1,000 writes a day on the Free plan). The address is only counted, under
 * a keyed hash (HMAC with CSV_UPLOAD_KEY), in `follow_rate`, and dropped with the other budget rows after 3 days.
 * No automatic deletion of the counts (Jordan's call): they are anonymous daily counts.
 *
 * COUNTS MEAN "ANSWERS SHOWN", about browser-days (the page sends one a day per browser per combination), never players.
 *
 * ABUSE CAPS: body 256 bytes; every field whitelisted; 20 pings a day an address, TABLEPICK_PER_DAY (2000) for the collector, and
 * the FOLLOW_LIMIT edge binding per address. A flood can only add counters, bounded by those caps; a bad ping does not count.
 */
import { DAY_MS, spend } from './budget.js';
import { PLAYER_ID, overLimit } from './follow.js';

export const TABLEPICK_MAX_BYTES = 256;
export const TE_EDGES = [0, 50, 75, 100, 125, 150, 200, 250, 300, 340, 400];
export const TABLEPICK_KINDS = ['own', 'gear', 'delivery', 'maxed'];
/** The same shape as the instant record's delivery keys (worker.js DELIVERY_KEY). */
const SET_KEY = /^[A-Za-z0-9_-]{1,24}$/;
const BUILD_RE = /^[A-Za-z0-9:._-]{1,40}$/;
/** The report rolls the edges up to the instant tables' own edges (75, 150, 340). */
const BANDS = [
  { label: '0-74', from: 0 },
  { label: '75-149', from: 75 },
  { label: '150-339', from: 150 },
  { label: '340+', from: 340 },
];
/** `?bands=fine`: one band per stored edge (0-49, 50-74, 75-99 ... 340-399, 400+). */
const FINE_BANDS = TE_EDGES.map((from, i) => ({
  label: i === TE_EDGES.length - 1 ? `${from}+` : `${from}-${TE_EDGES[i + 1] - 1}`,
  from,
}));
/** The kinds the report's cells show: own is the baseline, gear and maxed are the ones with no table of their own for the set. */
const CELL_KINDS = ['own', 'gear', 'maxed'];
const MIN_CELL = 3;

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const quiet = () => new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
const bad = problems => reply({ error: 'rejected', problems }, 400);

export const isTablePickRequest = url => url.pathname === '/tablepick' || url.pathname === '/tablepick/report';

const capOf = (v, d) => (Number(v) > 0 ? Number(v) : d);
const setKey = v => typeof v === 'string' && SET_KEY.test(v) && !PLAYER_ID.test(v);
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

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

/** The checked ping, or the problems. */
function readPing(b) {
  const problems = [];
  if (!TABLEPICK_KINDS.includes(b.kind)) problems.push(`kind must be one of ${TABLEPICK_KINDS.join(', ')}`);
  if (b.kind === 'delivery') {
    if (!setKey(b.answered)) problems.push('answered must be the delivery key that answered (letters, digits, _ or -, 1 to 24)');
  } else if (b.answered !== undefined) problems.push('answered is only for kind delivery');
  if (b.delivery !== undefined && !setKey(b.delivery)) problems.push('delivery must be a delivery key (letters, digits, _ or -, 1 to 24)');
  if (b.noTable !== undefined && typeof b.noTable !== 'boolean') problems.push('noTable must be true or false');
  if (!TE_EDGES.includes(b.te)) problems.push(`te must be one of ${TE_EDGES.join(', ')}`);
  if (typeof b.build !== 'string' || !BUILD_RE.test(b.build) || PLAYER_ID.test(b.build)) problems.push('build must be the page build stamp (1 to 40 characters)');
  return problems.length
    ? { problems }
    : {
        ping: {
          kind: b.kind,
          answered: b.kind === 'delivery' ? b.answered : '',
          own: b.delivery ?? '',
          no_table: b.noTable === undefined ? -1 : b.noTable ? 1 : 0,
          te: b.te,
          build: b.build,
        },
      };
}

/** The owner's report: counts only, summed over the window, small cells hidden. */
async function report(request, env, now, url) {
  const token = env.TABLEPICK_ADMIN_TOKEN || env.RUNS_ADMIN_TOKEN;
  if (!token) return reply({ error: 'not found' }, 404);
  if (!sameText(request.headers.get('x-admin-token'), token)) return reply({ error: 'missing or wrong token' }, 403);
  const raw = url.searchParams.get('days') ?? '30';
  let since = '0000-01-01';
  let days = 'all';
  if (raw !== 'all') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return bad(['days must be a whole number from 1 to 3650, or all']);
    days = n;
    since = dayOf(now - (n - 1) * DAY_MS);
  }
  const bandsRaw = url.searchParams.get('bands') ?? 'coarse';
  if (bandsRaw !== 'coarse' && bandsRaw !== 'fine') return bad(['bands must be coarse or fine']);
  const bands = bandsRaw === 'fine' ? FINE_BANDS : BANDS;
  const { results } = await env.WATCH.prepare(
    'SELECT kind, own, no_table, te, SUM(n) AS n FROM table_picks WHERE day >= ? GROUP BY kind, own, no_table, te'
  )
    .bind(since)
    .all();
  const kinds = { own: 0, gear: 0, delivery: 0, maxed: 0 };
  const cells = new Map();
  let total = 0;
  for (const r of results || []) {
    kinds[r.kind] = (kinds[r.kind] ?? 0) + r.n;
    total += r.n;
    if (!CELL_KINDS.includes(r.kind)) continue;
    const band = [...bands].reverse().find(x => r.te >= x.from).label;
    const noTable = r.no_table === 1 ? 'yes' : r.no_table === 0 ? 'no' : 'unknown';
    const k = `${r.kind}|${r.own}|${band}|${noTable}`;
    cells.set(k, { kind: r.kind, own: r.own, band, noTable, n: (cells.get(k)?.n ?? 0) + r.n });
  }
  const all = [...cells.values()].sort((a, b) => b.n - a.n || a.kind.localeCompare(b.kind) || a.own.localeCompare(b.own) || a.band.localeCompare(b.band));
  const fallback = all.filter(c => c.n >= MIN_CELL);
  return reply({ days, bands: bandsRaw, total, kinds, fallback, hiddenCells: all.length - fallback.length, note: `answers shown (about browser-days), not players; cells under ${MIN_CELL} hidden; own = the player's own table, gear = the gear-shifted table, maxed = the main table` });
}

/** `POST /tablepick`, `GET /tablepick/report`. */
export async function handleTablePick(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'the table ping is not set up on this collector' }, 503);
  const url = new URL(request.url);
  if (url.pathname === '/tablepick/report') {
    if (request.method !== 'GET') return reply({ error: 'method not allowed' }, 405);
    return report(request, env, now, url);
  }
  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  if (await overLimit(env, request, 'tablepick')) return quiet();
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > TABLEPICK_MAX_BYTES) return reply({ error: 'too big' }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > TABLEPICK_MAX_BYTES) return reply({ error: 'too big' }, 413);
  if (PLAYER_ID.test(text)) return bad(['no player id, ever']);
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return reply({ error: 'body must be JSON' }, 400);
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return reply({ error: 'body must be JSON' }, 400);
  const { ping, problems } = readPing(b);
  if (problems) return bad(problems);

  // Caps: a good ping over one is dropped with the same 204, nothing written.
  if (env.CSV_UPLOAD_KEY) {
    const ip = await keyedHash(env, `tablepick-ip|${request.headers.get('cf-connecting-ip') || 'unknown'}`);
    if (!(await spend(env, `tablepick-ip|${ip}`, 1, 20, now, DAY_MS)).ok) return quiet();
  }
  if (!(await spend(env, 'tablepick-day', 1, capOf(env.TABLEPICK_PER_DAY, 2000), now, DAY_MS)).ok) return quiet();
  try {
    await env.WATCH.prepare(
      `INSERT INTO table_picks (day, kind, answered, own, no_table, te, build, n) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(day, kind, answered, own, no_table, te, build) DO UPDATE SET n = n + 1`
    )
      .bind(dayOf(now), ping.kind, ping.answered, ping.own, ping.no_table, ping.te, ping.build)
      .run();
  } catch {
    /* a ping that cannot be counted changes nothing for the page */
  }
  return quiet();
}
