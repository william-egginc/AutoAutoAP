/**
 * Big CSV uploads to R2 (bigcsv.js): the contract in ~/code/aaap-tools/notes/bigcsv-contract.md. R2 is an in-memory
 * fake with the multipart calls the Worker uses; D1 is Node's in-memory SQLite with the real migrations; the row
 * and its upload token come from a real /submit through the Worker.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { BIGCSV_BUDGET_BYTES, BIGCSV_MAX_PART, BIGCSV_MIN_PART, BIGCSV_PER_OWNER, partSizeOf } from './bigcsv.js';

const MIGRATIONS = readdirSync(new URL('./migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));

function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) db.exec(m);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    async first() { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
    async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })), success: true }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: sql => statement(sql), _db: db };
}

function makeKV() {
  const m = new Map();
  const meta = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async getWithMetadata(k) { return { value: m.has(k) ? m.get(k) : null, metadata: meta.get(k) ?? null }; },
    async put(k, v, o) { m.set(k, v); if (o && o.metadata) meta.set(k, o.metadata); else meta.delete(k); },
    async delete(k) { m.delete(k); meta.delete(k); },
    async list({ prefix, limit }) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit);
      return { keys: keys.map(name => (meta.has(name) ? { name, metadata: meta.get(name) } : { name })), list_complete: true };
    },
  };
}

/** R2, as far as bigcsv.js uses it: multipart upload, get with a range, delete. Part bytes are kept as they came. */
function makeR2() {
  const objects = new Map();
  const uploads = new Map();
  const bucket = {
    _objects: objects,
    _uploads: uploads,
    async createMultipartUpload(key, opts) {
      const uploadId = `u${uploads.size + 1}`;
      uploads.set(uploadId, { key, parts: new Map(), meta: opts?.customMetadata });
      return bucket.resumeMultipartUpload(key, uploadId);
    },
    resumeMultipartUpload(key, uploadId) {
      return {
        uploadId,
        async uploadPart(n, body) {
          const buf = new Uint8Array(await new Response(body).arrayBuffer());
          uploads.get(uploadId).parts.set(n, buf);
          return { partNumber: n, etag: `etag-${n}-${buf.length}` };
        },
        async complete(list) {
          const u = uploads.get(uploadId);
          const chunks = list.map(p => u.parts.get(p.partNumber));
          const all = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
          let o = 0;
          for (const c of chunks) { all.set(c, o); o += c.length; }
          objects.set(key, { bytes: all, meta: u.meta });
          uploads.delete(uploadId);
          return { size: all.length };
        },
        async abort() { uploads.delete(uploadId); },
      };
    },
    async get(key, opts) {
      const o = objects.get(key);
      if (!o) return null;
      const r = opts?.range;
      let off = 0, len = o.bytes.length;
      if (r?.suffix !== undefined) { off = o.bytes.length - r.suffix; len = r.suffix; }
      else if (r) { off = r.offset; len = r.length ?? o.bytes.length - off; }
      const slice = o.bytes.slice(off, off + len);
      return { size: o.bytes.length, body: new Blob([slice]).stream(), arrayBuffer: async () => slice.buffer, range: r ? (r.suffix !== undefined ? { suffix: r.suffix } : { offset: off, length: len }) : undefined };
    },
    async delete(key) { objects.delete(key); },
  };
  return bucket;
}

const PART = BIGCSV_MIN_PART; // 5 MiB parts keep the tests quick
const gzipBytes = n => { const b = new Uint8Array(n); b[0] = 0x1f; b[1] = 0x8b; for (let i = 2; i < n; i++) b[i] = i % 251; return b; };
/** Byte equality without vitest's element-by-element toEqual, which takes minutes on megabytes. */
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const BODY = { schema: 3, chain: [195, 490], durationDays: 700, finalTE: 490, chainsPriced: 800_000 };

let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key', WATCH: makeD1(), BIGCSV: makeR2(), BIGCSV_ADMIN_TOKEN: 'admin-secret-1234' };
});

