/**
 * "Which build is in use" (buildcount.js): POST /v counts one build per UTC day, refuses anything that is not one
 * build id, keeps no address, caps the builds a day, and the cron deletes rows past 30 days. D1 is Node's in-memory
 * SQLite behind D1's prepare/bind/first/all/run shape, as in follow.spec.js, with the real migration files applied.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { BUILD_DAY_CAP, BUILD_ID, BUILD_KEEP_DAYS, buildCountSweep, handleBuildCount, utcDay } from './buildcount.js';

const MIGRATIONS = readdirSync(new URL('./migrations/', import.meta.url))
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));

function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) db.exec(m);
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

const T0 = Date.UTC(2026, 9, 24, 15, 0, 0);
const DAY = 86_400_000;
const B = 'index-BGv8tSVu';
const IP = '203.0.113.7';

let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});

const send = (body, now = T0, init = {}) =>
  handleBuildCount(
    new Request('https://c.example/v', {
      method: 'POST',
      body,
      ...init,
      headers: { 'cf-connecting-ip': IP, ...(init.headers ?? {}) },
    }),
    env,
    now
  );
const rows = () =>
  env.WATCH._db
    .prepare('SELECT * FROM build_counts ORDER BY day, build')
    .all()
    .map(r => ({ ...r }));

describe('POST /v: what a build id is', () => {
  it('takes the hashed entry names the build writes', () => {
    for (const b of ['index-BGv8tSVu', 'explorer-Dk_3-a9Q', 'watch-a1B2c3', 'index-abcdefghijklmnop'])
      expect(BUILD_ID.test(b)).toBe(true);
  });

  it('refuses anything else: other characters, paths, too long, too short, a player ID, JSON', async () => {
    const bad = [
      '',
      'index',
      'index-',
      'index-abc',
      'Index-BGv8tSVu',
      'assets/index-BGv8tSVu.js',
      'index-BGv8tSVu.js',
      'index-BGv8 tSVu',
      'index-abcdefghijklmnopq',
      'abcdefghijklmnopq-BGv8tSVu',
      'index-EI1234567890123456',
      'EI1234567890123456',
      '{"b":"index-BGv8tSVu"}',
      'index-BGv8tSVu\nindex-BGv8tSVu',
      'index-BGv8tSVu&p=EI1234567890123456',
      'index-<script>',
    ];
    for (const b of bad) {
      const res = await send(b);
      expect(res.status, b).toBe(400);
    }
    expect(rows()).toEqual([]);
  });

  it('refuses a body over 64 bytes with 413, by its declared length or its real one', async () => {
    expect((await send('x'.repeat(65))).status).toBe(413);
    expect((await send(B, T0, { headers: { 'content-length': '500' } })).status).toBe(413);
    expect(rows()).toEqual([]);
  });

  it('answers 405 to anything but POST, and the worker routes /v here with CORS open', async () => {
    const get = await worker.fetch(new Request(`https://c.example/v?b=${B}`), env, {});
    expect(get.status).toBe(405);
    const post = await worker.fetch(new Request('https://c.example/v', { method: 'POST', body: B }), env, {});
    expect(post.status).toBe(200);
    expect(post.headers.get('access-control-allow-origin')).toBe('*');
    expect(await post.json()).toEqual({ ok: true, counted: true });
    const pre = await worker.fetch(new Request('https://c.example/v', { method: 'OPTIONS' }), env, {});
    expect(pre.status).toBe(200);
  });

  it('a collector with no D1 says so (503) and stores nothing', async () => {
    env = {};
    expect((await send(B)).status).toBe(503);
  });
});

describe('POST /v: counting', () => {
  it('keeps only (UTC day, build, n): one row per build a day, counted up', async () => {
    for (let i = 0; i < 3; i++) expect(await (await send(B)).json()).toEqual({ ok: true, counted: true });
    await send('explorer-Dk_3-a9Q');
    await send(` ${B}\n`); // surrounding white space is not part of the id
    expect(rows()).toEqual([
      { day: '2026-10-24', build: 'explorer-Dk_3-a9Q', n: 1 },
      { day: '2026-10-24', build: B, n: 4 },
    ]);
  });

  it('the day is the UTC day: just before and after midnight UTC are two rows', async () => {
    const midnight = Date.UTC(2026, 9, 25);
    await send(B, midnight - 1);
    await send(B, midnight);
    expect(rows().map(r => [r.day, r.n])).toEqual([
      ['2026-10-24', 1],
      ['2026-10-25', 1],
    ]);
    expect(utcDay(midnight - 1)).toBe('2026-10-24');
  });

  it('stores no address, no header and no time: the table has only day, build and n', async () => {
    await send(B, T0, { headers: { 'user-agent': 'Mozilla/5.0 test', referer: 'https://egg.example/some/path' } });
    const cols = env.WATCH._db
      .prepare('PRAGMA table_info(build_counts)')
      .all()
      .map(c => c.name);
    expect(cols).toEqual(['day', 'build', 'n']);
    const dump = JSON.stringify(env.WATCH._db.prepare('SELECT * FROM build_counts').all());
    expect(dump).not.toContain(IP);
    expect(dump).not.toContain('Mozilla');
    expect(dump).not.toContain('some/path');
    expect(dump).not.toContain(String(T0));
    // Nothing else in the database either.
    for (const t of env.WATCH._db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all())
      expect(JSON.stringify(env.WATCH._db.prepare(`SELECT * FROM ${t.name}`).all())).not.toContain(IP);
  });

  it(`counts at most ${BUILD_DAY_CAP} different builds a day; ones already counted still count, and the next day starts over`, async () => {
    const id = i => `index-${String(i).padStart(8, '0')}`;
    for (let i = 0; i < BUILD_DAY_CAP; i++) expect((await (await send(id(i))).json()).counted).toBe(true);
    expect(await (await send(id(BUILD_DAY_CAP))).json()).toEqual({ ok: true, counted: false });
    expect(await (await send(id(7))).json()).toEqual({ ok: true, counted: true });
    const today = env.WATCH._db
      .prepare('SELECT COUNT(*) AS c, SUM(n) AS s FROM build_counts WHERE day = ?')
      .get('2026-10-24');
    expect({ ...today }).toEqual({ c: BUILD_DAY_CAP, s: BUILD_DAY_CAP + 1 });
    expect((await (await send(id(BUILD_DAY_CAP), T0 + DAY)).json()).counted).toBe(true);
  });
});

describe('POST /v: the per-address edge limit (BUILD_LIMIT)', () => {
  const limiter = max => {
    const seen = new Map();
    return {
      keys: seen,
      async limit({ key }) {
        seen.set(key, (seen.get(key) ?? 0) + 1);
        return { success: seen.get(key) <= max };
      },
    };
  };

  it('past the limit: 429 with retry-after, nothing counted; the address is only the binding key', async () => {
    env.BUILD_LIMIT = limiter(2);
    expect((await send(B)).status).toBe(200);
    expect((await send(B)).status).toBe(200);
    const slow = await send(B);
    expect(slow.status).toBe(429);
    expect(slow.headers.get('retry-after')).toBe('60');
    expect(rows()).toEqual([{ day: '2026-10-24', build: B, n: 2 }]);
    expect([...env.BUILD_LIMIT.keys.keys()]).toEqual([`v|${IP}`]);
  });

  it('is checked before the body is read, so a flood of junk is refused at the edge too', async () => {
    env.BUILD_LIMIT = limiter(0);
    expect((await send('not a build')).status).toBe(429);
  });

  it('a missing or failing binding means no limit, never an outage', async () => {
    env.BUILD_LIMIT = {
      limit: async () => {
        throw new Error('down');
      },
    };
    expect((await send(B)).status).toBe(200);
    delete env.BUILD_LIMIT;
    expect((await send(B)).status).toBe(200);
  });

  it('wrangler.toml declares BUILD_LIMIT on its own namespace', () => {
    const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
    const block = toml.slice(toml.indexOf('name = "BUILD_LIMIT"'));
    expect(block).toMatch(/^name = "BUILD_LIMIT"\nnamespace_id = "1106"/);
    expect(toml.match(/namespace_id = "1106"/g)).toHaveLength(1);
  });
});

describe(`the ${BUILD_KEEP_DAYS}-day sweep`, () => {
  it('deletes the days more than 30 days back and keeps the rest', async () => {
    for (const d of [0, 29, 30, 31, 45]) await send(B, T0 - d * DAY);
    expect(await buildCountSweep(env, T0)).toBe(2);
    expect(rows().map(r => r.day)).toEqual(['2026-09-24', '2026-09-25', '2026-10-24']);
  });

  it('runs from the cron on the hourly clean-up (minutes 0 to 4), not every 5 minutes', async () => {
    await send(B, T0 - 40 * DAY);
    const run = async at => {
      const waits = [];
      await worker.scheduled({ scheduledTime: at }, env, { waitUntil: p => waits.push(p) });
      await Promise.all(waits);
    };
    await run(T0 + 10 * 60_000);
    expect(rows()).toHaveLength(1);
    await run(T0 + 60_000);
    expect(rows()).toEqual([]);
  });

  it('is quiet without D1', async () => {
    expect(await buildCountSweep({}, T0)).toBe(0);
  });
});
