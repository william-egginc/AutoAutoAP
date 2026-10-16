/**
 * The collector's garbage collector (worker.js "quarantine" and "the sweep"): a well-formed send that
 * cannot be true is stored privately and kept off every board, its sender told who to contact; and the
 * hourly cron deletes keys nothing will read again. Every rule is tested both ways. Plain in-memory KV,
 * no network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

/** KV with TTLs (list shows `expiration` for a key written with one, as real KV does), metadata, and
 *  paging (`pageSize`, so a cursor can be tested without a thousand keys). */
function makeKV(pageSize = 1000) {
  const m = new Map();
  const meta = new Map();
  const exp = new Map();
  const counts = { get: 0, put: 0, delete: 0, list: 0 };
  return {
    _m: m,
    _exp: exp,
    counts,
    async get(k) {
      counts.get++;
      return m.has(k) ? m.get(k) : null;
    },
    async getWithMetadata(k) {
      counts.get++;
      return { value: m.has(k) ? m.get(k) : null, metadata: meta.get(k) ?? null };
    },
    async put(k, v, opts) {
      counts.put++;
      m.set(k, v);
      if (opts?.metadata) meta.set(k, opts.metadata);
      else meta.delete(k);
      if (opts?.expirationTtl) exp.set(k, Math.floor(Date.now() / 1000) + opts.expirationTtl);
      else exp.delete(k);
    },
    async delete(k) {
      counts.delete++;
      m.delete(k);
      meta.delete(k);
      exp.delete(k);
    },
    async list({ prefix, limit, cursor }) {
      counts.list++;
      const all = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      // Like KV's, a cursor survives deletes: it is the last key returned, and the next page starts after it.
      const from = cursor ? all.findIndex(k => k > cursor) : 0;
      const n = Math.min(limit ?? 1000, pageSize);
      const page = all.slice(from, from + n);
      const done = from + n >= all.length;
      return {
        keys: page.map(name => ({
          name,
          ...(meta.has(name) ? { metadata: meta.get(name) } : {}),
          ...(exp.has(name) ? { expiration: exp.get(name) } : {}),
        })),
        list_complete: done,
        ...(done ? {} : { cursor: page[page.length - 1] }),
      };
    },
  };
}

let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
});