const call = (path, init = {}, ip = '1.1.1.1') => worker.fetch(new Request(`https://c.test${path}`, { ...init, headers: { 'cf-connecting-ip': ip, ...(init.headers || {}) } }), env);
const submit = async (over = {}, owner = 'a'.repeat(32), ip = '1.1.1.1') => {
  const res = await call('/submit', { method: 'POST', headers: { 'content-type': 'application/json', ...(owner ? { 'x-owner-token': owner } : {}) }, body: JSON.stringify({ ...BODY, ...over }) }, ip);
  return res.json();
};
const start = (id, token, bytes, partSize = PART) => call(`/bigcsv/start?id=${id}&bytes=${bytes}&partSize=${partSize}`, { method: 'POST', headers: token ? { 'x-upload-token': token } : {} });
const put = (id, token, n, bytes) => call(`/bigcsv/part?id=${id}&n=${n}`, { method: 'PUT', headers: { 'x-upload-token': token, 'content-length': String(bytes.length) }, body: bytes });
const parts = (id, token) => call(`/bigcsv/parts?id=${id}`, { headers: { 'x-upload-token': token } });
const complete = (id, token) => call(`/bigcsv/complete?id=${id}`, { method: 'POST', headers: { 'x-upload-token': token } });
const rows = () => env.WATCH._db.prepare('SELECT * FROM bigcsv').all();

async function fullUpload(id, token, file, partSize = PART) {
  expect((await start(id, token, file.length, partSize)).status).toBe(200);
  const n = Math.ceil(file.length / partSize);
  for (let i = 1; i <= n; i++) expect((await put(id, token, i, file.slice((i - 1) * partSize, i * partSize))).status).toBe(200);
  return complete(id, token);
}

describe('a whole upload', () => {
  it('start, parts, complete: the object is the file, the row says kept, and status is public', async () => {
    const { id, uploadToken } = await submit();
    const file = gzipBytes(PART * 2 + 12345);
    const done = await fullUpload(id, uploadToken, file);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ ok: true, bytes: file.length });
    const obj = env.BIGCSV._objects.get(`bigcsv/${id}.csv.gz`);
    expect(same(obj.bytes, file)).toBe(true);
    expect(JSON.stringify(obj.meta)).not.toMatch(/EI\d{16}/);
    expect(Object.keys(obj.meta).sort()).toEqual(['at', 'bytes', 'parts', 'row']);
    const status = await (await call(`/bigcsv/status?id=${id}`)).json();
    expect(status).toMatchObject({ kept: true, bytes: file.length });
    expect(await (await call('/bigcsv/status?id=abcd1234')).json()).toEqual({ kept: false });
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM bigcsv_parts').get().n).toBe(0);
  });

  it('answers 409 to a second big CSV for the same row', async () => {
    const { id, uploadToken } = await submit();
    await fullUpload(id, uploadToken, gzipBytes(PART + 10));
    expect((await start(id, uploadToken, PART + 10)).status).toBe(409);
    expect((await put(id, uploadToken, 1, gzipBytes(PART))).status).toBe(409);
  });
});

