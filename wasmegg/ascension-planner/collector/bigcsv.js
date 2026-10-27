/**
 * Big CSV uploads: the FULL-detail .csv.gz of a very large run (~800k routes, 300 to 370 MB gzipped) kept in
 * R2, privately. Contract for the app: ~/code/aaap-tools/notes/bigcsv-contract.md. The KV CSV (`/csv`: the summary
 * of every route plus the top ~20k routes' legs) is unchanged and still goes first.
 *
 *   POST /bigcsv/start?id=&bytes=&partSize=   open (or resume) a multipart upload
 *   PUT  /bigcsv/part?id=&n=                  one part, streamed through (<= 90 MB, content-length required)
 *   GET  /bigcsv/parts?id=                    what the server has (the resume call)
 *   POST /bigcsv/complete?id=                 assemble, check size and gzip magic
 *   POST /bigcsv/abort?id=                    drop an open upload
 *   GET  /bigcsv/status?id=                   public: { kept, bytes, at }, never the bytes
 *   GET|DELETE /bigcsv/admin?id=              the maintainer's download / removal (x-admin-token = BIGCSV_ADMIN_TOKEN)
 *
 * AUTH: the row's FINAL upload token (`x-upload-token`, as /csv), so only the run's own tab; the row must be on a
 * board and have priced more than BIGCSV_MIN_ROUTES routes. One per row, BIGCSV_PER_OWNER per account per 30 days,
 * and a byte budget over the retention window (the free R2 plan holds 10 GB). The object is `bigcsv/<row id>.csv.gz`:
 * no player ID in a name or in its metadata (row id, bytes, parts, time).
 *
 * PARTS. R2 wants every part but the last to be the same size, so the size is fixed at start and the server checks
 * each part against it. The body is streamed to R2 (`uploadPart` with the request's own stream and its declared
 * length), never buffered, so memory and CPU stay small. The etag of each part is kept in D1: R2's binding has no
 * "list parts", and that record is what lets an upload resume. Everything here is D1 + R2, nothing in KV.
 */
import { PLAYER_ID, isKey, retry } from './follow.js';

export const BIGCSV_MIN_ROUTES = 100_000;
export const BIGCSV_MIN_PART = 5 * 1024 * 1024;
export const BIGCSV_MAX_PART = 90_000_000;
export const BIGCSV_MAX_BYTES = 4 * 1024 ** 3;
export const BIGCSV_MAX_PARTS = 1000;
export const BIGCSV_PER_OWNER = 3;
export const BIGCSV_DAYS = 90;
export const BIGCSV_BUDGET_BYTES = 9_000_000_000;
const DAY_MS = 86_400_000;
const ID_RE = /^[a-f0-9-]{4,40}$/;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};
const reply = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const bad = (problems, status = 400) => reply({ error: 'rejected', problems }, status);

export const isBigCsvRequest = url => url.pathname.startsWith('/bigcsv/');
const objectKey = id => `bigcsv/${id}.csv.gz`;
const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = s => (s !== null && /^\d{1,12}$/.test(s) ? Number(s) : NaN);

/** The size part `n` must have: partSize, except the last, which is what is left. */
export function partSizeOf(n, total, partSize) {
  const parts = Math.ceil(total / partSize);
  return n < parts ? partSize : total - partSize * (parts - 1);
}

const toBytes = hex => Uint8Array.from(hex.match(/.{2}/g) || [], h => parseInt(h, 16));

async function overLimit(env, request, kind) {
  if (!env.UPLOAD_LIMITER || typeof env.UPLOAD_LIMITER.limit !== 'function') return null;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const { success } = await env.UPLOAD_LIMITER.limit({ key: `bigcsv-${kind}|${ip}` });
    if (success) return null;
  } catch {
    return null;
  }
  return retry(60, 'too many requests from this address');
}

/**
 * `deps` are the worker's own helpers: `uploadToken(env, id)` (the final token), `sameToken(a, b)`, and
 * `findRow(env, ctx, id)` -> the stored record of a row on a board, or null.
 */
