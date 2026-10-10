/**
 * "Watch this run from your phone": the collector's /watch endpoints and its cron, end to end.
 *
 * D1 is faked with Node's own in-memory SQLite (node:sqlite) behind D1's prepare/bind/first/all/run
 * shape, so the real SQL -- the upsert that is also the rate limit, json_extract, the migration
 * file itself -- runs as written. No wrangler, no network, no account.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { cleanHeartbeat, handleWatch, MAX_ROWS, watchCron, WATCH_KEEP_MS } from './watch.js';

const MIGRATION = readFileSync(new URL('./migrations/0001_watch.sql', import.meta.url), 'utf8');

/** D1, as far as watch.js uses it, over an in-memory SQLite database. */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    async first() {
      const row = db.prepare(sql).get(...args);
      return row ? { ...row } : null;
    },
    async all() {
      return {
        results: db
          .prepare(sql)
          .all(...args)
          .map(r => ({ ...r })),
        success: true,
      };
    },
    async run() {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: sql => statement(sql), _db: db };
}

const KEY = 'AbCdEfGhIjKlMnOpQrStUvWx';
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);

function beat(over = {}) {
  return {
    key: KEY,
    status: 'running',
    mode: 'fastest',
    done: 120,
    total: 1000,
    timeLeftSec: 7200,
    bestSoFar: { te: 247, route: [150, 200, 247], finish: 1783900800 },
    startedAt: T0 - 3600_000,
    updatedAt: T0,
    workers: 8,
    ...over,
  };
}

const post = (env, body, now) =>
  handleWatch(
    new Request('https://c.example/watch', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    now
  );
const get = (env, key, now = T0) => handleWatch(new Request(`https://c.example/watch?key=${key}`), env, now);
const row = (env, key = KEY) => env.WATCH._db.prepare('SELECT * FROM watch WHERE key = ?').get(key);

let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});