const send = (body, { quarantine = true, ip = '1.1.1.1', token } = {}) =>
  worker.fetch(
    new Request(`https://collector.test/submit${quarantine ? '?quarantine=1' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(token ? { 'x-owner-token': token } : {}) },
      body: JSON.stringify(body),
    }),
    env
  );
const get = (path, token) =>
  worker.fetch(new Request('https://collector.test' + path, { headers: token ? { 'x-owner-token': token } : {} }), env);
const keysOf = prefix => [...env.SUBMISSIONS._m.keys()].filter(k => k.startsWith(prefix));
const TOKEN = 'a'.repeat(32);

const DAY = 86400000;
const START = '2026-09-25T13:12:00.000Z';
const endAfter = days => new Date(Date.parse(START) + days * DAY).toISOString();
const LEGS = [
  { te: 195, strategy: 'continue', days: 70.2, peakDeliveryQph: 12.5 },
  { te: 219, strategy: '2-sale-tier13', days: 60.1, peakDeliveryQph: 13.1 },
  { te: 248, strategy: '2-sale-tier13', days: 62.3, peakDeliveryQph: 13.9 },
  { te: 286, strategy: '2-sale-tier13', days: 70.0, peakDeliveryQph: 14.6 },
  { te: 327, strategy: '2-sale-tier13', days: 75.0, peakDeliveryQph: 15.2 },
  { te: 490, strategy: '1-sale-tier13', days: 404.365, peakDeliveryQph: 15.9 },
];
/** A genuine-looking send: every field a rule reads, all agreeing with each other. */
const GOOD = {
  schema: 7,
  chain: [195, 219, 248, 286, 327, 490],
  ascensions: 6,
  currentTE: 185,
  backupTE: 185,
  finalTE: 490,
  durationDays: 741.965,
  startLocal: '2026-09-25 07:12',
  timezone: 'America/Denver',
  startUtc: START,
  endUtc: endAfter(741.965),
  backupAgeHours: 1.5,
  effort: 'balanced',
  legs: LEGS,
};
const withLeg = (i, over) => ({ ...GOOD, legs: LEGS.map((l, k) => (k === i ? { ...l, ...over } : l)) });

async function reasonsOf(body) {
  const res = await send(body);
  const j = await res.json();
  expect(res.status).toBe(200);
  return j.quarantined ? j.reasons : [];
}

describe('the backdated-start reason tells the player what is wrong', () => {
  it('says how early the plan starts and the two TEs', async () => {
    const res = await send({ ...GOOD, backupAgeHours: -5, currentTE: 184, backupTE: 185 });
    const j = await res.json();
    expect(j.reasons).toEqual(['backdated-start']);
    expect(j.reasonText).toBe('it starts 5 hours before the save it was made from, and from TE 184 when that save already had TE 185');
  });
});

describe('quarantine rules, each both ways', () => {
  it('a genuine send passes every rule and goes on the board', async () => {
    const res = await send(GOOD);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true });
    expect(j.quarantined).toBeUndefined();
    expect(keysOf('sub:')).toHaveLength(1);
    expect(keysOf('quar:')).toHaveLength(0);
  });

  const cases = [
    // [code, a send that trips it, a near miss that must not]
    ['contradicts-itself', { ...GOOD, flags: ['contradicts-itself'] }, { ...GOOD, flags: ['integrity-stall'] }],
    ['target-not-last', { ...GOOD, finalTE: 489 }, GOOD],
    ['ascensions-disagree', { ...GOOD, ascensions: 5 }, { ...GOOD, ascensions: undefined }],
    ['first-checkpoint-reached', { ...GOOD, currentTE: 195, backupTE: 195 }, { ...GOOD, currentTE: 194, backupTE: 194 }],
    ['legs-disagree', withLeg(3, { te: 280 }), { ...GOOD, legs: [...LEGS.slice(0, 2), { ...LEGS[2], te: 240, days: 30 }, { ...LEGS[2], days: 32.3 }, ...LEGS.slice(3)] }],
    ['leg-not-positive', withLeg(1, { days: 0 }), { ...GOOD, legs: LEGS.map((l, k) => (k === 0 ? { ...l, days: 0.11 } : k === 5 ? { ...l, days: l.days + 70.09 } : l)) }],
    // A first leg that is a continue may be 0 days (the run under way had already passed its first
    // checkpoint when the plan starts); a negative one, or a 0 on any other first leg, may not.
    ['leg-not-positive', { ...GOOD, legs: LEGS.map((l, k) => (k === 0 ? { ...l, days: -0.5 } : k === 5 ? { ...l, days: l.days + 70.7 } : l)) }, { ...GOOD, legs: LEGS.map((l, k) => (k === 0 ? { ...l, days: 0 } : k === 5 ? { ...l, days: l.days + 70.2 } : l)) }],
    ['leg-not-positive', { ...GOOD, legs: LEGS.map((l, k) => (k === 0 ? { ...l, strategy: '1-sale', days: 0 } : k === 5 ? { ...l, days: l.days + 70.2 } : l)) }, { ...GOOD, legs: LEGS.map((l, k) => (k === 0 ? { ...l, strategy: '1-sale', days: 3.5 } : k === 5 ? { ...l, days: l.days + 66.7 } : l)) }],
    // A total past the legs by more than the time off and the slack; and one the time off explains.
    ['legs-sum', { ...GOOD, durationDays: 760, endUtc: endAfter(760) }, { ...GOOD, durationDays: 750, endUtc: endAfter(750), timeOff: [{ from: '2027-07-14', to: '2027-07-19' }] }],
    // 24 TE in 4 days on a fresh leg; a continue that quick is fine (it finishes a run under way).
    ['impossible-te-jump', { ...GOOD, legs: LEGS.map((l, k) => (k === 1 ? { ...l, days: 4 } : k === 5 ? { ...l, days: 460.465 } : l)) }, { ...GOOD, legs: LEGS.map((l, k) => (k === 0 ? { ...l, days: 1.5 } : k === 5 ? { ...l, days: l.days + 68.7 } : l)) }],
    ['too-fast', { schema: 7, chain: [195, 490], currentTE: 185, finalTE: 490, durationDays: 150 }, { schema: 7, chain: [195, 490], currentTE: 185, finalTE: 490, durationDays: 160 }],
    ['no-delivery', { ...GOOD, legs: LEGS.map(l => ({ ...l, peakDeliveryQph: 0 })) }, withLeg(0, { peakDeliveryQph: 0 })],
    ['delivery-collapse', withLeg(3, { peakDeliveryQph: 6.9 }), withLeg(3, { peakDeliveryQph: 7.0 })],
    ['finish-before-start', { ...GOOD, endUtc: '2026-09-24T00:00:00.000Z' }, GOOD],
    ['times-disagree', { ...GOOD, endUtc: endAfter(743.5) }, { ...GOOD, endUtc: endAfter(742.9) }],
    // Backdated both ways: a start before the save AND a TE below the save's. Either alone is fine (a
    // what-if start; a lower TE is the app's own contradicts-itself check).
    ['backdated-start', { ...GOOD, backupAgeHours: -5, currentTE: 184, backupTE: 185 }, { ...GOOD, backupAgeHours: -5, currentTE: 185, backupTE: 185 }],
    ['backdated-start', { ...GOOD, backupAgeHours: -1.1, currentTE: 184, backupTE: 185 }, { ...GOOD, backupAgeHours: -0.9, currentTE: 184, backupTE: 185 }],
    ['backdated-start', { ...GOOD, backupAgeHours: -80, currentTE: 180, backupTE: 185 }, { ...GOOD, backupAgeHours: 5, currentTE: 184, backupTE: 185 }],
    ['save-age', { ...GOOD, backupAgeHours: 2161 }, { ...GOOD, backupAgeHours: 2159 }],
    ['save-age', { ...GOOD, backupAgeHours: -2161 }, { ...GOOD, backupAgeHours: -168.1 }],
    // A save age past a year is dropped from the row by the whitelist, but still quarantines.
    ['save-age', { ...GOOD, backupAgeHours: 9000 }, { ...GOOD, backupAgeHours: 'a while' }],
  ];
  for (const [code, bad, near] of cases) {
    it(`${code}: caught, and its near miss is not`, async () => {
      expect(await reasonsOf(bad)).toContain(code);
      env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
      expect(await reasonsOf(near)).toEqual([]);
    });
  }

  it('start-out-of-range: a start a year ahead of the send, not one in the past (an old file uploaded late)', async () => {
    const ahead = Date.now() + 366 * DAY;
    const at = days => new Date(ahead + days * DAY).toISOString();
    expect(await reasonsOf({ ...GOOD, startUtc: at(0), endUtc: at(741.965) })).toContain('start-out-of-range');
    const soon = Date.now() + 30 * DAY;
    const s = days => new Date(soon + days * DAY).toISOString();
    expect(await reasonsOf({ ...GOOD, startUtc: s(0), endUtc: s(741.965) })).toEqual([]);
    expect(await reasonsOf({ ...GOOD, startUtc: '2024-01-01T00:00:00.000Z', endUtc: new Date(Date.parse('2024-01-01') + 741.965 * DAY).toISOString() })).toEqual([]);
  });

  it('after-deadline: a By a date answer finishing past its own deadline', async () => {
    const end = Date.parse(endAfter(741.965)) / 1000;
    const deadline = { ...GOOD, schema: 8, effort: 'deadline' };
    expect(await reasonsOf({ ...deadline, deadline: Math.round(end - 2 * 86400) })).toContain('after-deadline');
    expect(await reasonsOf({ ...deadline, deadline: Math.round(end + 3600) })).toEqual([]);
  });

  it('no-delivery leaves By a date answers alone: their replayed legs carry no delivery (three live rows)', async () => {
    const end = Date.parse(endAfter(741.965)) / 1000;
    const zero = LEGS.map(l => ({ ...l, peakDeliveryQph: 0 }));
    expect(await reasonsOf({ ...GOOD, schema: 8, effort: 'deadline', deadline: Math.round(end + 3600), legs: zero })).toEqual([]);
  });

  it('several reasons at once are all named', async () => {
    const r = await reasonsOf({ ...GOOD, finalTE: 489, ascensions: 2, endUtc: '2026-01-01T00:00:00.000Z' });
    expect(r).toEqual(expect.arrayContaining(['target-not-last', 'ascensions-disagree', 'finish-before-start']));
  });

  it('too-many-today: an owner code past 60 rows on the board in 24 h, and not before', async () => {
    for (let i = 0; i < 60; i++) {
      const days = 741.965 + i;
      const body = { ...GOOD, durationDays: days, endUtc: endAfter(days), legs: LEGS.map((l, k) => (k === 5 ? { ...l, days: l.days + i } : l)) };
      const j = await (await send(body, { token: TOKEN, ip: `10.0.0.${i}` })).json();
      expect(j.quarantined, `row ${i}`).toBeUndefined();
    }
    const days = 900;
    const j = await (
      await send({ ...GOOD, durationDays: days, endUtc: endAfter(days), legs: LEGS.map((l, k) => (k === 5 ? { ...l, days: l.days + 158.035 } : l)) }, { token: TOKEN, ip: '10.0.1.1' })
    ).json();
    expect(j).toMatchObject({ quarantined: true, reasons: ['too-many-today'] });
    // A code-less sender is not counted this way (nothing ties its rows together); the rate gate covers it.
    const anon = await (await send({ ...GOOD, durationDays: days, endUtc: endAfter(days), legs: LEGS.map((l, k) => (k === 5 ? { ...l, days: l.days + 158.035 } : l)) }, { ip: '10.0.1.2' })).json();
    expect(anon.quarantined).toBeUndefined();
  });
});

describe('what a quarantined send gets, and where it goes', () => {
  const BAD = { ...GOOD, finalTE: 489, nickname: 'Jo', diagnostics: { phase: 'x' }, timing: { legsMs: [1, 2] } };

  it('a new client (?quarantine=1): 200, quarantined, the code, the reasons, the message and a CSV token', async () => {
    const res = await send(BAD, { token: TOKEN });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, quarantined: true, reasons: ['target-not-last'] });
    expect(j.id).toMatch(/^[a-f0-9]{8}$/);
    expect(j.message).toBe(`Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: ${j.id}`);
    expect(j.reasonText).toBe('the target is 489 TE but the chain ends at 490');
    expect(typeof j.uploadToken).toBe('string');
  });

  it('an older client: a 422 whose problems say the same, so it shows "collector said 422: Refused..."', async () => {
    const res = await send(BAD, { quarantine: false });
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j).toMatchObject({ quarantined: true, reasons: ['target-not-last'] });
    expect(j.problems).toEqual([
      `Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: ${j.id} (the target is 489 TE but the chain ends at 490)`,
    ]);
    expect(j.uploadToken).toBeUndefined();
    expect(keysOf('quar:')).toHaveLength(1);
  });

  it('is stored privately for 180 days with its reasons and extras (diagnostics, timing), and on no board', async () => {
    const j = await (await send(BAD, { token: TOKEN })).json();
    const [key] = keysOf('quar:');
    expect(key).toMatch(new RegExp(`^quar:\\d{4}-\\d{2}-\\d{2}:${j.id}$`));
    const ttl = env.SUBMISSIONS._exp.get(key) - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(179 * 86400);
    const rec = JSON.parse(env.SUBMISSIONS._m.get(key));
    expect(rec.row).toMatchObject({ finalTE: 489, nickname: 'Jo', chain: GOOD.chain });
    expect(rec.row.owner).toMatch(/^[a-f0-9]{64}$/);
    expect(rec.reasons).toEqual([{ code: 'target-not-last', text: 'the target is 489 TE but the chain ends at 490' }]);
    expect(rec.extras).toEqual({ diagnostics: { phase: 'x' }, timing: { legsMs: [1, 2] } });
    expect(keysOf('sub:')).toEqual([]);
    expect(keysOf('flag:')).toEqual([]);
    for (const path of ['/all', '/leaderboard', '/flagged']) {
      expect(await (await get(path)).text(), path).not.toContain(j.id);
    }
    expect(await (await get('/mine', TOKEN)).text()).not.toContain(j.id);
  });

  it('a run the app marked contradicts-itself is quarantined, no longer put on the flagged board', async () => {
    const j = await (await send({ ...GOOD, flags: ['contradicts-itself'] })).json();
    expect(j).toMatchObject({ quarantined: true, reasons: ['contradicts-itself'] });
    expect(j.flagged).toBeUndefined();
    expect((await (await get('/flagged')).json()).rows).toEqual([]);
  });

  it('the same refused run again gets the same code, and costs no second write', async () => {
    const a = await (await send(BAD, { token: TOKEN })).json();
    const puts = env.SUBMISSIONS.counts.put;
    const b = await (await send({ ...BAD, submittedAt: 'later' }, { token: TOKEN })).json();
    expect(b.id).toBe(a.id);
    expect(keysOf('quar:')).toHaveLength(1);
    expect(env.SUBMISSIONS.counts.put - puts).toBe(1); // the rate gate only
    // A different sender's identical run is a different code.
    const c = await (await send(BAD, { token: 'b'.repeat(32) })).json();
    expect(c.id).not.toBe(a.id);
  });

  it('costs 2 reads, 2 writes, no list and no delete', async () => {
    const before = { ...env.SUBMISSIONS.counts };
    await send(BAD);
    const c = env.SUBMISSIONS.counts;
    expect([c.get - before.get, c.put - before.put, c.list - before.list, c.delete - before.delete]).toEqual([2, 2, 0, 0]);
  });

  it('counts against the rate gate like any send', async () => {
    for (let i = 0; i < 10; i++) expect((await send({ ...BAD, durationDays: 700 + i })).status).toBe(200);
    expect((await send(BAD)).status).toBe(429);
  });

  it('its CSV is kept privately under quarcsv:, never served, and never under csv:', async () => {
    const j = await (await send(BAD, { token: TOKEN })).json();
    const gz = new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]);
    const up = token =>
      worker.fetch(
        new Request(`https://collector.test/csv?id=${j.id}`, { method: 'POST', headers: { 'x-upload-token': token }, body: gz }),
        env
      );
    expect((await up('nonsense')).status).toBe(403);
    const res = await up(j.uploadToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, quarantined: true });
    expect(keysOf('quarcsv:')).toEqual([`quarcsv:${j.id}`]);
    expect(env.SUBMISSIONS._exp.has(`quarcsv:${j.id}`)).toBe(true);
    expect(keysOf('csv:')).toEqual([]);
    expect((await get(`/csv?id=${j.id}`)).status).toBe(404);
    expect((await up(j.uploadToken)).status).toBe(409);
  });

  it('a CSV in parts goes the same private way', async () => {
    const j = await (await send(BAD, { token: TOKEN })).json();
    const up = (part, body) =>
      worker.fetch(
        new Request(`https://collector.test/csv?id=${j.id}&part=${part}&parts=2`, {
          method: 'POST',
          headers: { 'x-upload-token': j.uploadToken },
          body,
        }),
        env
      );
    expect((await up(1, new Uint8Array([9, 9]))).status).toBe(200);
    expect((await up(0, new Uint8Array([0x1f, 0x8b, 1]))).status).toBe(200);
    expect(keysOf('quarcsv:').sort()).toEqual([`quarcsv:${j.id}`, `quarcsv:${j.id}:p1`]);
    expect(keysOf('csv:')).toEqual([]);
  });

  it("a board row's token never reaches quarcsv:, nor a quarantine token csv:", async () => {
    const ok = await (await send(GOOD)).json();
    const q = await (await send(BAD, { token: TOKEN })).json();
    const gz = new Uint8Array([0x1f, 0x8b, 1]);
    const post = (id, token) =>
      worker.fetch(new Request(`https://collector.test/csv?id=${id}`, { method: 'POST', headers: { 'x-upload-token': token }, body: gz }), env);
    expect((await post(q.id, ok.uploadToken)).status).toBe(403);
    expect((await post(ok.id, q.uploadToken)).status).toBe(403);
  });
});