export async function handleBigCsv(request, env, ctx, deps, now = Date.now()) {
  const url = new URL(request.url);
  const path = url.pathname.slice('/bigcsv/'.length);
  if (PLAYER_ID.test(url.search)) return bad(['never send a player id']);

  // ------------------------------------------------------------------ public status
  if (path === 'status' && request.method === 'GET') {
    if (!env.WATCH) return reply({ kept: false });
    const id = url.searchParams.get('id');
    if (!id || !ID_RE.test(id)) return bad(['bad id']);
    const slow = await overLimit(env, request, 'status');
    if (slow) return slow;
    const row = await env.WATCH.prepare("SELECT bytes, done FROM bigcsv WHERE id = ? AND state = 'done'").bind(id).first();
    return reply(row ? { kept: true, bytes: row.bytes, at: row.done } : { kept: false });
  }

  // ------------------------------------------------------------------ the maintainer's route
  if (path === 'admin') {
    const secret = env.BIGCSV_ADMIN_TOKEN;
    if (!secret || !env.BIGCSV) return reply({ error: 'not found' }, 404);
    if (!deps.sameToken(request.headers.get('x-admin-token'), secret)) return reply({ error: 'not found' }, 404);
    const id = url.searchParams.get('id');
    if (!id || !ID_RE.test(id)) return bad(['bad id']);
    if (request.method === 'DELETE') {
      await env.BIGCSV.delete(objectKey(id));
      if (env.WATCH) await env.WATCH.prepare("UPDATE bigcsv SET state = 'deleted' WHERE id = ?").bind(id).run();
      return reply({ ok: true });
    }
    if (request.method !== 'GET') return reply({ error: 'method not allowed' }, 405);
    const range = request.headers.get('range');
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    const opts = m && (m[1] || m[2]) ? { range: m[1] === '' ? { suffix: Number(m[2]) } : { offset: Number(m[1]), ...(m[2] ? { length: Number(m[2]) - Number(m[1]) + 1 } : {}) } } : undefined;
    const obj = await env.BIGCSV.get(objectKey(id), opts);
    if (!obj) return reply({ error: 'not found' }, 404);
    const headers = { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${id}.csv.gz"`, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    if (opts && obj.range) {
      const off = obj.range.offset ?? obj.size - obj.range.suffix;
      const len = obj.range.length ?? obj.size - off;
      headers['content-range'] = `bytes ${off}-${off + len - 1}/${obj.size}`;
      headers['content-length'] = String(len);
      return new Response(obj.body, { status: 206, headers });
    }
    headers['content-length'] = String(obj.size);
    return new Response(obj.body, { headers });
  }

  // ------------------------------------------------------------------ the run's own tab
  if (!['start', 'part', 'parts', 'complete', 'abort'].includes(path)) return reply({ error: 'not found' }, 404);
  if (!env.BIGCSV || !env.WATCH || !env.CSV_UPLOAD_KEY) return reply({ error: 'big CSV uploads are not set up on this collector' }, 503);
  const method = { start: 'POST', part: 'PUT', parts: 'GET', complete: 'POST', abort: 'POST' }[path];
  if (request.method !== method) return reply({ error: 'method not allowed' }, 405);
  const id = url.searchParams.get('id');
  if (!id || !ID_RE.test(id)) return bad(['bad id']);
  // The token is checked before anything is read or stored: a refused request costs nothing.
  if (!deps.sameToken(request.headers.get('x-upload-token'), await deps.uploadToken(env, id))) {
    return reply({ error: 'missing or wrong upload token - a big CSV can only follow its own /submit' }, 403);
  }
  const slow = await overLimit(env, request, path);
  if (slow) return slow;

  const rec = await env.WATCH.prepare('SELECT * FROM bigcsv WHERE id = ?').bind(id).first();
  const uploadedParts = async () =>
    ((await env.WATCH.prepare('SELECT n, size FROM bigcsv_parts WHERE id = ? ORDER BY n').bind(id).all()).results || []).map(r => ({ n: r.n, size: r.size }));
  const view = (r, uploaded, extra = {}) => ({ ok: true, state: r.state, partSize: r.part_size, parts: r.parts, bytes: r.bytes, uploaded, ...extra });

  if (path === 'start') {
    if (rec && rec.state === 'done') return reply({ error: 'this run already has its full CSV kept' }, 409);
    if (rec && rec.state === 'open') return reply(view(rec, await uploadedParts(), { resumed: true }));
    const bytes = num(url.searchParams.get('bytes'));
    const partSize = num(url.searchParams.get('partSize'));
    const problems = [];
    if (!Number.isFinite(bytes) || bytes < 1) problems.push('bytes must be a whole number of at least 1');
    if (!whole(partSize, BIGCSV_MIN_PART, BIGCSV_MAX_PART)) problems.push(`partSize must be ${BIGCSV_MIN_PART} to ${BIGCSV_MAX_PART}`);
    if (problems.length) return bad(problems);
    if (bytes > BIGCSV_MAX_BYTES) return reply({ error: `a full CSV is at most ${BIGCSV_MAX_BYTES} bytes` }, 413);
    const parts = Math.ceil(bytes / partSize);
    if (parts > BIGCSV_MAX_PARTS) return bad([`at most ${BIGCSV_MAX_PARTS} parts: use a bigger partSize`]);
    const row = await deps.findRow(env, ctx, id);
    if (!row) return reply({ error: 'not found' }, 404);
    // The minimum can be lowered by the TEST collector's var BIGCSV_MIN_ROUTES (an end-to-end run with 2,000 routes);
    // live sets no var, so it stays at 100,000.
    const minRoutes = Number(env.BIGCSV_MIN_ROUTES) || BIGCSV_MIN_ROUTES;
    if (!(Number(row.chainsPriced) > minRoutes)) return reply({ error: 'too small', minRoutes }, 422);
    const owner = typeof row.owner === 'string' ? row.owner.slice(0, 12) : null;
    const since = now - 30 * DAY_MS;
    if (owner) {
      const c = await env.WATCH.prepare("SELECT COUNT(*) AS n FROM bigcsv WHERE owner = ? AND state IN ('open','done') AND created > ?").bind(owner, since).first();
      if ((c?.n ?? 0) >= BIGCSV_PER_OWNER) return retry(7 * 86400, `at most ${BIGCSV_PER_OWNER} full CSVs per account in 30 days`);
    }
    const used = await env.WATCH.prepare("SELECT COALESCE(SUM(bytes), 0) AS b FROM bigcsv WHERE state IN ('open','done') AND created > ?").bind(now - BIGCSV_DAYS * DAY_MS).first();
    if ((used?.b ?? 0) + bytes > BIGCSV_BUDGET_BYTES) return retry(86400, 'the full-CSV store is full right now');
    const mp = await env.BIGCSV.createMultipartUpload(objectKey(id), { customMetadata: { row: id, bytes: String(bytes), parts: String(parts), at: String(now) } });
    // A deleted or abandoned record for this id is replaced.
    await env.WATCH.prepare('DELETE FROM bigcsv_parts WHERE id = ?').bind(id).run();
    await env.WATCH.prepare("INSERT OR REPLACE INTO bigcsv (id, upload_id, bytes, part_size, parts, state, owner, created, done) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, NULL)")
      .bind(id, mp.uploadId, bytes, partSize, parts, owner, now)
      .run();
    return reply({ ok: true, state: 'open', partSize, parts, bytes, uploaded: [], resumed: false });
  }

  if (!rec || rec.state === 'deleted') return reply({ error: 'no open upload: call start' }, 404);

  if (path === 'parts') return reply(view(rec, await uploadedParts()));

  if (path === 'abort') {
    if (rec.state === 'open') {
      try {
        await env.BIGCSV.resumeMultipartUpload(objectKey(id), rec.upload_id).abort();
      } catch {
        /* already gone */
      }
      await env.WATCH.prepare('DELETE FROM bigcsv_parts WHERE id = ?').bind(id).run();
      await env.WATCH.prepare('DELETE FROM bigcsv WHERE id = ?').bind(id).run();
    }
    return reply({ ok: true });
  }

  if (rec.state === 'done') return reply({ error: 'this run already has its full CSV kept' }, 409);

  if (path === 'part') {
    const n = num(url.searchParams.get('n'));
    if (!whole(n, 1, rec.parts)) return bad([`n must be 1 to ${rec.parts}`]);
    const want = partSizeOf(n, rec.bytes, rec.part_size);
    const have = await env.WATCH.prepare('SELECT size FROM bigcsv_parts WHERE id = ? AND n = ?').bind(id, n).first();
    if (have && have.size === want) return reply({ ok: true, n, size: want, already: true });
    const declared = request.headers.get('content-length');
    if (declared === null) return reply({ error: 'content-length is required' }, 411);
    if (num(declared) !== want) return bad([`part ${n} must be ${want} bytes`]);
    if (!request.body) return bad(['empty body']);
    const up = env.BIGCSV.resumeMultipartUpload(objectKey(id), rec.upload_id);
    const part = await up.uploadPart(n, request.body);
    await env.WATCH.prepare('INSERT OR REPLACE INTO bigcsv_parts (id, n, etag, size) VALUES (?, ?, ?, ?)').bind(id, n, part.etag, want).run();
    return reply({ ok: true, n, size: want });
  }

  // complete
  const have = await uploadedParts();
  const missing = [];
  for (let n = 1; n <= rec.parts; n++) if (!have.some(p => p.n === n)) missing.push(n);
  if (missing.length) return reply({ error: 'parts missing', missing }, 409);
  const etags = ((await env.WATCH.prepare('SELECT n, etag FROM bigcsv_parts WHERE id = ? ORDER BY n').bind(id).all()).results || []).map(r => ({ partNumber: r.n, etag: r.etag }));
  const up = env.BIGCSV.resumeMultipartUpload(objectKey(id), rec.upload_id);
  const obj = await up.complete(etags);
  const size = obj?.size;
  let magic = null;
  try {
    const head = await env.BIGCSV.get(objectKey(id), { range: { offset: 0, length: 2 } });
    magic = head ? new Uint8Array(await head.arrayBuffer()) : null;
  } catch {
    magic = null;
  }
  if (size !== rec.bytes || !magic || magic[0] !== 0x1f || magic[1] !== 0x8b) {
    await env.BIGCSV.delete(objectKey(id));
    await env.WATCH.prepare('DELETE FROM bigcsv_parts WHERE id = ?').bind(id).run();
    await env.WATCH.prepare('DELETE FROM bigcsv WHERE id = ?').bind(id).run();
    return reply({ error: `the assembled file is wrong (${size} bytes, gzip ${magic && magic[0] === 0x1f ? 'ok' : 'missing'}); start again` }, 422);
  }
  await env.WATCH.prepare("UPDATE bigcsv SET state = 'done', done = ? WHERE id = ?").bind(now, id).run();
  await env.WATCH.prepare('DELETE FROM bigcsv_parts WHERE id = ?').bind(id).run();
  return reply({ ok: true, bytes: size });
}
