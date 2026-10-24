/**
 * "Watch this run from your phone": the collector's /watch endpoints and its cron, end to end.
 *
 * D1 is faked with Node's own in-memory SQLite (node:sqlite) behind D1's prepare/bind/first/all/run
 * shape, so the real SQL -- the upsert that is also the rate limit, json_extract/json_set, the
 * migration file itself -- runs as written. No wrangler, no network, no account.
 *
 * The collector only ever sees `{ id, iv, ct, status }`: the ciphertext here is opaque test bytes,
 * and the planner's own specs (src/search/watchLink.spec.ts) check the sealing itself.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { handleWatch, MAX_ROWS, readPost, watchCron, WATCH_KEEP_MS } from './watch.js';

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

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const ID2 = 'ZyXwVuTsRqPoNmLkJiHgFe';
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);
const IV = 'AAAAAAAAAAAAAAAA';
const CT = 'c2VhbGVkLWhlYXJ0YmVhdC1ieXRlcy1ub2JvZHktY2FuLXJlYWQ';

const beat = (over = {}) => ({ id: ID, iv: IV, ct: CT, status: 'running', ...over });

const post = (env, body, now) =>
  handleWatch(
    new Request('https://c.example/watch', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    now
  );
const get = (env, id, now = T0) => handleWatch(new Request(`https://c.example/watch?id=${id}`), env, now);
const row = (env, id = ID) => env.WATCH._db.prepare('SELECT * FROM watch WHERE key = ?').get(id);

let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});

describe('POST /watch and GET /watch', () => {
  it('stores the sealed heartbeat and serves it back, without the ntfy topic', async () => {
    const res = await post(env, beat({ notify: 'aaap-topic1' }), T0);
    expect(res.status).toBe(200);
    expect(row(env).notify).toBe('aaap-topic1');
    const got = await get(env, ID, T0 + 5000);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({ iv: IV, ct: CT, status: 'running', updated: T0, now: T0 + 5000 });
    expect(got.headers.get('access-control-allow-origin')).toBe('*');
    expect(got.headers.get('cache-control')).toBe('no-store');
  });

  it('stores only id, iv, ciphertext and status: anything else in the body is dropped', async () => {
    await post(env, beat({ te: 247, route: [1, 2], label: 'mine', nickname: 'someone', secret: 'x' }), T0);
    expect(JSON.parse(row(env).data)).toEqual({ iv: IV, ct: CT, status: 'running' });
  });

  it('refuses a second write within a minute, and takes one after it', async () => {
    expect((await post(env, beat(), T0)).status).toBe(200);
    const soon = await post(env, beat({ ct: CT + 'AA' }), T0 + 30_000);
    expect(soon.status).toBe(429);
    expect(Number(soon.headers.get('retry-after'))).toBe(30);
    expect((await soon.json()).retryAfter).toBe(30);
    expect(JSON.parse(row(env).data).ct).toBe(CT);
    expect((await post(env, beat({ ct: CT + 'BB' }), T0 + 60_000)).status).toBe(200);
    expect(JSON.parse(row(env).data).ct).toBe(CT + 'BB');
  });

  it('lets a change of status through sooner, so a quick stop still says so', async () => {
    await post(env, beat(), T0);
    expect((await post(env, beat({ status: 'stopped' }), T0 + 1000)).status).toBe(429);
    expect((await post(env, beat({ status: 'stopped' }), T0 + 3000)).status).toBe(200);
    expect(JSON.parse(row(env).data).status).toBe('stopped');
    // ...but the same status again waits the minute.
    expect((await post(env, beat({ status: 'stopped' }), T0 + 10_000)).status).toBe(429);
  });

  it('a status alone (the page closing) changes the status and keeps the ciphertext', async () => {
    await post(env, beat({ notify: 'aaap-topic1' }), T0);
    const res = await post(env, { id: ID, status: 'stopped', notify: 'aaap-topic1' }, T0 + 5000);
    expect(res.status).toBe(200);
    expect(JSON.parse(row(env).data)).toEqual({ iv: IV, ct: CT, status: 'stopped' });
    expect(row(env).updated).toBe(T0 + 5000);
    // For an id nobody posted: nothing to change.
    expect((await post(env, { id: ID2, status: 'stopped' }, T0)).status).toBe(404);
  });

  it('refuses bodies over 2 KB, bad ids, half-sealed bodies and bad statuses', async () => {
    expect((await post(env, beat({ ct: 'A'.repeat(3000) }), T0)).status).toBe(413);
    expect((await post(env, beat({ id: 'short' }), T0)).status).toBe(400);
    expect((await post(env, beat({ status: 'exploded' }), T0)).status).toBe(400);
    expect((await post(env, beat({ iv: undefined }), T0)).status).toBe(400);
    expect((await post(env, beat({ iv: 'tooshort' }), T0)).status).toBe(400);
    expect((await post(env, beat({ ct: 'not base64url!' }), T0)).status).toBe(400);
    expect((await post(env, 'not json', T0)).status).toBe(400);
    expect((await get(env, 'short')).status).toBe(400);
    expect((await get(env, ID2)).status).toBe(404);
  });

  it('ignores a topic that is not a valid ntfy topic', async () => {
    await post(env, beat({ notify: 'not a topic!' }), T0);
    expect(row(env).notify).toBeNull();
  });

  it('refuses a new id once the table is full, but still updates a known one', async () => {
    const ins = env.WATCH._db.prepare(
      'INSERT INTO watch (key, data, updated, notify, alerted) VALUES (?, ?, ?, NULL, 0)'
    );
    for (let i = 0; i < MAX_ROWS; i++) ins.run(`k${String(i).padStart(21, '0')}`, '{}', T0);
    expect((await post(env, beat(), T0)).status).toBe(503);
    expect((await post(env, beat({ id: `k${'0'.repeat(21)}` }), T0 + 60_000)).status).toBe(200);
  });

  it('is routed by the worker, with CORS', async () => {
    const res = await worker.fetch(
      new Request('https://c.example/watch', { method: 'POST', body: JSON.stringify(beat()) }),
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

describe('readPost', () => {
  it('keeps the four fields and nothing else', () => {
    expect(readPost(beat({ extra: 1 }))).toEqual({
      id: ID,
      status: 'running',
      notify: null,
      sealed: { iv: IV, ct: CT },
    });
    expect(readPost({ id: ID, status: 'failed' })).toEqual({ id: ID, status: 'failed', notify: null, sealed: null });
    expect(readPost([])).toBeNull();
  });
});

describe('the cron', () => {
  const ntfy = () => vi.fn(async () => new Response('{}'));

  it('sends one stale note for a running run with a topic, and only once', async () => {
    await post(env, beat({ notify: 'aaap-topic1' }), T0);
    const f = ntfy();
    // 10 minutes: not stale yet.
    expect((await watchCron(env, T0 + 10 * 60_000, f)).alerted).toBe(0);
    // 16 minutes: one note.
    expect((await watchCron(env, T0 + 16 * 60_000, f)).alerted).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://ntfy.sh');
    const sent = JSON.parse(init.body);
    expect(sent.topic).toBe('aaap-topic1');
    expect(sent.message).toMatch(/stopped reporting 15 min ago/);
    // No link (the collector has no secret) and nothing from the run.
    expect(sent).not.toHaveProperty('click');
    expect(init.body).not.toContain(ID);
    // 21 and 60 minutes: nothing more.
    await watchCron(env, T0 + 21 * 60_000, f);
    await watchCron(env, T0 + 60 * 60_000, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(row(env).alerted).toBe(1);
  });

  it('a fresh heartbeat re-arms it for the next stall', async () => {
    await post(env, beat({ notify: 'aaap-topic1' }), T0);
    const f = ntfy();
    await watchCron(env, T0 + 16 * 60_000, f);
    await post(env, beat({ notify: 'aaap-topic1' }), T0 + 20 * 60_000);
    expect(row(env).alerted).toBe(0);
    await watchCron(env, T0 + 40 * 60_000, f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('says nothing for a finished or closed run, or one without a topic', async () => {
    await post(env, beat({ status: 'finished', notify: 'aaap-topic1' }), T0);
    await post(env, beat({ id: ID2 }), T0);
    const f = ntfy();
    expect((await watchCron(env, T0 + 30 * 60_000, f)).alerted).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it('a page closed with a status alone is not stale', async () => {
    await post(env, beat({ notify: 'aaap-topic1' }), T0);
    await post(env, { id: ID, status: 'stopped', notify: 'aaap-topic1' }, T0 + 5000);
    const f = ntfy();
    expect((await watchCron(env, T0 + 30 * 60_000, f)).alerted).toBe(0);
  });

  it('still marks it sent when ntfy fails, so it is not retried every 5 minutes', async () => {
    await post(env, beat({ notify: 'aaap-topic1' }), T0);
    const f = vi.fn(async () => {
      throw new Error('down');
    });
    await watchCron(env, T0 + 16 * 60_000, f);
    await watchCron(env, T0 + 21 * 60_000, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('deletes rows not updated in 7 days', async () => {
    await post(env, beat(), T0);
    await post(env, beat({ id: ID2 }), T0 + 2 * 86_400_000);
    const r = await watchCron(env, T0 + WATCH_KEEP_MS + 1000, ntfy());
    expect(r.deleted).toBe(1);
    expect(row(env)).toBeUndefined();
    expect(row(env, ID2)).toBeTruthy();
  });

  it('runs from the worker scheduled handler', async () => {
    await post(env, beat(), T0);
    const waits = [];
    await worker.scheduled({ scheduledTime: T0 + WATCH_KEEP_MS + 60_000 }, env, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    expect(row(env)).toBeUndefined();
  });
});