describe('POST /watch and GET /watch', () => {
  it('stores a heartbeat and serves it back, without the ntfy topic', async () => {
    const res = await post(env, { ...beat(), notify: 'aaap-topic1' }, T0);
    expect(res.status).toBe(200);
    expect(row(env).notify).toBe('aaap-topic1');
    const got = await get(env, KEY, T0 + 5000);
    expect(got.status).toBe(200);
    const body = await got.json();
    expect(body.updated).toBe(T0);
    expect(body.data.status).toBe('running');
    expect(body.data.bestSoFar).toEqual({ te: 247, route: [150, 200, 247], finish: 1783900800 });
    expect(JSON.stringify(body)).not.toContain('aaap-topic1');
    expect(got.headers.get('access-control-allow-origin')).toBe('*');
    expect(got.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps only the known fields: nothing personal gets stored', async () => {
    await post(env, { ...beat({ label: 'Big run' }), nickname: 'someone', playerId: 'x', save: { a: 1 } }, T0);
    const data = JSON.parse(row(env).data);
    expect(data).not.toHaveProperty('nickname');
    expect(data).not.toHaveProperty('playerId');
    expect(data).not.toHaveProperty('save');
    expect(data).not.toHaveProperty('key');
    expect(data.label).toBe('Big run');
  });

  it('refuses a second write within a minute, and takes one after it', async () => {
    expect((await post(env, beat(), T0)).status).toBe(200);
    const soon = await post(env, beat({ done: 130 }), T0 + 30_000);
    expect(soon.status).toBe(429);
    expect(Number(soon.headers.get('retry-after'))).toBe(30);
    expect(JSON.parse(row(env).data).done).toBe(120);
    expect((await post(env, beat({ done: 140 }), T0 + 60_000)).status).toBe(200);
    expect(JSON.parse(row(env).data).done).toBe(140);
  });

  it('lets a change of status through sooner, so a quick stop still says so', async () => {
    await post(env, beat(), T0);
    expect((await post(env, beat({ status: 'stopped' }), T0 + 1000)).status).toBe(429);
    expect((await post(env, beat({ status: 'stopped' }), T0 + 3000)).status).toBe(200);
    expect(JSON.parse(row(env).data).status).toBe('stopped');
    // ...but the same status again waits the minute.
    expect((await post(env, beat({ status: 'stopped' }), T0 + 10_000)).status).toBe(429);
  });

  it('refuses bodies over 2 KB, bad keys and bad statuses', async () => {
    expect((await post(env, beat({ label: 'x'.repeat(3000) }), T0)).status).toBe(413);
    expect((await post(env, beat({ key: 'short' }), T0)).status).toBe(400);
    expect((await post(env, beat({ status: 'exploded' }), T0)).status).toBe(400);
    expect((await post(env, 'not json', T0)).status).toBe(400);
    expect((await get(env, 'short')).status).toBe(400);
    expect((await get(env, 'ZZZZZZZZZZZZZZZZZZZZZZZZ')).status).toBe(404);
  });

  it('ignores a topic that is not a valid ntfy topic', async () => {
    await post(env, { ...beat(), notify: 'not a topic!' }, T0);
    expect(row(env).notify).toBeNull();
  });

  it('refuses a new key once the table is full, but still updates a known one', async () => {
    const ins = env.WATCH._db.prepare(
      'INSERT INTO watch (key, data, updated, notify, alerted) VALUES (?, ?, ?, NULL, 0)'
    );
    for (let i = 0; i < MAX_ROWS; i++) ins.run(`k${String(i).padStart(23, '0')}`, '{}', T0);
    expect((await post(env, beat(), T0)).status).toBe(503);
    expect((await post(env, beat({ key: `k${'0'.repeat(23)}` }), T0 + 60_000)).status).toBe(200);
  });

  it('is routed by the worker, with CORS', async () => {
    const res = await worker.fetch(
      new Request('https://c.example/watch', { method: 'POST', body: JSON.stringify(beat({ updatedAt: Date.now() })) }),
      env,
      {}
    );
    expect(res.status).toBe(200);
    const opt = await worker.fetch(new Request('https://c.example/watch', { method: 'OPTIONS' }), env, {});
    expect(opt.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('says so when D1 is not bound', async () => {
    expect((await post({}, beat(), T0)).status).toBe(503);
  });
});

describe('cleanHeartbeat', () => {
  it('clamps numbers and drops junk', () => {
    const h = cleanHeartbeat(beat({ done: -5, total: 'x', workers: 1e9, pct: 250, bestSoFar: { te: 'no' } }));
    expect(h.done).toBe(0);
    expect(h.total).toBeNull();
    expect(h.workers).toBe(0);
    expect(h).not.toHaveProperty('pct');
    expect(h.bestSoFar).toBeNull();
  });
});

describe('the cron', () => {
  const ntfy = () => vi.fn(async () => new Response('{}'));

  it('sends one stale note for a running run with a topic, and only once', async () => {
    await post(env, { ...beat(), notify: 'aaap-topic1' }, T0);
    const f = ntfy();
    // 10 minutes: not stale yet.
    expect((await watchCron(env, T0 + 10 * 60_000, f)).alerted).toBe(0);
    // 16 minutes: one note.
    expect((await watchCron(env, T0 + 16 * 60_000, f, { pageUrl: 'https://site.example/watch.html' })).alerted).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://ntfy.sh');
    const sent = JSON.parse(init.body);
    expect(sent.topic).toBe('aaap-topic1');
    expect(sent.message).toMatch(/stopped reporting 15 min ago/);
    expect(sent.click).toBe(`https://site.example/watch.html?k=${KEY}`);
    // 21 and 60 minutes: nothing more.
    await watchCron(env, T0 + 21 * 60_000, f);
    await watchCron(env, T0 + 60 * 60_000, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(row(env).alerted).toBe(1);
  });

  it('a fresh heartbeat re-arms it for the next stall', async () => {
    await post(env, { ...beat(), notify: 'aaap-topic1' }, T0);
    const f = ntfy();
    await watchCron(env, T0 + 16 * 60_000, f);
    await post(env, { ...beat(), notify: 'aaap-topic1' }, T0 + 20 * 60_000);
    expect(row(env).alerted).toBe(0);
    await watchCron(env, T0 + 40 * 60_000, f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('says nothing for a finished run, or one without a topic', async () => {
    await post(env, { ...beat({ status: 'finished' }), notify: 'aaap-topic1' }, T0);
    await post(env, beat({ key: 'NoTopicNoTopicNoTopic123' }), T0);
    const f = ntfy();
    expect((await watchCron(env, T0 + 30 * 60_000, f)).alerted).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it('still marks it sent when ntfy fails, so it is not retried every 5 minutes', async () => {
    await post(env, { ...beat(), notify: 'aaap-topic1' }, T0);
    const f = vi.fn(async () => {
      throw new Error('down');
    });
    await watchCron(env, T0 + 16 * 60_000, f);
    await watchCron(env, T0 + 21 * 60_000, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('deletes rows not updated in 7 days', async () => {
    await post(env, beat(), T0);
    await post(env, beat({ key: 'NewerNewerNewerNewer1234' }), T0 + 2 * 86_400_000);
    const r = await watchCron(env, T0 + WATCH_KEEP_MS + 1000, ntfy());
    expect(r.deleted).toBe(1);
    expect(row(env)).toBeUndefined();
    expect(row(env, 'NewerNewerNewerNewer1234')).toBeTruthy();
  });

  it('runs from the worker scheduled handler', async () => {
    await post(env, beat(), T0);
    const waits = [];
    await worker.scheduled({ scheduledTime: T0 + WATCH_KEEP_MS + 60_000 }, env, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    expect(row(env)).toBeUndefined();
  });
});