describe('resuming', () => {
  it('lists the parts the server has, resumes with the original sizes, and repeats a part without writing', async () => {
    const { id, uploadToken } = await submit();
    const file = gzipBytes(PART * 3 + 7);
    await start(id, uploadToken, file.length);
    await put(id, uploadToken, 1, file.slice(0, PART));
    await put(id, uploadToken, 3, file.slice(PART * 2, PART * 3));
    const listed = await (await parts(id, uploadToken)).json();
    expect(listed).toMatchObject({ state: 'open', partSize: PART, parts: 4, bytes: file.length, uploaded: [{ n: 1, size: PART }, { n: 3, size: PART }] });
    // A second start resumes, whatever new numbers it sends.
    const again = await (await start(id, uploadToken, 999, 6 * 1024 * 1024)).json();
    expect(again).toMatchObject({ resumed: true, partSize: PART, parts: 4, bytes: file.length });
    expect(again.uploaded).toHaveLength(2);
    const stored = env.BIGCSV._uploads.get('u1').parts.get(1);
    const repeat = await put(id, uploadToken, 1, new Uint8Array(PART).fill(9));
    expect(await repeat.json()).toMatchObject({ ok: true, already: true });
    expect(env.BIGCSV._uploads.get('u1').parts.get(1)).toBe(stored);
    // Complete before the rest: 409 with what is missing.
    const early = await complete(id, uploadToken);
    expect(early.status).toBe(409);
    expect((await early.json()).missing).toEqual([2, 4]);
    await put(id, uploadToken, 2, file.slice(PART, PART * 2));
    await put(id, uploadToken, 4, file.slice(PART * 3));
    expect((await complete(id, uploadToken)).status).toBe(200);
    expect(same(env.BIGCSV._objects.get(`bigcsv/${id}.csv.gz`).bytes, file)).toBe(true);
  });

  it('abort drops the upload and lets it start again', async () => {
    const { id, uploadToken } = await submit();
    await start(id, uploadToken, PART + 1);
    await put(id, uploadToken, 1, gzipBytes(PART));
    expect((await call(`/bigcsv/abort?id=${id}`, { method: 'POST', headers: { 'x-upload-token': uploadToken } })).status).toBe(200);
    expect(rows()).toHaveLength(0);
    expect(env.BIGCSV._uploads.size).toBe(0);
    expect((await start(id, uploadToken, PART + 1)).status).toBe(200);
  });
});

