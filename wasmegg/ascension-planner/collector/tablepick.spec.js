/**
 * "Which table answered" ping (tablepick.js, migration 0011; Jordan 25 Nov 2026, R10.1): a page says, anonymously and
 * once a day per browser, which instant answer table it used, so the owner can see who falls back to the main table.
 * D1 is Node's in-memory SQLite with the real migrations. Placeholder ID only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { handleTablePick, isTablePickRequest, TE_EDGES, TABLEPICK_KINDS } from './tablepick.js';
import { makeD1 } from './d1shim.js';
import worker from './worker.js';

const NOW = Date.UTC(2026, 10, 25, 18, 0, 0);
const DAY = 86_400_000;
let env;
beforeEach(() => {
  env = { WATCH: makeD1(), CSV_UPLOAD_KEY: 'k', TABLEPICK_ADMIN_TOKEN: 'owner-secret' };
});

const ping = (over = {}) => ({ kind: 'maxed', delivery: 'T4E-T4L-T4L', noTable: true, te: 125, build: '2026-11-25T10:00:00.000Z', ...over });
const post = (body, { ip = '1.1.1.1', now = NOW, raw, e = env } = {}) =>
  handleTablePick(
    new Request('https://c.example/tablepick', { method: 'POST', headers: { 'content-type': 'text/plain', 'cf-connecting-ip': ip }, body: raw ?? JSON.stringify(body) }),
    e,
    now
  );
const rows = () => env.WATCH._db.prepare('SELECT * FROM table_picks ORDER BY day, kind, answered, own, te').all();
const report = (query = '', headers = { 'x-admin-token': 'owner-secret' }, now = NOW) =>
  handleTablePick(new Request(`https://c.example/tablepick/report${query}`, { headers }), env, now);

describe('the agreed shape', () => {
  it('te edges and kinds are the ones UI pins', () => {
    expect(TE_EDGES).toEqual([0, 50, 75, 100, 125, 150, 200, 250, 300, 340, 400]);
    expect(TABLEPICK_KINDS).toEqual(['own', 'gear', 'delivery', 'maxed']);
  });
  it('routes /tablepick and /tablepick/report only', () => {
    expect(isTablePickRequest(new URL('https://c.example/tablepick'))).toBe(true);
    expect(isTablePickRequest(new URL('https://c.example/tablepick/report'))).toBe(true);
    expect(isTablePickRequest(new URL('https://c.example/tablepicks'))).toBe(false);
  });
  it('the worker routes it (a 204 from POST /tablepick)', async () => {
    const res = await worker.fetch(
      new Request('https://c.example/tablepick', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(ping()) }),
      env,
      { waitUntil() {} }
    );
    expect(res.status).toBe(204);
    expect(rows()).toHaveLength(1);
  });
});

describe('a ping', () => {
  it('counts one per day on (kind, answered, own, noTable, te, build): a 204, CORS *, no row per request', async () => {
    const res = await post(ping());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    await post(ping());
    await post(ping(), { ip: '2.2.2.2' });
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ day: '2026-11-25', kind: 'maxed', answered: '', own: 'T4E-T4L-T4L', no_table: 1, te: 125, build: '2026-11-25T10:00:00.000Z', n: 3 });
  });
  it('a new day is a new row', async () => {
    await post(ping());
    await post(ping(), { now: NOW + DAY });
    expect(rows().map(r => r.day)).toEqual(['2026-11-25', '2026-11-26']);
  });
  it('a delivery answer carries the table that answered', async () => {
    await post(ping({ kind: 'delivery', answered: 'T4L-T4E-T4L', delivery: 'T4L-T4E-T4L', noTable: false, te: 150 }));
    expect(rows()[0]).toMatchObject({ kind: 'delivery', answered: 'T4L-T4E-T4L', own: 'T4L-T4E-T4L', no_table: 0, te: 150 });
  });
  it('own key and noTable are optional; unknown is stored as such', async () => {
    await post({ kind: 'own', te: 0, build: 'b1' });
    expect(rows()[0]).toMatchObject({ kind: 'own', answered: '', own: '', no_table: -1, te: 0 });
  });
  it('stores nothing else: no address, no id, no time of day', async () => {
    await post(ping());
    expect(Object.keys(rows()[0]).sort()).toEqual(['answered', 'build', 'day', 'kind', 'n', 'no_table', 'own', 'te']);
    expect(JSON.stringify(rows())).not.toMatch(/1\.1\.1\.1/);
  });
  it('drops unknown fields', async () => {
    expect((await post({ ...ping(), name: 'x', id: 'y' })).status).toBe(204);
    expect(rows()).toHaveLength(1);
  });
  it.each(TE_EDGES)('takes te %i', async te => {
    expect((await post(ping({ te }))).status).toBe(204);
  });
});

describe('a bad ping is a 400 and writes nothing', () => {
  it.each([
    ['an unknown kind', { kind: 'turbo' }],
    ['no kind', { kind: undefined }],
    ['a te not on the list', { te: 130 }],
    ['a te of 5 (width-5 band)', { te: 5 }],
    ['a negative te', { te: -1 }],
    ['a text te', { te: '125' }],
    ['no te', { te: undefined }],
    ['a delivery kind without answered', { kind: 'delivery', answered: undefined }],
    ['answered on another kind', { kind: 'maxed', answered: 'T4L-T4E-T4L' }],
    ['an answered key with a space', { kind: 'delivery', answered: 'T4L T4E' }],
    ['an answered key over 24 characters', { kind: 'delivery', answered: 'x'.repeat(25) }],
    ['an own key with a space', { delivery: 'T4E T4L' }],
    ['an own key over 24 characters', { delivery: 'x'.repeat(25) }],
    ['an empty own key', { delivery: '' }],
    ['a number as the own key', { delivery: 5 }],
    ['noTable as text', { noTable: 'yes' }],
    ['no build', { build: undefined }],
    ['a build with a space', { build: '2026 11 25' }],
  ])('%s', async (_n, over) => {
    const res = await post(ping(over));
    expect(res.status).toBe(400);
    expect((await res.json()).problems.length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(0);
  });
  it('bad JSON, a non-object, an array', async () => {
    expect((await post(null, { raw: 'not json' })).status).toBe(400);
    expect((await post(null, { raw: '[1]' })).status).toBe(400);
    expect((await post(null, { raw: 'null' })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });
  it('a player id anywhere in the body, in any case', async () => {
    expect((await post({ ...ping(), extra: 'EI9876543210987654' })).status).toBe(400);
    expect((await post(ping({ build: 'ei9876543210987654' }))).status).toBe(400);
    expect((await post(ping({ delivery: 'EI9876543210987654' }))).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });
  it('a body over 256 bytes is a 413', async () => {
    expect((await post({ ...ping(), pad: 'x'.repeat(300) })).status).toBe(413);
    expect(rows()).toHaveLength(0);
  });
  it('is a 503 without D1, a 405 for other methods', async () => {
    expect((await post(ping(), { e: {} })).status).toBe(503);
    const res = await handleTablePick(new Request('https://c.example/tablepick', { method: 'PUT', body: '{}' }), env, NOW);
    expect(res.status).toBe(405);
  });
});

describe('caps: extras are dropped with a 204, nothing written', () => {
  it('20 pings a day from one address; another address is fine; the next day resets', async () => {
    for (let i = 0; i < 20; i++) expect((await post(ping({ te: 125, build: `b${i}` }))).status).toBe(204);
    expect(rows()).toHaveLength(20);
    expect((await post(ping({ build: 'b99' }))).status).toBe(204);
    expect(rows()).toHaveLength(20);
    expect((await post(ping({ build: 'b99' }), { ip: '2.2.2.2' })).status).toBe(204);
    expect(rows()).toHaveLength(21);
    expect((await post(ping({ build: 'b100' }), { now: NOW + DAY + 1000 })).status).toBe(204);
    expect(rows()).toHaveLength(22);
  });
  it('a bad ping does not use up the address budget', async () => {
    for (let i = 0; i < 30; i++) await post(ping({ te: 130 }));
    expect((await post(ping())).status).toBe(204);
    expect(rows()).toHaveLength(1);
  });
  it('a global daily cap (TABLEPICK_PER_DAY) stops the rest', async () => {
    env.TABLEPICK_PER_DAY = '3';
    for (let i = 0; i < 5; i++) await post(ping({ build: `b${i}` }), { ip: `9.9.9.${i}` });
    expect(rows()).toHaveLength(3);
  });
  it('the edge limiter, when it says no, drops the ping', async () => {
    env.FOLLOW_LIMIT = { limit: async () => ({ success: false }) };
    expect((await post(ping())).status).toBe(204);
    expect(rows()).toHaveLength(0);
  });
});

describe('no automatic deletion (Jordan, 25 Nov 2026)', () => {
  it('there is no prune for table_picks, in the module or the cron', async () => {
    const fs = await import('node:fs');
    const mod = fs.readFileSync(new URL('./tablepick.js', import.meta.url), 'utf8');
    const w = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
    expect(mod).not.toMatch(/DELETE FROM table_picks/i);
    expect(w).not.toMatch(/pruneTablePicks|DELETE FROM table_picks/i);
    expect(fs.readFileSync(new URL('./migrations/0011_table_picks.sql', import.meta.url), 'utf8')).toMatch(/no automatic deletion/i);
  });
});

describe('the report (owner only)', () => {
  const seed = async (n, over, now = NOW) => {
    for (let i = 0; i < n; i++) await post(ping(over), { ip: `10.0.${Math.floor(i / 15)}.${i % 15}`, now });
  };
  it('404 without the secret, 403 with a wrong or missing token, 405 for POST', async () => {
    delete env.TABLEPICK_ADMIN_TOKEN;
    expect((await report()).status).toBe(404);
    env.TABLEPICK_ADMIN_TOKEN = 'owner-secret';
    expect((await report('', {})).status).toBe(403);
    expect((await report('', { 'x-admin-token': 'nope' })).status).toBe(403);
    const res = await handleTablePick(new Request('https://c.example/tablepick/report', { method: 'POST', headers: { 'x-admin-token': 'owner-secret' }, body: '{}' }), env, NOW);
    expect(res.status).toBe(405);
  });
  it('falls back to RUNS_ADMIN_TOKEN when the table token is not set', async () => {
    delete env.TABLEPICK_ADMIN_TOKEN;
    env.RUNS_ADMIN_TOKEN = 'runs-secret';
    expect((await report('', { 'x-admin-token': 'runs-secret' })).status).toBe(200);
    expect((await report('', { 'x-admin-token': 'owner-secret' })).status).toBe(403);
  });
  it('counts by kind, and who fell back to the main table by delivery key and band (cells under 3 hidden)', async () => {
    await seed(4, ping({ te: 125, delivery: 'T4E-T4L-T4L', noTable: true }));
    await seed(4, ping({ te: 100, delivery: 'T4E-T4L-T4L', noTable: true, build: 'b2' }));
    await seed(2, ping({ te: 200, delivery: 'T3E-T4R-T4E', noTable: true }));
    await seed(3, ping({ kind: 'delivery', answered: 'T4L-T4E-T4L', delivery: 'T4L-T4E-T4L', noTable: false, te: 200 }));
    await seed(1, ping({ kind: 'own', delivery: undefined, noTable: undefined, te: 50 }));
    const res = await report();
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.total).toBe(14);
    expect(b.kinds).toEqual({ own: 1, gear: 0, delivery: 3, maxed: 10 });
    // 100-124 and 125-149 roll up into the 75-149 band: 8 pings on one key
    expect(b.fallback).toEqual([{ own: 'T4E-T4L-T4L', band: '75-149', noTable: 'yes', n: 8 }]);
    expect(b.hiddenCells).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(b)).not.toMatch(/T3E-T4R-T4E/);
  });
  it('never shows a day, a build or an address', async () => {
    await seed(5, ping());
    const text = JSON.stringify(await (await report()).json());
    expect(text).not.toMatch(/2026-11-25|build|2026-11-25T10|1\.1\.1\.1/);
  });
  it('days=N limits the window; days=all takes everything', async () => {
    await seed(3, ping(), NOW - 10 * DAY);
    await seed(3, ping({ te: 200 }), NOW);
    expect((await (await report('?days=5')).json()).total).toBe(3);
    expect((await (await report('?days=30')).json()).total).toBe(6);
    expect((await (await report('?days=all')).json()).total).toBe(6);
    expect((await report('?days=abc')).status).toBe(400);
  });
});