// ------------------------------------------------------------------------------- the sweep
describe('the cron sweep', () => {
  /** A cron tick at `iso` (UTC). Resolves once everything it started has finished. */
  async function tick(iso) {
    const waits = [];
    await worker.scheduled({ scheduledTime: Date.parse(iso) }, env, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
  }
  /** Both board snapshots, with one row on the main board. Resolves to that row's id. */
  async function boards() {
    const { id } = await (await send(GOOD)).json();
    await get('/flagged');
    return id;
  }
  const put = (k, v = 'x', opts) => env.SUBMISSIONS._m.set(k, v) && opts?.ttl && env.SUBMISSIONS._exp.set(k, opts.ttl);

  it('runs once an hour, at :30, and touches nothing otherwise', async () => {
    const before = { ...env.SUBMISSIONS.counts };
    for (const m of ['00', '05', '25', '35', '55']) await tick(`2026-10-11T03:${m}:00Z`);
    expect(env.SUBMISSIONS.counts).toEqual(before);
    await tick('2026-10-11T03:30:00Z');
    expect(env.SUBMISSIONS.counts.list - before.list).toBe(1);
  });

  it('deletes an orphan CSV and an unsealed part only on a sweep 24 h after first seeing them', async () => {
    const id = await boards();
    put(`csv:${id}`); // the row is on the board: kept
    put('csv:deadbeef'); // no row anywhere: an orphan
    put('csv:feedface:p1'); // a part whose csv:feedface was never sealed
    put('csv:abcd0000'); // another CSV whose row is gone
    put(`csv:${id}:p1`); // a part of a sealed file: kept
    await tick('2026-10-11T00:30:00Z');
    expect(keysOf('csv:').sort()).toEqual([`csv:${id}`, `csv:${id}:p1`, 'csv:abcd0000', 'csv:deadbeef', 'csv:feedface:p1'].sort());
    await tick('2026-10-11T21:30:00Z'); // 21 h: not yet
    expect(keysOf('csv:')).toContain('csv:deadbeef');
    await tick('2026-10-12T00:30:00Z'); // 24 h
    expect(keysOf('csv:').sort()).toEqual([`csv:${id}`, `csv:${id}:p1`]);
  });

  it("forgets a candidate whose row turns up (a CSV that beat its row's snapshot patch)", async () => {
    await boards();
    put('csv:12345678');
    await tick('2026-10-11T00:30:00Z');
    // The row lands on the board in the meantime.
    const raw = env.SUBMISSIONS._m.get('snap:sub');
    env.SUBMISSIONS._m.set('snap:sub', raw.replace('"rows":[', '"rows":[{"id":"12345678","hasCsv":true,"finalTE":490,"durationDays":1},').replace(/"count":(\d+)/, (_, n) => `"count":${Number(n) + 1}`));
    await tick('2026-10-12T00:30:00Z');
    expect(keysOf('csv:')).toContain('csv:12345678');
    expect(JSON.parse(env.SUBMISSIONS._m.get('gc:state')).seen['csv:12345678']).toBeUndefined();
  });

  it('judges no whole CSV an orphan of its row while a board snapshot is missing', async () => {
    await (await send(GOOD)).json(); // snap:sub only; no snap:flag yet
    put('csv:deadbeef');
    put('csv:feedface:p1');
    await tick('2026-10-11T00:30:00Z');
    await tick('2026-10-12T00:30:00Z');
    expect(keysOf('csv:')).toEqual(['csv:deadbeef']); // the part needs no snapshot, so it went
  });

  it("deletes a sealed orphan's parts with it", async () => {
    await boards();
    env.SUBMISSIONS._m.set('csv:abcd0000', 'x');
    await env.SUBMISSIONS.put('csv:abcd0000', 'x', { metadata: { parts: 3 } });
    put('csv:abcd0000:p1');
    put('csv:abcd0000:p2');
    await tick('2026-10-11T00:30:00Z');
    await tick('2026-10-12T00:30:00Z');
    expect(keysOf('csv:abcd0000')).toEqual([]);
  });

  it('deletes rate-limit counters written with no TTL (gate: at hour%3 == 1, instn: at 2), never one with a TTL', async () => {
    put('gate:9.9.9.9');
    put('gate:8.8.8.8', 'x', { ttl: 1e10 });
    put('instn:aaaa:2026-10-10');
    put('instn:bbbb:2026-10-11', 'x', { ttl: 1e10 });
    await tick('2026-10-11T01:30:00Z');
    expect(keysOf('gate:')).toEqual(['gate:8.8.8.8']);
    expect(keysOf('instn:')).toHaveLength(2);
    await tick('2026-10-11T02:30:00Z');
    expect(keysOf('instn:')).toEqual(['instn:bbbb:2026-10-11']);
  });

  it('never deletes a board row, a snapshot, a quarantined row or anything private', async () => {
    const id = await boards();
    await send({ ...GOOD, finalTE: 489 });
    put('extra:abcd1234');
    put('inst:2026-10-11:abc');
    const before = [...env.SUBMISSIONS._m.keys()].filter(k => !k.startsWith('gc:') && !k.startsWith('gate:')).sort();
    for (const iso of ['2026-10-11T00:30:00Z', '2026-10-11T01:30:00Z', '2026-10-11T02:30:00Z', '2026-10-12T00:30:00Z', '2026-10-12T01:30:00Z', '2026-10-12T02:30:00Z']) await tick(iso);
    const after = [...env.SUBMISSIONS._m.keys()].filter(k => !k.startsWith('gc:') && !k.startsWith('gate:')).sort();
    expect(after).toEqual(before);
    expect(after).toContain(`sub:490:${String(Math.round(741.965 * 10000)).padStart(10, '0')}:${id}`);
  });

  it('is bounded: at most 10 deletes and one list a run, the rest next time', async () => {
    for (let i = 0; i < 25; i++) put(`gate:10.0.0.${i}`);
    const lists = env.SUBMISSIONS.counts.list;
    await tick('2026-10-11T01:30:00Z');
    expect(keysOf('gate:')).toHaveLength(15);
    expect(env.SUBMISSIONS.counts.list - lists).toBe(1);
    await tick('2026-10-11T04:30:00Z');
    await tick('2026-10-11T07:30:00Z');
    expect(keysOf('gate:')).toHaveLength(0);
  });

  it('walks a namespace past one page an hour at a time, with the cursor kept in gc:state', async () => {
    env = { SUBMISSIONS: makeKV(3), CSV_UPLOAD_KEY: 'test-key' };
    for (let i = 0; i < 5; i++) put(`gate:10.0.0.${i}`);
    await tick('2026-10-11T01:30:00Z');
    expect(keysOf('gate:')).toHaveLength(2);
    expect(JSON.parse(env.SUBMISSIONS._m.get('gc:state')).cursor['gate:']).toBe('gate:10.0.0.2');
    await tick('2026-10-11T04:30:00Z');
    expect(keysOf('gate:')).toHaveLength(0);
  });

  it('on a clean namespace writes nothing', async () => {
    await boards();
    const puts = env.SUBMISSIONS.counts.put;
    for (const iso of ['2026-10-11T00:30:00Z', '2026-10-11T01:30:00Z', '2026-10-11T02:30:00Z']) await tick(iso);
    expect(env.SUBMISSIONS.counts.put).toBe(puts);
  });
});

vi.setConfig({ testTimeout: 20000 });
