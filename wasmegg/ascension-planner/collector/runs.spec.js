/**
 * "Long-run alert" (runs.js, notes/long-run-alert-design-2026-11-07.md): a page announces a long search (start) and its end
 * (stop), anonymously; the owner reads the active ones before a deploy; one ntfy note goes out on a start and on a stop.
 * D1 is Node's in-memory SQLite with the real migrations.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { handleRuns, pruneRuns, RUNS_MARGIN_MS } from './runs.js';
import { makeD1 } from './d1shim.js';
import { spend } from './budget.js';
import worker from './worker.js';

const NOW = Date.UTC(2026, 10, 7, 23, 5, 0); // 4:05 pm MST
const HOUR = 3_600_000;
const RUN = 'AbCdEfGhIjKlMnOpQrStUv';
let env;
let sent;
let pending;
const ctx = { waitUntil: p => pending.push(p) };
const fetchImpl = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) });
  return new Response('ok');
};
beforeEach(() => {
  env = { WATCH: makeD1(), CSV_UPLOAD_KEY: 'k', RUNS_ADMIN_TOKEN: 'owner-secret', RUNS_NTFY_TOPIC: 'topic-secret-xyz' };
  sent = [];
  pending = [];
});

const start = (over = {}) => ({ t: 'start', run: RUN, kind: 'exact', estHours: 3.5, build: '2026-11-04T17:18:24.914Z', startedAt: NOW - 1000, ...over });
const post = async (body, { ip = '1.1.1.1', now = NOW, raw } = {}) => {
  const res = await handleRuns(
    new Request('https://c.example/runs', { method: 'POST', headers: { 'content-type': 'text/plain', 'cf-connecting-ip': ip }, body: raw ?? JSON.stringify(body) }),
    env,
    ctx,
    now,
    fetchImpl
  );
  await Promise.all(pending.splice(0));
  return res;
};
const active = (headers = { 'x-admin-token': 'owner-secret' }, now = NOW) =>
  handleRuns(new Request('https://c.example/runs/active', { headers }), env, ctx, now, fetchImpl);
const rows = () => env.WATCH._db.prepare('SELECT * FROM runs').all();

describe('start', () => {
  it('stores the run with nothing else: no address, no code, no id', async () => {
    const res = await post(start());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const r = rows();
    expect(r).toHaveLength(1);
    expect(Object.keys(r[0]).sort()).toEqual(['build', 'ended', 'est', 'kind', 'reason', 'recv', 'run', 'started']);
    expect(r[0]).toMatchObject({ run: RUN, kind: 'exact', est: 3.5, started: NOW - 1000, recv: NOW, ended: null });
    expect(JSON.stringify(r)).not.toMatch(/1\.1\.1\.1/);
  });
  it('is idempotent: a retried start is ok, stores nothing new, counts nothing and pushes nothing twice', async () => {
    await post(start());
    expect((await post(start())).status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });
  it('drops unknown fields', async () => {
    await post({ ...start(), name: 'x', note: 'y' });
    expect(Object.keys(rows()[0])).not.toContain('name');
  });
  it.each([
    ['a short run code', { run: 'abc' }],
    ['a run code with a bad character', { run: 'AbCdEfGhIjKlMnOpQrSt!!' }],
    ['an unknown kind', { kind: 'turbo' }],
    ['an estimate under 15 minutes', { estHours: 0.1 }],
    ['an estimate over 2000 hours', { estHours: 2001 }],
    ['a text estimate', { estHours: 'long' }],
    ['no build', { build: undefined }],
    ['a build with a space', { build: '2026 11 04' }],
    ['a start 20 minutes in the past', { startedAt: NOW - 20 * 60_000 }],
    ['a start an hour ahead', { startedAt: NOW + HOUR }],
    ['a start in seconds', { startedAt: Math.floor(NOW / 1000) }],
  ])('refuses %s with 400 and stores nothing', async (_n, over) => {
    const res = await post(start(over));
    expect(res.status).toBe(400);
    expect((await res.json()).problems.length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
  it('refuses an unknown t, a non-object, bad JSON, and a player id anywhere in the body', async () => {
    expect((await post({ ...start(), t: 'beat' })).status).toBe(400);
    expect((await post([1])).status).toBe(400);
    expect((await post(null, { raw: 'not json' })).status).toBe(400);
    expect((await post({ ...start(), extra: 'EI1234567890123456' })).status).toBe(400);
    expect((await post({ ...start(), build: 'ei1234567890123456' })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });
  it('refuses a body over 512 bytes with 413', async () => {
    expect((await post({ ...start(), pad: 'x'.repeat(600) })).status).toBe(413);
  });
  it('is 503 without D1', async () => {
    delete env.WATCH;
    expect((await post(start())).status).toBe(503);
  });
});

describe('stop', () => {
  it('marks the run ended with its reason, and is idempotent', async () => {
    await post(start());
    const res = await post({ t: 'stop', run: RUN, reason: 'done' }, { now: NOW + 3 * HOUR });
    expect(res.status).toBe(200);
    expect(rows()[0]).toMatchObject({ ended: NOW + 3 * HOUR, reason: 'done' });
    expect((await post({ t: 'stop', run: RUN, reason: 'closed' }, { now: NOW + 4 * HOUR })).status).toBe(200);
    expect(rows()[0]).toMatchObject({ ended: NOW + 3 * HOUR, reason: 'done' });
  });
  it('a stop for a run the collector never saw is 404 (the client ignores it)', async () => {
    expect((await post({ t: 'stop', run: RUN, reason: 'done' })).status).toBe(404);
  });
  it.each(['done', 'cancelled', 'closed', 'failed'])('takes the reason %s', async reason => {
    await post(start());
    expect((await post({ t: 'stop', run: RUN, reason })).status).toBe(200);
  });
  it('refuses an unknown reason or a bad run code with 400', async () => {
    await post(start());
    expect((await post({ t: 'stop', run: RUN, reason: 'bored' })).status).toBe(400);
    expect((await post({ t: 'stop', run: 'x', reason: 'done' })).status).toBe(400);
    expect(rows()[0].ended).toBe(null);
  });
});

describe('caps', () => {
  const nth = n => `${String(n).padStart(22, 'r')}`;
  it('6 new runs a day from one address, then 429 with the wait; another address is fine; a retried start is not counted', async () => {
    for (let i = 0; i < 6; i++) expect((await post(start({ run: nth(i) }))).status).toBe(200);
    expect((await post(start({ run: nth(0) }))).status).toBe(200);
    const res = await post(start({ run: nth(7) }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(res.headers.get('retry-after')).toBe(String(body.retryAfter));
    expect(rows()).toHaveLength(6);
    expect((await post(start({ run: nth(8) }), { ip: '2.2.2.2' })).status).toBe(200);
    expect((await post(start({ run: nth(9), startedAt: NOW + 86_400_000 }), { now: NOW + 86_400_001 })).status).toBe(200);
  });
  it('the counter is a keyed hash: the address is nowhere in D1', async () => {
    await post(start(), { ip: '203.0.113.77' });
    const all = JSON.stringify(env.WATCH._db.prepare('SELECT * FROM follow_rate').all()) + JSON.stringify(rows());
    expect(all).not.toContain('203.0.113.77');
  });
  it('RUNS_NEW_PER_DAY limits new runs a day for the whole collector', async () => {
    env.RUNS_NEW_PER_DAY = '2';
    expect((await post(start({ run: nth(1) }), { ip: '3.3.3.1' })).status).toBe(200);
    expect((await post(start({ run: nth(2) }), { ip: '3.3.3.2' })).status).toBe(200);
    expect((await post(start({ run: nth(3) }), { ip: '3.3.3.3' })).status).toBe(429);
  });
  it('RUNS_MAX_OPEN limits unfinished rows: a start past it is 429, until one stops', async () => {
    env.RUNS_MAX_OPEN = '2';
    await post(start({ run: nth(1) }), { ip: '4.4.4.1' });
    await post(start({ run: nth(2) }), { ip: '4.4.4.2' });
    expect((await post(start({ run: nth(3) }), { ip: '4.4.4.3' })).status).toBe(429);
    await post({ t: 'stop', run: nth(1), reason: 'done' });
    expect((await post(start({ run: nth(3) }), { ip: '4.4.4.3' })).status).toBe(200);
  });
  it('the edge limiter (FOLLOW_LIMIT) answers 429 and nothing is read', async () => {
    env.FOLLOW_LIMIT = { limit: async () => ({ success: false }) };
    expect((await post(start())).status).toBe(429);
    expect(rows()).toHaveLength(0);
  });
});

describe('GET /runs/active (owner only)', () => {
  it('is 404 when the owner secret is not set, and 403 without or with a wrong token', async () => {
    expect((await active({})).status).toBe(403);
    expect((await active({ 'x-admin-token': 'nope' })).status).toBe(403);
    delete env.RUNS_ADMIN_TOKEN;
    expect((await active({ 'x-admin-token': 'anything' })).status).toBe(404);
  });
  it('lists runs with no stop whose expected end plus the margin has not passed; no run code in full, no address', async () => {
    await post(start({ run: 'A'.repeat(22), estHours: 3, startedAt: NOW - 1000 }));
    await post(start({ run: 'B'.repeat(22), estHours: 2, startedAt: NOW - 1000 }), { ip: '5.5.5.5' });
    await post({ t: 'stop', run: 'B'.repeat(22), reason: 'done' }, { ip: '5.5.5.5' });
    const res = await active();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.now).toBe(NOW);
    expect(body.margin).toBe(RUNS_MARGIN_MS);
    expect(body.active).toEqual([
      { run: 'AAAAAA', kind: 'exact', estHours: 3, build: '2026-11-04T17:18:24.914Z', startedAt: NOW - 1000, expectedEnd: NOW - 1000 + 3 * HOUR, listedUntil: NOW - 1000 + 3 * HOUR + RUNS_MARGIN_MS },
    ]);
    expect(body.overdue).toBe(0);
    expect(JSON.stringify(body)).not.toContain('A'.repeat(7));
  });
  it('a run past its expected end plus the margin, with no stop, is not active but is counted as overdue', async () => {
    await post(start({ estHours: 2 }));
    const later = NOW + 2 * HOUR + RUNS_MARGIN_MS + 60_000;
    const body = await (await active({ 'x-admin-token': 'owner-secret' }, later)).json();
    expect(body.active).toEqual([]);
    expect(body.overdue).toBe(1);
  });
  it('a run still listed inside the margin after its expected end', async () => {
    await post(start({ estHours: 2 }));
    const body = await (await active({ 'x-admin-token': 'owner-secret' }, NOW + 2 * HOUR + 30 * 60_000)).json();
    expect(body.active).toHaveLength(1);
  });
  it('RUNS_MARGIN_MIN changes the margin', async () => {
    env.RUNS_MARGIN_MIN = '10';
    await post(start({ estHours: 2 }));
    const body = await (await active({ 'x-admin-token': 'owner-secret' }, NOW + 2 * HOUR + 11 * 60_000)).json();
    expect(body.active).toEqual([]);
    expect(body.margin).toBe(10 * 60_000);
  });
});

describe('the ntfy note', () => {
  it('a start pushes once: kind, start time, estimate and expected end in 12-hour Mountain time, and how many are active; no run code, no build', async () => {
    await post(start({ estHours: 3.5 }));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://ntfy.sh');
    const m = sent[0].body;
    expect(m.topic).toBe('topic-secret-xyz');
    expect(m.message).toMatch(/Exact/);
    expect(m.message).toMatch(/started 4:04 pm MST/);
    expect(m.message).toMatch(/3 h 30 min/);
    expect(m.message).toMatch(/expected end about 7:34 pm MST/);
    expect(m.message).toMatch(/Active now: 1/);
    expect(JSON.stringify(m)).not.toContain(RUN);
    expect(JSON.stringify(m)).not.toContain('2026-11-04');
  });
  it('a stop pushes once with the reason and how long it ran, and the count that is still active', async () => {
    await post(start({ estHours: 3.5 }));
    await post({ t: 'stop', run: RUN, reason: 'closed' }, { now: NOW + 2 * HOUR + 12 * 60_000 });
    await post({ t: 'stop', run: RUN, reason: 'closed' }, { now: NOW + 3 * HOUR });
    expect(sent).toHaveLength(2);
    expect(sent[1].body.message).toMatch(/closed/i);
    expect(sent[1].body.message).toMatch(/2 h 12 min/);
    expect(sent[1].body.message).toMatch(/Active now: 0/);
  });
  it('at most RUNS_PUSH_PER_DAY a day: the run is still stored and answered 200', async () => {
    env.RUNS_PUSH_PER_DAY = '2';
    for (let i = 1; i <= 4; i++) expect((await post(start({ run: `${i}`.padStart(22, 'p') }), { ip: `6.6.6.${i}` })).status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(rows()).toHaveLength(4);
  });
  it('without a topic nothing is pushed; an ntfy that is down changes nothing', async () => {
    delete env.RUNS_NTFY_TOPIC;
    expect((await post(start())).status).toBe(200);
    expect(sent).toHaveLength(0);
    env.RUNS_NTFY_TOPIC = 't';
    const res = await handleRuns(
      new Request('https://c.example/runs', { method: 'POST', body: JSON.stringify(start({ run: 'Z'.repeat(22) })), headers: { 'cf-connecting-ip': '9.9.9.9' } }),
      env,
      ctx,
      NOW,
      async () => {
        throw new Error('down');
      }
    );
    await Promise.all(pending.splice(0));
    expect(res.status).toBe(200);
  });
});

describe('the cron prune', () => {
  it('deletes rows 3 days after the stop, or 3 days after an unstopped run should have ended; keeps the rest', async () => {
    const insert = env.WATCH._db.prepare('INSERT INTO runs (run, kind, est, build, started, recv, ended, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const D = 86_400_000;
    insert.run('old-stopped', 'exact', 3, 'b', NOW - 9 * D, NOW - 9 * D, NOW - 4 * D, 'done');
    insert.run('new-stopped', 'exact', 3, 'b', NOW - 2 * D, NOW - 2 * D, NOW - 1 * D, 'done');
    insert.run('old-silent', 'exact', 3, 'b', NOW - 9 * D, NOW - 9 * D, null, null);
    insert.run('live', 'exact', 3, 'b', NOW - 1000, NOW - 1000, null, null);
    await pruneRuns(env, NOW);
    expect(rows().map(r => r.run).sort()).toEqual(['live', 'new-stopped']);
  });
});

describe('budget rows', () => {
  it('uses spend() from budget.js (the same follow_rate table)', async () => {
    expect((await spend(env, 'x|1', 1, 1, NOW, 1000)).ok).toBe(true);
  });
});

describe('wired into the Worker', () => {
  const kv = { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; }, async getWithMetadata() { return { value: null, metadata: null }; } };
  it('POST /runs and GET /runs/active are routed, with CORS', async () => {
    const e = { ...env, SUBMISSIONS: kv };
    const res = await worker.fetch(new Request('https://c.example/runs', { method: 'POST', headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '8.8.8.8' }, body: JSON.stringify(start({ startedAt: Date.now() })) }), e, ctx);
    await Promise.all(pending.splice(0));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const list = await worker.fetch(new Request('https://c.example/runs/active', { headers: { 'x-admin-token': 'owner-secret' } }), e, ctx);
    expect(list.status).toBe(200);
    expect((await list.json()).active).toHaveLength(1);
    const pre = await worker.fetch(new Request('https://c.example/runs', { method: 'OPTIONS', headers: { origin: 'https://x.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } }), e, ctx);
    expect(pre.status).toBeLessThan(300);
    expect(pre.headers.get('access-control-allow-methods')).toMatch(/POST/);
  });
  it('the hourly cron prunes old runs and spent budget rows', async () => {
    const D = 86_400_000;
    env.WATCH._db.prepare('INSERT INTO runs (run, kind, est, build, started, recv, ended, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('old', 'exact', 3, 'b', NOW - 9 * D, NOW - 9 * D, NOW - 5 * D, 'done');
    env.WATCH._db.prepare('INSERT INTO follow_rate (key, since, n) VALUES (?, ?, 1)').run('runs-ip|old', NOW - 5 * D);
    const e = { ...env, SUBMISSIONS: kv };
    const waits = [];
    await worker.scheduled({ scheduledTime: NOW - (NOW % 3_600_000) }, e, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    expect(rows()).toHaveLength(0);
    expect(env.WATCH._db.prepare("SELECT COUNT(*) AS n FROM follow_rate WHERE key = 'runs-ip|old'").get().n).toBe(0);
  });
});