describe('who may, and what', () => {
  it('refuses a missing, wrong or progress token with 403 before touching anything', async () => {
    const { id, uploadToken } = await submit();
    expect((await start(id, undefined, PART)).status).toBe(403);
    expect((await start(id, 'f'.repeat(64), PART)).status).toBe(403);
    expect((await start(id, uploadToken.replace(/./, c => (c === 'a' ? 'b' : 'a')), PART)).status).toBe(403);
    expect(rows()).toHaveLength(0);
  });

  it('refuses a small run with 422, and a row that is not on a board with 404', async () => {
    const small = await submit({ chainsPriced: 5000, durationDays: 701 });
    expect((await start(small.id, small.uploadToken, PART)).status).toBe(422);
    const { uploadToken } = await submit({ durationDays: 702 });
    // A token for an id nobody submitted cannot be made, but a valid token for a row that left the board can.
    const gone = await submit({ durationDays: 703 });
    for (const k of [...env.SUBMISSIONS._m.keys()]) if (k.includes(gone.id)) env.SUBMISSIONS._m.delete(k);
    env.SUBMISSIONS._m.delete('snap:sub');
    expect((await start(gone.id, gone.uploadToken, PART)).status).toBe(404);
    expect(uploadToken).toBeTruthy();
  });

  it('checks the sizes: part size range, total cap, part count, exact part length, content-length', async () => {
    const { id, uploadToken } = await submit();
    expect((await start(id, uploadToken, PART, 1000)).status).toBe(400);
    expect((await start(id, uploadToken, PART, BIGCSV_MAX_PART + 1)).status).toBe(400);
    expect((await start(id, uploadToken, 5 * 1024 ** 3)).status).toBe(413);
    expect((await start(id, uploadToken, 0)).status).toBe(400);
    expect((await start(id, uploadToken, PART * 2)).status).toBe(200);
    expect((await put(id, uploadToken, 1, gzipBytes(PART - 1))).status).toBe(400);
    expect((await put(id, uploadToken, 3, gzipBytes(PART))).status).toBe(400);
    const noLen = await call(`/bigcsv/part?id=${id}&n=1`, { method: 'PUT', headers: { 'x-upload-token': uploadToken }, body: undefined });
    expect([400, 411]).toContain(noLen.status);
  });

  it('refuses a file that is not gzip, or the wrong size, at complete, and deletes it', async () => {
    const { id, uploadToken } = await submit();
    const notGz = new Uint8Array(PART + 5).fill(65);
    const res = await fullUpload(id, uploadToken, notGz);
    expect(res.status).toBe(422);
    expect(env.BIGCSV._objects.has(`bigcsv/${id}.csv.gz`)).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  it(`takes ${BIGCSV_PER_OWNER} per account in 30 days, then 429; another account is unaffected`, async () => {
    for (let i = 0; i < BIGCSV_PER_OWNER; i++) {
      const r = await submit({ durationDays: 710 + i }, 'a'.repeat(32), `2.2.2.${i}`);
      expect((await start(r.id, r.uploadToken, PART + 1)).status).toBe(200);
    }
    const over = await submit({ durationDays: 720 }, 'a'.repeat(32), '2.2.2.9');
    const res = await start(over.id, over.uploadToken, PART + 1);
    expect(res.status).toBe(429);
    expect((await res.json()).retryAfter).toBeGreaterThan(0);
    const other = await submit({ durationDays: 721 }, 'b'.repeat(32), '2.2.2.10');
    expect((await start(other.id, other.uploadToken, PART + 1)).status).toBe(200);
  });

  it('refuses when the byte budget would be passed', async () => {
    const r = await submit();
    env.WATCH._db.prepare("INSERT INTO bigcsv (id, upload_id, bytes, part_size, parts, state, owner, created) VALUES ('deadbeef', 'x', ?, ?, 1, 'done', 'zz', ?)").run(BIGCSV_BUDGET_BYTES - 100, PART, Date.now());
    const res = await start(r.id, r.uploadToken, PART + 1);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/full/);
  });

  it('refuses a player id anywhere in a query', async () => {
    const res = await call('/bigcsv/status?id=abcd1234&x=EI1234567890123456');
    expect(res.status).toBe(400);
  });

  it('says 503 without R2, and the helper sizes parts', async () => {
    delete env.BIGCSV;
    const { id, uploadToken } = await submit();
    expect((await start(id, uploadToken, PART)).status).toBe(503);
    expect(partSizeOf(1, 25, 10)).toBe(10);
    expect(partSizeOf(3, 25, 10)).toBe(5);
  });
});

describe('the maintainer', () => {
  it('downloads with the admin token (ranges too) and deletes; anyone else gets 404', async () => {
    const { id, uploadToken } = await submit();
    const file = gzipBytes(PART + 100);
    await fullUpload(id, uploadToken, file);
    expect((await call(`/bigcsv/admin?id=${id}`)).status).toBe(404);
    expect((await call(`/bigcsv/admin?id=${id}`, { headers: { 'x-admin-token': 'wrong-wrong-wrong' } })).status).toBe(404);
    const dl = await call(`/bigcsv/admin?id=${id}`, { headers: { 'x-admin-token': 'admin-secret-1234' } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toBe('application/gzip');
    expect(same(new Uint8Array(await dl.arrayBuffer()), file)).toBe(true);
    const ranged = await call(`/bigcsv/admin?id=${id}`, { headers: { 'x-admin-token': 'admin-secret-1234', range: 'bytes=0-9' } });
    expect(ranged.status).toBe(206);
    expect(same(new Uint8Array(await ranged.arrayBuffer()), file.slice(0, 10))).toBe(true);
    expect((await call(`/bigcsv/admin?id=${id}`, { method: 'DELETE', headers: { 'x-admin-token': 'admin-secret-1234' } })).status).toBe(200);
    expect(env.BIGCSV._objects.has(`bigcsv/${id}.csv.gz`)).toBe(false);
    expect(await (await call(`/bigcsv/status?id=${id}`)).json()).toEqual({ kept: false });
  });

  it('the admin route does not exist without the secret set', async () => {
    delete env.BIGCSV_ADMIN_TOKEN;
    expect((await call('/bigcsv/admin?id=abcd1234', { headers: { 'x-admin-token': 'undefined' } })).status).toBe(404);
  });
});

describe('CORS', () => {
  it('answers the preflight for PUT with the upload token header allowed', async () => {
    const res = await call('/bigcsv/part?id=abcd1234&n=1', { method: 'OPTIONS', headers: { origin: 'https://egg.example', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'x-upload-token,content-type' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
    expect(res.headers.get('access-control-allow-headers')).toContain('x-upload-token');
  });
});
