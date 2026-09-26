/**
 * End-to-end tests for the collector Worker.
 *
 * `worker.js` is a single file with no build step and no dependencies, so a plain `Map` standing
 * in for KV exercises it the whole way through -- validation, the whitelist, the rate limit, the
 * duration ordering, the ID sweep. No wrangler, no network, no account.
 *
 * The cases that are not obvious are the ones that were found by probing the Worker before it
 * was ever deployed, and each would have been invisible until someone abused it:
 *
 *   - a body carrying unknown fields was stored verbatim and served back from /all;
 *   - `durationDays: 1e24` was accepted and keyed as `sub:490:000001e+28:...`, sorting ABOVE
 *     every real entry and taking the top of the leaderboard;
 *   - `Infinity` passed a `> 0` check for the same reason.
 *
 * The last test is the one that matters most in the other direction: hardening the ingest must
 * not quietly drop a field a genuine submission depends on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from './worker.js';

/**
 * KV, as far as this Worker is concerned: get, put with an ignored TTL, prefix list in key order.
 * Metadata behaves as in real KV: a put replaces it (none given means none kept), and list()
 * returns it beside each key, which is what lets /submit check for copies without a get.
 */
function makeKV() {
  const m = new Map();
  const meta = new Map();
  return {
    _m: m,
    _meta: meta,
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async put(k, v, opts) {
      m.set(k, v);
      if (opts && opts.metadata) meta.set(k, opts.metadata);
      else meta.delete(k);
    },
    async list({ prefix, limit }) {
      const keys = [...m.keys()]
        .filter(k => k.startsWith(prefix))
        .sort()
        .slice(0, limit);
      return {
        keys: keys.map(name => (meta.has(name) ? { name, metadata: meta.get(name) } : { name })),
        list_complete: true,
      };
    },
  };
}

let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
});

/**
 * Runs the sends in `fn` one second apart on a fake clock. "Which copy came first" is decided by
 * `receivedAt`, and back-to-back sends in a test land in the same millisecond, which real sends
 * (seconds or minutes apart) never do. Only Date is faked; crypto and promises run as usual.
 */
async function secondsApart(fn) {
  vi.useFakeTimers({ toFake: ['Date'] });
  let t = Date.parse('2026-09-25T12:00:00.000Z');
  vi.setSystemTime(t);
  try {
    return await fn(() => vi.setSystemTime((t += 1000)));
  } finally {
    vi.useRealTimers();
  }
}

const post = (path, body, ip = '1.1.1.1') =>
  worker.fetch(
    new Request('https://collector.test' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify(body),
    }),
    env
  );

const get = path => worker.fetch(new Request('https://collector.test' + path), env);

const stored = () =>
  [...env.SUBMISSIONS._m.entries()].filter(([k]) => k.startsWith('sub:')).map(([k, v]) => [k, JSON.parse(v)]);

/** A board's snapshot, both lines: the public /all body and the private owner index. */
const snapOf = board => {
  const raw = env.SUBMISSIONS._m.get('snap:' + board);
  const cut = raw.indexOf('\n');
  return { raw, pub: JSON.parse(raw.slice(0, cut)), priv: JSON.parse(raw.slice(cut + 1)) };
};

/** POST with an owner code, the way the app sends one. */
const postOwned = (path, body, token, ip = '1.1.1.1') =>
  worker.fetch(
    new Request('https://collector.test' + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': ip,
        ...(token ? { 'x-owner-token': token } : {}),
      },
      body: JSON.stringify(body),
    }),
    env
  );

/** GET with an owner code (or a comma list of them). */
const getOwned = (path, token) =>
  worker.fetch(new Request('https://collector.test' + path, { headers: token ? { 'x-owner-token': token } : {} }), env);

/** Owner codes as src/search/owner.ts makes them: 32 hex. Obviously fake on purpose. */
const TOKEN_A = 'a'.repeat(32);
const TOKEN_B = 'b'.repeat(32);
const TOKEN_C = 'c'.repeat(32);

const MINIMAL = { schema: 3, chain: [195, 490], durationDays: 700, finalTE: 490 };

/** A submission with every field the app actually builds (see src/search/submission.ts). */
const FULL = {
  schema: 3,
  nickname: 'Jordan',
  chain: [195, 219, 248, 286, 327, 490],
  ascensions: 6,
  durationDays: 741.965,
  startLocal: '2026-09-04 18:51',
  endLocal: '2028-09-15 11:02',
  timezone: 'America/Denver',
  currentTE: 120,
  finalTE: 490,
  effort: 'balanced',
  window: '08:00-23:00 daily',
  holdShifts: true,
  forceContinue: true,
  waitingHours: 412.5,
  artifacts: ['T4L Quantum metronome', 'T4L Lunar totem'],
  stones: [{ label: 'T4 Tachyon stone', count: 40 }],
  legs: [{ te: 195, strategy: '2-sale-tier13', days: 70.2, peakDeliveryQph: 12.5 }],
  run: { workers: 12, cores: 20, minutes: 65.3, secondsPerChain: 2.36 },
  epicResearch: { maxed: true, atMax: 36, total: 36, short: [] },
  colleggtibles: { maxed: false, byTier: [4, 0, 1, 2, 7], total: 14, short: ['carbon T3'] },
  chainsPriced: 11000,
  submittedAt: '2026-09-13T23:00:00.000Z',
};

describe('ingest is a whitelist, not a scrub', () => {
  it('drops fields nobody asked for rather than storing them', async () => {
    const res = await post('/submit', { ...MINIMAL, evilPayload: 'X'.repeat(5000), note: 'arbitrary text' });
    expect(res.status).toBe(200);
    const [, record] = stored()[0];
    expect(record).not.toHaveProperty('evilPayload');
    expect(record).not.toHaveProperty('note');
  });

  it('keeps every field of a genuine submission byte for byte', async () => {
    expect((await post('/submit', FULL)).status).toBe(200);
    const board = await (await get('/leaderboard?final=490')).json();
    const row = board.rows.find(r => r.nickname === 'Jordan');
    for (const [key, value] of Object.entries(FULL)) {
      expect(row[key], `field ${key}`).toEqual(value);
    }
  });
});

describe('bounds', () => {
  it('refuses a chain longer than any real one', async () => {
    const chain = Array.from({ length: 50000 }, (_, i) => i + 1);
    expect((await post('/submit', { ...MINIMAL, chain })).status).toBe(400);
  });

  it('refuses oversized inventories', async () => {
    const artifacts = Array.from({ length: 20000 }, () => 'Y'.repeat(200));
    expect((await post('/submit', { ...MINIMAL, artifacts })).status).toBe(400);
  });

  // The sort key is `round(days * 10000)` padded to ten characters. A value needing an eleventh
  // character, or rendering as `1e+28`, sorts above every genuine entry.
  it.each([1e24, Infinity, -1, 0, NaN])('refuses durationDays %p', async durationDays => {
    expect((await post('/submit', { ...MINIMAL, durationDays })).status).toBe(400);
  });

  it('keeps a real duration first in the key space', async () => {
    await post('/submit', { ...MINIMAL, nickname: 'slow', durationDays: 900 }, '2.2.2.2');
    await post('/submit', { ...MINIMAL, nickname: 'fast', durationDays: 600 }, '3.3.3.3');
    const board = await (await get('/leaderboard?final=490')).json();
    const days = board.rows.map(r => r.durationDays);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(board.rows[0].nickname).toBe('fast');
  });
});

describe('what never gets stored', () => {
  it('sweeps a player id out of free text', async () => {
    await post('/submit', { ...MINIMAL, nickname: 'EI1234567890123456' });
    const dump = JSON.stringify(await (await get('/all')).json());
    expect(dump).not.toContain('EI1234567890123456');
    expect(dump).toContain('EI[redacted]');
  });

  it('keeps no trace of the submitter address in the record', async () => {
    await post('/submit', MINIMAL, '203.0.113.7');
    expect(JSON.stringify(stored())).not.toContain('203.0.113.7');
  });
});

describe('rate limit', () => {
  // A burst, not one-per-minute: comparing effort tiers means posting several results back to
  // back, and the old gate failed the second one with a message that read like a broken server.
  it('allows a burst from one address, then refuses', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await post('/submit', { ...MINIMAL, nickname: `n${i}` }, '4.4.4.4')).status).toBe(200);
    }
    const over = await post('/submit', MINIMAL, '4.4.4.4');
    expect(over.status).toBe(429);
    const body = await over.json();
    expect(body.error).toMatch(/slow down/);
    // How long to wait, in the body where a cross-origin page can read it.
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
  });

  it('counts each address separately', async () => {
    for (let i = 0; i < 10; i++) await post('/submit', { ...MINIMAL, nickname: `a${i}` }, '4.4.4.4');
    expect((await post('/submit', MINIMAL, '4.4.4.4')).status).toBe(429);
    expect((await post('/submit', MINIMAL, '5.5.5.5')).status).toBe(200);
  });

  it('survives a corrupt gate value instead of locking the address out', async () => {
    await env.SUBMISSIONS.put('gate:6.6.6.6', 'not json');
    expect((await post('/submit', MINIMAL, '6.6.6.6')).status).toBe(200);
  });
});

describe('the board keeps different experiments, and folds copies of one result', () => {
  const run = (over, ip) =>
    post(
      '/submit',
      {
        ...MINIMAL,
        nickname: 'Willsalt',
        chain: [195, 490],
        effort: 'balanced',
        window: null,
        holdShifts: true,
        ...over,
      },
      ip
    );

  it("keeps one person's runs at different effort tiers", async () => {
    await run({ effort: 'balanced', durationDays: 700 }, '1.1.1.1');
    await run({ effort: 'thorough', durationDays: 690 }, '1.1.1.1');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows.map(r => r.effort).sort()).toEqual(['balanced', 'thorough']);
  });

  it("keeps one person's different chain shapes", async () => {
    await run({ chain: [195, 490], durationDays: 700 }, '1.1.1.1');
    await run({ chain: [180, 220, 490], durationDays: 705 }, '1.1.1.1');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows).toHaveLength(2);
  });

  it('keeps a scheduled run beside the same chain run unconstrained', async () => {
    await run({ window: null, durationDays: 700 }, '1.1.1.1');
    await run({ window: 'every day 09:00-23:00 America/Denver', durationDays: 740 }, '1.1.1.1');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows).toHaveLength(2);
  });

  // The old collapse kept the faster of two runs of one chain. But the same chain priced again from
  // a later save is a new MEASUREMENT of that plan, not a copy -- and which measurement stands is
  // the finish-date board's call (src/lib/leaderboardRank.ts), not this read's.
  it('keeps the same chain priced twice to different durations: that is a re-check, not a copy', async () => {
    await run({ durationDays: 700 }, '1.1.1.1');
    await run({ durationDays: 690 }, '1.1.1.1');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows.map(r => r.durationDays)).toEqual([690, 700]);
  });

  it('folds the same result found by two searches into one line, counting the copies', async () => {
    await run({ effort: 'balanced', durationDays: 700 }, '1.1.1.1');
    await run({ effort: 'thorough', durationDays: 700, chainsPriced: 9000 }, '1.1.1.1');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows).toHaveLength(1);
    // The bigger search stands for the group.
    expect(board.rows[0].effort).toBe('thorough');
    expect(board.rows[0].copies).toBe(2);
    // /all still has both, the second pointing at the first.
    expect((await (await get('/all')).json()).rows).toHaveLength(2);
  });

  it('still keeps two anonymous runs that differ in content', async () => {
    await run({ nickname: undefined, durationDays: 700 }, '1.1.1.1');
    await run({ nickname: undefined, durationDays: 701 }, '2.2.2.2');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows).toHaveLength(2);
  });

  // The fold is content-only, but who may NAME and stand for a group is not: only the sender of the
  // earliest copy. Otherwise re-posting someone's public row under your own name would take it.
  it("never lets a later stranger's copy name or stand for someone else's result", async () => {
    const body = { ...FULL, nickname: 'Kenzie', durationDays: 650 };
    await secondsApart(async tick => {
      await postOwned('/submit', body, TOKEN_A, '1.1.1.1');
      tick();
      await postOwned(
        '/submit',
        { ...body, nickname: 'Impostor', effort: 'thorough', chainsPriced: 99999 },
        TOKEN_B,
        '2.2.2.2'
      );
    });
    const rows = (await (await get('/leaderboard?final=490')).json()).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].nickname).toBe('Kenzie');
    expect(rows[0].chainsPriced).toBe(FULL.chainsPriced);
    expect(rows[0].copies).toBe(2);
    // Different owners: stored as an ordinary row, never marked as a copy of Kenzie's.
    const all = (await (await get('/all')).json()).rows;
    expect(all).toHaveLength(2);
    expect(all.every(r => r.dupOf === undefined)).toBe(true);
  });
});

describe('the leaderboard page', () => {
  // This is the test that would have caught the page being dead on arrival. The API was fine
  // the whole time; the inlined script had `\${...}` in it as literal text, because the template
  // holding it was String.raw, and a SyntaxError on line one meant the table never left
  // "Loading…". Compiling the script is a real parse, not a string match for the old mistake --
  // `new Function` compiles the body without running it, so `document` is never touched.
  it('serves an inline script that actually parses', async () => {
    const html = await (await get('/')).text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(script, 'page should carry an inline script').not.toBeNull();
    expect(() => new Function(script[1])).not.toThrow();
  });

  it('serves HTML at the root', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});

describe('artifacts are labels, stones are counted', () => {
  it('refuses the old {label, count} shape for artifacts', async () => {
    const res = await post('/submit', { ...MINIMAL, artifacts: [{ label: 'T4L Gusset', count: 3 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).problems.join(' ')).toMatch(/labels/);
  });

  it('keeps stone counts', async () => {
    await post('/submit', { ...MINIMAL, stones: [{ label: 'T4 Lunar stone', count: 8 }] });
    const [, record] = stored()[0];
    expect(record.stones).toEqual([{ label: 'T4 Lunar stone', count: 8 }]);
  });
});

describe('solved loadouts', () => {
  const SET = [
    { artifact: 'T4E Quantum metronome', stones: ['T4 Tachyon stone', 'T4 Tachyon stone'] },
    { artifact: 'T3L Tungsten ankh', stones: ['T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'] },
  ];

  it('stores both sets with their stones intact', async () => {
    await post('/submit', { ...MINIMAL, delivery: SET, earnings: SET });
    const [, record] = stored()[0];
    expect(record.delivery).toEqual(SET);
    expect(record.earnings).toEqual(SET);
  });

  it('leaves them absent rather than empty when a submission has none', async () => {
    await post('/submit', MINIMAL);
    const [, record] = stored()[0];
    // Absent, not []: "this build did not record a loadout" is not "the simulator wore nothing".
    expect(record).not.toHaveProperty('delivery');
    expect(record).not.toHaveProperty('earnings');
  });

  it('bounds a hand-made loadout', async () => {
    const huge = Array.from({ length: 500 }, () => ({ artifact: 'x'.repeat(500), stones: [] }));
    await post('/submit', { ...MINIMAL, delivery: huge });
    const [, record] = stored()[0];
    expect(record.delivery.length).toBeLessThanOrEqual(8);
    expect(record.delivery[0].artifact.length).toBeLessThanOrEqual(64);
  });
});

describe('the CSV half', () => {
  const gz = async text => {
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter();
    void w.write(new TextEncoder().encode(text));
    void w.close();
    return await new Response(cs.readable).arrayBuffer();
  };
  const postCsv = (id, body, token, type = 'application/gzip') =>
    worker.fetch(
      new Request('https://collector.test/csv?id=' + id, {
        method: 'POST',
        headers: { 'content-type': type, ...(token ? { 'x-upload-token': token } : {}) },
        body,
      }),
      env
    );
  /** A real submission, and the one-time token /submit signed for it. Each one a different result:
   *  the same anonymous body twice is an exact copy, and the second send stores nothing. */
  let sent = 0;
  const submitted = async () => (await post('/submit', { ...MINIMAL, durationDays: 700 + ++sent })).json();

  const gunzip = async buf => {
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    void w.write(new Uint8Array(buf));
    void w.close();
    return await new Response(ds.readable).text();
  };

  it('stores a gzipped CSV and hands back bytes that inflate to the original', async () => {
    const csv = 'rank,chain,days\n1,195 490,741.9\n'.repeat(200);
    const packed = await gz(csv);
    // The whole reason this design works: a chain table is repetitive enough that KV can hold it.
    expect(packed.byteLength).toBeLessThan(csv.length / 10);
    const { id, uploadToken } = await submitted();
    expect((await postCsv(id, packed, uploadToken)).status).toBe(200);

    const res = await worker.fetch(new Request('https://collector.test/csv?id=' + id), env);
    expect(res.status).toBe(200);
    // A gzip FILE, not a gzip-encoded CSV. Declaring `content-encoding: gzip` on a `text/csv`
    // body made Cloudflare compress the response a second time, so the client stripped one layer
    // and saved the inner gzip under a .csv name. `application/gzip` is not compressible to the
    // edge, so the bytes arrive as sent. Asserting the absence of the header is the point.
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(res.headers.get('content-type')).toBe('application/gzip');
    expect(res.headers.get('content-disposition')).toContain('.csv.gz');
    expect(await gunzip(await res.arrayBuffer())).toBe(csv);
  });

  // A raw CSV stored as-is would later be served with a Content-Encoding its bytes do not have:
  // a download that will not open. Refusing is the kinder failure.
  it('refuses a body that is not gzip', async () => {
    const { id, uploadToken } = await submitted();
    const res = await postCsv(id, 'rank,chain\n1,195 490\n', uploadToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/gzip/);
  });

  it('refuses an empty body and a bad id', async () => {
    const { id, uploadToken } = await submitted();
    expect((await postCsv(id, new ArrayBuffer(0), uploadToken)).status).toBe(400);
    expect((await postCsv('not a valid id!', await gz('x'), uploadToken)).status).toBe(400);
  });

  // The hole this closes: ids are public on the leaderboard, and the upload used to trust any of
  // them. Anyone could overwrite every player's table, or park data under ids nobody submitted.
  describe('only the submitter can attach a CSV, once', () => {
    it('refuses an upload with no token, or a made-up one', async () => {
      const { id } = await submitted();
      expect((await postCsv(id, await gz('x'))).status).toBe(403);
      expect((await postCsv(id, await gz('x'), 'f'.repeat(64))).status).toBe(403);
      expect(env.SUBMISSIONS._m.has('csv:' + id)).toBe(false);
    });

    it("refuses one submission's token on another submission", async () => {
      const a = await submitted();
      const b = await submitted();
      expect((await postCsv(b.id, await gz('x'), a.uploadToken)).status).toBe(403);
    });

    it('refuses an id that was never submitted', async () => {
      const { uploadToken } = await submitted();
      expect((await postCsv('deadbeef', await gz('x'), uploadToken)).status).toBe(403);
      expect(env.SUBMISSIONS._m.has('csv:deadbeef')).toBe(false);
    });

    it('refuses a second upload, even with the right token', async () => {
      const { id, uploadToken } = await submitted();
      const first = await gz('rank,chain\n1,195 490\n');
      expect((await postCsv(id, first, uploadToken)).status).toBe(200);
      expect((await postCsv(id, await gz('vandalised'), uploadToken)).status).toBe(409);
      expect(new Uint8Array(env.SUBMISSIONS._m.get('csv:' + id))).toEqual(new Uint8Array(first));
    });

    it('keeps the token out of the stored record and the leaderboard', async () => {
      const { uploadToken } = await submitted();
      expect(JSON.stringify(stored())).not.toContain(uploadToken);
      expect(await (await get('/leaderboard?final=490')).text()).not.toContain(uploadToken);
    });

    it('with no key configured, hands out no token and refuses every CSV', async () => {
      delete env.CSV_UPLOAD_KEY;
      const body = await submitted();
      expect(body.id).toBeTruthy();
      expect(body.uploadToken).toBeUndefined();
      expect((await postCsv(body.id, await gz('x'), 'anything')).status).toBe(503);
    });

    it('lets the browser send the token header cross-origin', async () => {
      const res = await worker.fetch(new Request('https://collector.test/csv?id=x', { method: 'OPTIONS' }), env);
      expect(res.headers.get('access-control-allow-headers')).toContain('x-upload-token');
    });
  });

  it('404s for a CSV that was never uploaded', async () => {
    const res = await worker.fetch(new Request('https://collector.test/csv?id=deadbeef'), env);
    expect(res.status).toBe(404);
  });

  // The board has to know which rows have one, without an extra read per row.
  it('marks rows on the leaderboard with whether a CSV exists', async () => {
    const { id, uploadToken } = await submitted();
    let board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows[0].id).toBe(id);
    expect(board.rows[0].hasCsv).toBe(false);

    await postCsv(id, await gz('rank,chain\n1,195 490\n'), uploadToken);
    board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows[0].hasCsv).toBe(true);
  });
});

describe('rejections are explained', () => {
  it('names the problems rather than failing blank', async () => {
    const res = await post('/submit', { schema: 1, chain: [5], durationDays: -1, finalTE: 0 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.problems.length).toBeGreaterThan(0);
  });

  it('refuses a schema it does not recognise', async () => {
    expect((await post('/submit', { ...MINIMAL, schema: 99 })).status).toBe(400);
    // Schema 1 is what the app sent before artifacts became labels. Refused rather than
    // reinterpreted: the two shapes disagree about what `artifacts` even is.
    expect((await post('/submit', { ...MINIMAL, schema: 1 })).status).toBe(400);
  });
});

describe('run cost', () => {
  // This field feeds an average across every submission on the board, so a single absurd value
  // moves the estimate for everyone. Bounded on the way in, like every other field here.
  it('stores a plausible run cost', async () => {
    await post('/submit', { ...MINIMAL, run: { workers: 12, cores: 20, minutes: 65.3, secondsPerChain: 2.36 } });
    expect(stored()[0][1].run).toEqual({ workers: 12, cores: 20, minutes: 65.3, secondsPerChain: 2.36 });
  });

  it('drops a run cost with an impossible worker count', async () => {
    await post('/submit', { ...MINIMAL, run: { workers: 1e9, cores: 8, minutes: 10, secondsPerChain: 1 } });
    expect(stored()[0][1].run).toBeUndefined();
  });

  it('drops a run cost claiming a year of compute', async () => {
    await post('/submit', { ...MINIMAL, run: { workers: 8, cores: 8, minutes: 60 * 24 * 400, secondsPerChain: 1 } });
    expect(stored()[0][1].run).toBeUndefined();
  });

  it('drops a partial run cost rather than storing half of it', async () => {
    await post('/submit', { ...MINIMAL, run: { workers: 8 } });
    expect(stored()[0][1].run).toBeUndefined();
  });

  it('keeps a null core count, which means "not reported"', async () => {
    await post('/submit', { ...MINIMAL, run: { workers: 8, cores: null, minutes: 10, secondsPerChain: 1 } });
    expect(stored()[0][1].run.cores).toBeNull();
  });

  it('stores nothing at all when the sender omits it', async () => {
    await post('/submit', { ...MINIMAL });
    expect('run' in stored()[0][1]).toBe(false);
  });
});

describe('progression summaries', () => {
  it('stores epic research and colleggtible summaries', async () => {
    await post('/submit', {
      ...MINIMAL,
      epicResearch: { maxed: true, atMax: 36, total: 36, short: [] },
      colleggtibles: { maxed: false, byTier: [4, 0, 1, 2, 7], total: 14, short: ['carbon T3'] },
    });
    const row = stored()[0][1];
    expect(row.epicResearch).toEqual({ maxed: true, atMax: 36, total: 36, short: [] });
    expect(row.colleggtibles.byTier).toEqual([4, 0, 1, 2, 7]);
  });

  it('refuses a byTier that is not the five fixed buckets', async () => {
    await post('/submit', { ...MINIMAL, colleggtibles: { maxed: false, byTier: [1, 2], total: 3, short: [] } });
    expect(stored()[0][1].colleggtibles).toBeUndefined();
  });

  it('refuses an atMax larger than the total', async () => {
    await post('/submit', { ...MINIMAL, epicResearch: { maxed: true, atMax: 99, total: 36, short: [] } });
    expect(stored()[0][1].epicResearch).toBeUndefined();
  });

  it('truncates a short list a client failed to cap', async () => {
    const short = Array.from({ length: 100 }, (_, i) => `r${i} 0/10`);
    await post('/submit', { ...MINIMAL, epicResearch: { maxed: false, atMax: 0, total: 100, short } });
    expect(stored()[0][1].epicResearch.short).toHaveLength(16);
  });

  it('stores neither when the sender omits them', async () => {
    await post('/submit', { ...MINIMAL });
    const row = stored()[0][1];
    expect('epicResearch' in row).toBe(false);
    expect('colleggtibles' in row).toBe(false);
  });
});

describe('schema compatibility', () => {
  // The app and the Worker deploy separately. Refusing everything but the newest schema created a
  // window where every submission failed with "unknown schema 3" and nothing the sender could do.
  it('accepts the previous schema, which is missing only optional fields', async () => {
    const res = await post('/submit', { ...MINIMAL, schema: 2 });
    expect(res.status).toBe(200);
    expect(stored()).toHaveLength(1);
  });

  it('records the schema the sender actually used', async () => {
    await post('/submit', { ...MINIMAL, schema: 2 });
    expect(stored()[0][1].schema).toBe(2);
  });

  it('still refuses a schema it has never heard of', async () => {
    expect((await post('/submit', { ...MINIMAL, schema: 99 })).status).toBe(400);
    expect((await post('/submit', { ...MINIMAL, schema: 1 })).status).toBe(400);
  });

  it('names what it does accept, so the sender knows what to do', async () => {
    const res = await post('/submit', { ...MINIMAL, schema: 99 });
    expect((await res.json()).problems.join(' ')).toContain('accepts 2, 3');
  });
});

describe('what an exhaustive run found', () => {
  const PROOF = {
    runnersUp: [
      { chain: [249, 490], days: 948.44 },
      { chain: [260, 490], days: 961.2 },
    ],
    byAscensions: [
      { ascensions: 2, chain: [299, 490], days: 948.4, priced: 2 },
      { ascensions: 3, chain: [249, 330, 490], days: 900.1, priced: 40 },
    ],
    spread: { best: 948.4, median: 955, worst: 1200.5 },
  };

  it('stores the block as sent', async () => {
    await post('/submit', { ...MINIMAL, schema: 5, proof: PROOF });
    expect(stored()[0][1].proof).toEqual(PROOF);
  });

  it('is absent on a submission that carries none, rather than stored empty', async () => {
    await post('/submit', { ...MINIMAL, schema: 5 });
    expect('proof' in stored()[0][1]).toBe(false);
  });

  // Same reasoning as every other optional block here: a submission is still worth keeping
  // without its distribution, so a malformed one is dropped and not made into a rejection.
  it('drops a block with no usable spread instead of refusing the submission', async () => {
    const res = await post('/submit', { ...MINIMAL, schema: 5, proof: { ...PROOF, spread: null } });
    expect(res.status).toBe(200);
    expect('proof' in stored()[0][1]).toBe(false);
  });

  it('caps the runners-up, so a summary field cannot carry a whole result table', async () => {
    const many = Array.from({ length: 500 }, (_, k) => ({ chain: [200 + k, 490], days: 900 + k }));
    await post('/submit', { ...MINIMAL, schema: 5, proof: { ...PROOF, runnersUp: many } });
    expect(stored()[0][1].proof.runnersUp).toHaveLength(16);
  });

  it('drops a listed chain that is longer than a chain is allowed to be', async () => {
    const long = { chain: Array.from({ length: 200 }, (_, k) => k + 1), days: 900 };
    await post('/submit', { ...MINIMAL, schema: 5, proof: { ...PROOF, runnersUp: [long] } });
    expect(stored()[0][1].proof.runnersUp).toEqual([]);
  });

  // The same reason DURATION_DAYS is capped on the submission itself: these numbers are read as
  // days and rendered next to real ones, and an unbounded value would make the rest unreadable.
  it('drops a runner-up whose duration is out of range', async () => {
    await post('/submit', {
      ...MINIMAL,
      schema: 5,
      proof: { ...PROOF, runnersUp: [{ chain: [249, 490], days: 1e24 }] },
    });
    expect(stored()[0][1].proof.runnersUp).toEqual([]);
  });

  it('keeps an unknown field out of the block, like everywhere else', async () => {
    await post('/submit', {
      ...MINIMAL,
      schema: 5,
      proof: { ...PROOF, evilPayload: 'x'.repeat(5000) },
    });
    expect('evilPayload' in stored()[0][1].proof).toBe(false);
  });
});

describe('the board keeps experiments apart', () => {
  const NAMED = { ...MINIMAL, schema: 5, nickname: 'Wolfcry1993' };
  const SPACE = {
    mode: 'bands',
    bands: [[249, 299]],
    minGap: 0,
    minAscensions: 2,
    maxAscensions: 2,
    chains: 2,
    chainsPriced: 2,
    stoppedEarly: false,
  };
  const board = async () => (await (await get('/leaderboard?final=490')).json()).rows;

  // Already true before the space entered the key, and worth a test because it is the thing
  // people assume is broken: the chain itself has always been part of the identity.
  it('keeps two different chains from the same person', async () => {
    await post('/submit', { ...NAMED, chain: [299, 490], durationDays: 900 });
    await post('/submit', { ...NAMED, chain: [249, 330, 490], durationDays: 950 });
    await post('/submit', { ...NAMED, chain: [210, 260, 310, 360, 490], durationDays: 980 });
    expect((await board()).map(r => r.chain.length)).toEqual([2, 3, 5]);
  });

  // A wider space that reaches the same answer rules out more and is the more valuable row. Before
  // the space entered the old key it collapsed into the narrower one; now the two fold by content
  // and the wider proof is the one that stands.
  it('folds one chain proven over two spaces into the wider proof', async () => {
    await post('/submit', { ...NAMED, durationDays: 900, space: SPACE });
    const wide = await post('/submit', {
      ...NAMED,
      durationDays: 900,
      space: { ...SPACE, bands: [[200, 249, 299, 350]], chains: 4, chainsPriced: 4 },
    });
    expect((await wide.json()).duplicate).toBe('result');
    const rows = await board();
    expect(rows).toHaveLength(1);
    expect(rows[0].space.chains).toBe(4);
    expect(rows[0].copies).toBe(2);
  });

  it('stores nothing for the same space run sent twice, which is one result sent again', async () => {
    const first = await (await post('/submit', { ...NAMED, durationDays: 900, space: SPACE })).json();
    const again = await (await post('/submit', { ...NAMED, durationDays: 900, space: SPACE })).json();
    expect(again.duplicate).toBe('exact');
    expect(again.id).toBe(first.id);
    expect(stored()).toHaveLength(1);
  });

  // A run stopped halfway and the same run later finished found the same answer by different
  // amounts of search. Both kept; the finished one stands, since it priced more of the one space.
  it('lets a finished proof stand for the same proof stopped halfway', async () => {
    await post('/submit', { ...NAMED, durationDays: 900, space: { ...SPACE, chainsPriced: 1, stoppedEarly: true } });
    await post('/submit', { ...NAMED, durationDays: 900, space: SPACE });
    const rows = await board();
    expect(rows).toHaveLength(1);
    expect(rows[0].space.stoppedEarly).toBe(false);
    expect(stored()).toHaveLength(2);
  });

  it('folds a searched row into a proof that reached the same finish', async () => {
    await post('/submit', { ...NAMED, durationDays: 900 });
    await post('/submit', { ...NAMED, durationDays: 900, space: SPACE });
    const rows = await board();
    expect(rows).toHaveLength(1);
    expect(rows[0].space).toBeDefined();
  });

  it('keeps rows with no space apart when their durations differ', async () => {
    await post('/submit', { ...NAMED, schema: 3, durationDays: 900 });
    await post('/submit', { ...NAMED, schema: 3, durationDays: 901 });
    expect(await board()).toHaveLength(2);
  });
});

describe('the seed a run started from', () => {
  it('stores it', async () => {
    await post('/submit', { ...MINIMAL, schema: 5, seed: [195, 490] });
    expect(stored()[0][1].seed).toEqual([195, 490]);
  });

  it('is absent when none was sent, which is how an exhaustive row reads as seedless', async () => {
    await post('/submit', { ...MINIMAL, schema: 5 });
    expect('seed' in stored()[0][1]).toBe(false);
  });

  it('bounds it like any other chain', async () => {
    await post('/submit', { ...MINIMAL, schema: 5, seed: Array.from({ length: 200 }, (_, k) => k + 1) });
    expect(stored()[0][1].seed).toHaveLength(64);
  });

  it('drops values that are not usable TEs rather than storing them', async () => {
    await post('/submit', { ...MINIMAL, schema: 5, seed: [195, -1, 'x', 1e9, 490] });
    expect(stored()[0][1].seed).toEqual([195, 490]);
  });
});

describe('schema 6: the virtue variables and the upload page', () => {
  const V6 = {
    ...MINIMAL,
    schema: 6,
    startWeekday: 'Sat',
    deliveryScore: { lay: 1.5, hab: 1.4, shipping: 1.6, score: 0.97 },
    clothedTE: 241.3,
    teByEgg: [40, 38, 36, 34, 32],
    backupAgeHours: 2.5,
    sweep: { preset: 'M2', bands: '190-280:2; 270-372:2', minGap: 10 },
    machine: { cores: 8, ramGB: 16, workers: 7 },
    source: 'upload',
  };

  it('stores every schema-6 field a real client sends', async () => {
    const res = await post('/submit', V6);
    expect(res.status).toBe(200);
    const row = stored()[0][1];
    for (const k of ['startWeekday', 'deliveryScore', 'clothedTE', 'teByEgg', 'backupAgeHours', 'sweep', 'machine']) {
      expect(row[k]).toEqual(V6[k]);
    }
    expect(row.source).toBe('upload');
    expect(row.schema).toBe(6);
  });

  it('still accepts a schema-5 client, which simply has none of them', async () => {
    expect((await post('/submit', { ...MINIMAL, schema: 5 })).status).toBe(200);
    expect('deliveryScore' in stored()[0][1]).toBe(false);
  });

  it('drops out-of-range values field by field instead of storing them', async () => {
    await post('/submit', {
      ...V6,
      startWeekday: 'Caturday',
      deliveryScore: { lay: 1e9, hab: 1, shipping: 1, score: 1 },
      teByEgg: [1, 2, -3],
      // Signed since schema 7, so -1 is fine now; a year and more either side is not.
      backupAgeHours: -9000,
      sweep: { preset: 'x'.repeat(100) },
      machine: { cores: 0, ramGB: 'lots' },
      source: 'somewhere else',
    });
    const row = stored()[0][1];
    for (const k of ['startWeekday', 'deliveryScore', 'teByEgg', 'backupAgeHours', 'machine', 'source']) {
      expect(k in row).toBe(false);
    }
    expect(row.sweep.preset).toHaveLength(16);
  });
});

describe('the flagged board', () => {
  const postAs = (body, token, ip = '9.9.9.9') =>
    worker.fetch(
      new Request('https://collector.test/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': ip,
          ...(token ? { 'x-owner-token': token } : {}),
        },
        body: JSON.stringify(body),
      }),
      env
    );
  const flaggedAs = token =>
    worker.fetch(
      new Request('https://collector.test/flagged', { headers: token ? { 'x-owner-token': token } : {} }),
      env
    );
  const TOKEN = 'a'.repeat(32);

  it('keeps a flagged run off the main board and on its own', async () => {
    const res = await postAs({ ...FULL, flags: ['integrity-stall'], integrityMinutes: 695520 }, TOKEN);
    expect((await res.json()).flagged).toEqual(['integrity-stall']);
    expect((await (await get('/leaderboard?final=490')).json()).rows).toHaveLength(0);
    expect((await (await get('/all')).json()).rows).toHaveLength(0);
    const board = await (await flaggedAs()).json();
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].integrityMinutes).toBe(695520);
  });

  it('is anonymous to everyone but the owner, and never serves the owner code', async () => {
    await postAs({ ...FULL, flags: ['integrity-stall'] }, TOKEN);
    const anon = (await (await flaggedAs()).json()).rows[0];
    expect(anon.nickname).toBeUndefined();
    expect(anon.yours).toBeUndefined();
    expect(anon.owner).toBeUndefined();
    const someoneElse = (await (await flaggedAs('b'.repeat(32))).json()).rows[0];
    expect(someoneElse.nickname).toBeUndefined();
    const mine = (await (await flaggedAs(TOKEN)).json()).rows[0];
    expect(mine.nickname).toBe('Jordan');
    expect(mine.yours).toBe(true);
    expect(mine.owner).toBeUndefined();
    // Stored hashed, never as sent.
    const raw = [...env.SUBMISSIONS._m.values()].find(v => typeof v === 'string' && v.includes('"owner"'));
    expect(raw).not.toContain(TOKEN);
  });

  it('flags a plan past ten years even when the client sent no flags', async () => {
    const res = await postAs({ ...MINIMAL, durationDays: 31828 });
    expect((await res.json()).flagged).toEqual(['decades-long']);
    expect((await (await get('/all')).json()).rows).toHaveLength(0);
  });

  it('drops flags it does not know and leaves an ordinary run on the main board', async () => {
    await postAs({ ...MINIMAL, flags: ['made-up'] });
    expect((await (await get('/all')).json()).rows).toHaveLength(1);
    expect((await (await flaggedAs()).json()).rows).toHaveLength(0);
  });

  it('does not serve the owner hash on the main board either', async () => {
    await postAs(MINIMAL, TOKEN);
    const row = (await (await get('/all')).json()).rows[0];
    expect(row.owner).toBeUndefined();
  });

  it('keeps time off as whole dates and drops anything else', async () => {
    await postAs({
      ...MINIMAL,
      timeOff: [
        { from: '2027-07-14', to: '2027-07-15' },
        { from: 'soon', to: 'later' },
      ],
    });
    const row = (await (await get('/all')).json()).rows[0];
    expect(row.timeOff).toEqual([{ from: '2027-07-14', to: '2027-07-15' }]);
  });
});

describe('board reads come from a snapshot (KV free tier: 1,000 lists a day)', () => {
  /** Counts list calls, and can hide keys from list() the way eventually-consistent KV does. */
  function spy(kv) {
    const counts = { list: 0, get: 0 };
    const hidden = new Set();
    const orig = { list: kv.list.bind(kv), get: kv.get.bind(kv) };
    kv.list = async opts => {
      counts.list++;
      const r = await orig.list(opts);
      return { keys: r.keys.filter(k => !hidden.has(k.name)) };
    };
    kv.get = async k => {
      counts.get++;
      return orig.get(k);
    };
    return { counts, hidden };
  }

  it('serves /all with one read and no list once a snapshot exists', async () => {
    await post('/submit', { ...MINIMAL, nickname: 'A' });
    const { counts } = spy(env.SUBMISSIONS);
    const res = await (await get('/all')).json();
    expect(res.count).toBe(1);
    expect(counts.list).toBe(0);
    expect(counts.get).toBe(1);
  });

  it('includes a row the list cannot see yet', async () => {
    const { hidden } = spy(env.SUBMISSIONS);
    const origPut = env.SUBMISSIONS.put.bind(env.SUBMISSIONS);
    // Every newly written submission key is invisible to list(), as right after a KV write.
    env.SUBMISSIONS.put = async (k, v, o) => {
      if (k.startsWith('sub:')) hidden.add(k);
      return origPut(k, v, o);
    };
    await post('/submit', { ...MINIMAL, nickname: 'Lagging' });
    const rows = (await (await get('/all')).json()).rows;
    expect(rows.map(r => r.nickname)).toEqual(['Lagging']);
  });

  it('marks hasCsv in the snapshot when the table arrives', async () => {
    const { id, uploadToken } = await (await post('/submit', { ...MINIMAL, nickname: 'C' })).json();
    expect((await (await get('/all')).json()).rows[0].hasCsv).toBe(false);
    const gz = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const up = await worker.fetch(
      new Request(`https://collector.test/csv?id=${id}`, {
        method: 'POST',
        headers: { 'x-upload-token': uploadToken },
        body: gz,
      }),
      env
    );
    expect(up.status).toBe(200);
    expect((await (await get('/all')).json()).rows[0].hasCsv).toBe(true);
  });

  it('builds a snapshot on the first read when there is none (first deploy)', async () => {
    await post('/submit', { ...MINIMAL, nickname: 'Old' });
    env.SUBMISSIONS._m.delete('snap:sub');
    expect((await (await get('/all')).json()).count).toBe(1);
    expect(env.SUBMISSIONS._m.has('snap:sub')).toBe(true);
  });

  it('settles once after a write, healing anything a race missed, and then stops', async () => {
    await post('/submit', { ...MINIMAL, nickname: 'One' });
    // A row that reached KV but not the snapshot (two writes at the same instant).
    env.SUBMISSIONS._m.set('sub:490:0007000000:deadbeef', JSON.stringify({ ...MINIMAL, nickname: 'Missed' }));
    const { raw, pub } = snapOf('sub');
    // The write asked for a settle a minute and a half on; before then a read lists nothing.
    expect(pub.settleAt).toBeGreaterThan(pub.builtAt);
    let counts = countKV(env.SUBMISSIONS);
    await get('/all');
    expect(counts.list).toBe(0);
    // Once that moment has passed, the next read settles the board behind the answer.
    env.SUBMISSIONS._m.set('snap:sub', raw.replace(`"settleAt":${pub.settleAt}`, `"settleAt":${pub.builtAt}`));
    await get('/all');
    const names = (await (await get('/all')).json()).rows.map(r => r.nickname).sort();
    expect(names).toEqual(['Missed', 'One']);
    expect(snapOf('sub').pub.settleAt).toBe(0);
    // Settled, and nothing written since: reads cost one read and no list again.
    counts = countKV(env.SUBMISSIONS);
    await get('/all');
    expect(counts).toMatchObject({ list: 0, get: 1, put: 0 });
  });

  it('does not rebuild a quiet board just because its snapshot is old', async () => {
    await post('/submit', { ...MINIMAL, nickname: 'Quiet' });
    await getOwned('/mine', TOKEN_A); // builds the (empty) flagged board's snapshot
    const { raw, pub } = snapOf('sub');
    const halfDay = 12 * 60 * 60 * 1000;
    env.SUBMISSIONS._m.set(
      'snap:sub',
      raw.replace(
        `"builtAt":${pub.builtAt},"v":3,"settleAt":${pub.settleAt}`,
        `"builtAt":${pub.builtAt - halfDay},"v":3,"settleAt":0`
      )
    );
    const counts = countKV(env.SUBMISSIONS);
    await get('/all');
    await getOwned('/mine', TOKEN_A);
    expect(counts.list).toBe(0);
    // A day with no writes at all is settled once anyway, as a backstop.
    env.SUBMISSIONS._m.set(
      'snap:sub',
      raw.replace(
        `"builtAt":${pub.builtAt},"v":3,"settleAt":${pub.settleAt}`,
        `"builtAt":${pub.builtAt - 2 * halfDay - 1},"v":3,"settleAt":0`
      )
    );
    await get('/all');
    expect(counts.list).toBe(2);
  });

  it('never serves the owner hash from the snapshot', async () => {
    await worker.fetch(
      new Request('https://collector.test/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '9.9.9.9',
          'x-owner-token': 'secret-token-123',
        },
        body: JSON.stringify({ ...MINIMAL, nickname: 'Owner' }),
      }),
      env
    );
    const raw = await (await get('/all')).text();
    expect(raw).not.toContain('owner');
    expect(snapOf('sub').pub.rows[0].owner).toBeUndefined();
  });

  it('keeps a real owner hash out of every served board, and out of the snapshot rows', async () => {
    await postOwned('/submit', { ...MINIMAL, nickname: 'Owned' }, TOKEN_A);
    await postOwned('/submit', { ...MINIMAL, flags: ['integrity-stall'] }, TOKEN_A);
    const hash = JSON.parse([...env.SUBMISSIONS._m.entries()].find(([k]) => k.startsWith('sub:'))[1]).owner;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    for (const path of ['/all', '/all?final=490', '/leaderboard', '/flagged']) {
      expect(await (await get(path)).text(), path).not.toContain(hash.slice(0, 12));
    }
    expect(await (await getOwned('/mine', TOKEN_A)).text()).not.toContain(hash.slice(0, 12));
    expect(snapOf('sub').pub.rows[0].owner).toBeUndefined();
    expect(snapOf('flag').pub.rows[0].owner).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2 of the finish-date leaderboard (2026-09-25): copies caught at /submit, names put on rows
// by owner code, a caller's own rows, `acct`, schema 7, and /all served as stored bytes.
// ---------------------------------------------------------------------------------------------

/** Counts KV calls, the way the free tier bills them. */
function countKV(kv) {
  const counts = { list: 0, get: 0, put: 0 };
  for (const op of ['list', 'get', 'put']) {
    const orig = kv[op].bind(kv);
    kv[op] = async (...a) => {
      counts[op]++;
      return orig(...a);
    };
  }
  return counts;
}

/** A realistic send: the fields the fingerprint reads are all present. */
const SEND = {
  ...FULL,
  schema: 7,
  nickname: undefined,
  durationDays: 663.7219,
  startLocal: '2026-09-25 07:12',
  currentTE: 199,
};

describe('every stored row carries the collector-side fields, and only the collector sets them', () => {
  it('stamps receivedAt from its own clock, and serves it', async () => {
    const before = Date.now();
    await post('/submit', MINIMAL);
    const row = (await (await get('/all')).json()).rows[0];
    expect(Date.parse(row.receivedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(row.receivedAt)).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('ignores receivedAt, dupOf, owner, acct and ownerToken in a posted body', async () => {
    await post('/submit', {
      ...MINIMAL,
      nickname: 'Forger',
      receivedAt: '2020-01-01T00:00:00.000Z',
      dupOf: 'deadbeef',
      owner: 'f'.repeat(64),
      acct: '123456789abc',
      ownerToken: TOKEN_A,
    });
    const [, record] = stored()[0];
    expect(record.receivedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(record).not.toHaveProperty('dupOf');
    expect(record).not.toHaveProperty('owner');
    expect(record).not.toHaveProperty('ownerToken');
    const row = (await (await get('/all')).json()).rows[0];
    // A code in the BODY is not a claim: only the header is. So no owner, so no acct.
    expect(row).not.toHaveProperty('acct');
  });

  it('keeps fingerprint, search, owner prefix, name and receipt time as key metadata, not in the row', async () => {
    await postOwned('/submit', { ...SEND, nickname: 'Meta' }, TOKEN_A);
    const [key, record] = stored()[0];
    const meta = env.SUBMISSIONS._meta.get(key);
    expect(meta.fp).toMatch(/^[a-f0-9]{32}$/);
    expect(meta.s).toMatch(/^[a-f0-9]{16}$/);
    expect(meta.o).toBe(record.owner.slice(0, 12));
    expect(meta.n).toBe('Meta');
    expect(meta.at).toBe(record.receivedAt);
    expect(JSON.stringify(meta)).not.toContain(TOKEN_A);
    expect(record).not.toHaveProperty('fp');
  });
});

describe('an exact copy is caught at /submit and stores nothing', () => {
  it('answers with the stored row instead of writing a second one', async () => {
    const first = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    const again = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    expect(again).toMatchObject({ ok: true, id: first.id, duplicate: 'exact' });
    expect(Date.parse(again.firstAt)).toBeGreaterThan(0);
    expect(stored()).toHaveLength(1);
    expect((await (await get('/all')).json()).count).toBe(1);
  });

  it('folds a copy that differs only in the name, the send time or the run cost', async () => {
    const first = await (await postOwned('/submit', { ...SEND, nickname: 'A' }, TOKEN_A)).json();
    const again = await (
      await postOwned(
        '/submit',
        {
          ...SEND,
          nickname: 'Other name',
          submittedAt: '2026-09-25T09:00:00.000Z',
          run: { workers: 2, cores: 2, minutes: 5, secondsPerChain: 1 },
        },
        TOKEN_A
      )
    ).json();
    expect(again.duplicate).toBe('exact');
    expect(again.id).toBe(first.id);
    // Not a rename: the stored row was already named. /claim is for that. The reply says the name it
    // is on the board under, so the app can offer to change it rather than assume it took.
    expect(again.renamed).toBeUndefined();
    expect(again.nickname).toBe('A');
    expect(stored()[0][1].nickname).toBe('A');
  });

  it('checks with one list and no reads for rows that carry metadata', async () => {
    await post('/submit', SEND);
    const counts = countKV(env.SUBMISSIONS);
    const again = await (await post('/submit', SEND)).json();
    expect(again.duplicate).toBe('exact');
    expect(counts.list).toBe(1);
    // The flood gate's own read, and nothing else.
    expect(counts.get).toBe(1);
    // The gate's counter, and nothing else.
    expect(counts.put).toBe(1);
  });

  it('still finds a copy of a row stored before metadata existed, by reading it', async () => {
    env.SUBMISSIONS._m.set('sub:490:0007000000:0dd01d00', JSON.stringify({ ...MINIMAL, nickname: 'Old' }));
    const again = await (await post('/submit', { ...MINIMAL, nickname: 'Old' })).json();
    expect(again.duplicate).toBe('exact');
    expect(again.id).toBe('0dd01d00');
    expect(stored()).toHaveLength(1);
  });

  it('two code-less sends are one sender only under the same nickname', async () => {
    await post('/submit', { ...SEND, nickname: 'Same' });
    expect((await (await post('/submit', { ...SEND, nickname: 'Same' })).json()).duplicate).toBe('exact');
    const other = await (await post('/submit', { ...SEND, nickname: 'Someone else' })).json();
    expect(other.duplicate).toBeUndefined();
    expect(stored()).toHaveLength(2);
  });

  it('stores normally when the owners differ, or only one side has a code', async () => {
    await postOwned('/submit', SEND, TOKEN_A);
    expect((await (await postOwned('/submit', SEND, TOKEN_B)).json()).duplicate).toBeUndefined();
    expect((await (await post('/submit', SEND)).json()).duplicate).toBeUndefined();
    expect(stored()).toHaveLength(3);
    expect(stored().every(([, r]) => r.dupOf === undefined)).toBe(true);
  });

  describe('the upload token on a copy', () => {
    const gzip = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const postCsv = (id, token) =>
      worker.fetch(
        new Request(`https://collector.test/csv?id=${id}`, {
          method: 'POST',
          headers: { 'x-upload-token': token },
          body: gzip,
        }),
        env
      );

    // Five sends in four minutes, none with a CSV: the retry must be able to attach to the one row.
    it('is handed back to the same owner while the row has no CSV, and works', async () => {
      const first = await (await postOwned('/submit', SEND, TOKEN_A)).json();
      const again = await (await postOwned('/submit', SEND, TOKEN_A)).json();
      expect(again.uploadToken).toBe(first.uploadToken);
      expect((await postCsv(again.id, again.uploadToken)).status).toBe(200);
      const third = await (await postOwned('/submit', SEND, TOKEN_A)).json();
      expect(third.duplicate).toBe('exact');
      expect(third.uploadToken).toBeUndefined();
    });

    // Anyone can replay a public anonymous row; a token for it would let them attach a CSV.
    it('is never handed out for a code-less copy', async () => {
      await post('/submit', SEND);
      const again = await (await post('/submit', SEND)).json();
      expect(again.duplicate).toBe('exact');
      expect(again.uploadToken).toBeUndefined();
    });
  });
});

describe('an anonymous row takes a name only from its own owner', () => {
  it('renames the stored row when the same owner re-sends it named', async () => {
    const first = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    const named = await (await postOwned('/submit', { ...SEND, nickname: 'allanfieldhouse' }, TOKEN_A)).json();
    expect(named).toMatchObject({
      ok: true,
      id: first.id,
      duplicate: 'exact',
      renamed: true,
      nickname: 'allanfieldhouse',
    });
    expect(stored()).toHaveLength(1);
    expect(stored()[0][1].nickname).toBe('allanfieldhouse');
    const row = (await (await get('/all')).json()).rows[0];
    expect(row.nickname).toBe('allanfieldhouse');
    // The key's metadata follows, so the next copy check sees a named row.
    expect(env.SUBMISSIONS._meta.get(stored()[0][0]).n).toBe('allanfieldhouse');
  });

  it("never renames on a different owner's send", async () => {
    await postOwned('/submit', SEND, TOKEN_A);
    const res = await (await postOwned('/submit', { ...SEND, nickname: 'Thief' }, TOKEN_B)).json();
    expect(res.renamed).toBeUndefined();
    expect(res.duplicate).toBeUndefined();
    const rows = stored().map(([, r]) => r);
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.owner && !r.nickname)).toBeDefined();
  });

  it('never renames a row that was sent without a code', async () => {
    await post('/submit', SEND);
    const res = await (await postOwned('/submit', { ...SEND, nickname: 'Claimant' }, TOKEN_A)).json();
    expect(res.renamed).toBeUndefined();
    expect(stored().filter(([, r]) => !r.nickname)).toHaveLength(1);
  });
});

describe('the same result from a different search is kept, pointed at the first', () => {
  it('stores it with dupOf and says so', async () => {
    const first = await (await postOwned('/submit', { ...SEND, effort: 'balanced' }, TOKEN_A)).json();
    const other = await (
      await postOwned('/submit', { ...SEND, effort: 'thorough', chainsPriced: 20000 }, TOKEN_A)
    ).json();
    expect(other).toMatchObject({ ok: true, duplicate: 'result', dupOf: first.id });
    expect(other.id).not.toBe(first.id);
    // Its own row, with its own token: the bigger CSV is worth having.
    expect(other.uploadToken).toBeTruthy();
    const all = (await (await get('/all')).json()).rows;
    expect(all).toHaveLength(2);
    expect(all.find(r => r.id === other.id).dupOf).toBe(first.id);
    expect(all.find(r => r.id === first.id).dupOf).toBeUndefined();
  });

  it('points a third search at the first row, not the second', async () => {
    const [first, third] = await secondsApart(async tick => {
      const a = await (await post('/submit', { ...SEND, effort: 'balanced' })).json();
      tick();
      await post('/submit', { ...SEND, effort: 'thorough' });
      tick();
      return [a, await (await post('/submit', { ...SEND, effort: 'normal' })).json()];
    });
    expect(third.dupOf).toBe(first.id);
  });
});

describe('POST /claim', () => {
  const claim = (body, token) => postOwned('/claim', body, token, '7.7.7.7');

  it('puts a name on your own anonymous row', async () => {
    const { id } = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    const res = await claim({ id, nickname: 'Williamthe5thc' }, TOKEN_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, id, nickname: 'Williamthe5thc' });
    const row = (await (await get('/all')).json()).rows[0];
    expect(row.nickname).toBe('Williamthe5thc');
    expect(row.acct).toMatch(/^[a-f0-9]{12}$/);
    expect(stored()).toHaveLength(1);
  });

  it('renames a flagged row too', async () => {
    const { id } = await (await postOwned('/submit', { ...SEND, flags: ['integrity-stall'] }, TOKEN_A)).json();
    expect((await claim({ id, nickname: 'Stalled' }, TOKEN_A)).status).toBe(200);
    const mine = (await (await getOwned('/flagged', TOKEN_A)).json()).rows[0];
    expect(mine.nickname).toBe('Stalled');
  });

  it("refuses someone else's row, and a row sent without a code, with 403", async () => {
    const owned = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    const bare = await (await post('/submit', { ...SEND, durationDays: 700 })).json();
    expect((await claim({ id: owned.id, nickname: 'Thief' }, TOKEN_B)).status).toBe(403);
    expect((await claim({ id: owned.id, nickname: 'Thief' })).status).toBe(403);
    expect((await claim({ id: bare.id, nickname: 'Thief' }, TOKEN_A)).status).toBe(403);
    expect(stored().every(([, r]) => r.nickname !== 'Thief')).toBe(true);
  });

  it('answers 404 for an id nobody submitted', async () => {
    await postOwned('/submit', SEND, TOKEN_A);
    expect((await claim({ id: 'deadbeef', nickname: 'Ghost' }, TOKEN_A)).status).toBe(404);
  });

  it('validates the name like /submit, and sweeps a player id out of it', async () => {
    const { id } = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    expect((await claim({ id, nickname: 'x'.repeat(41) }, TOKEN_A)).status).toBe(400);
    expect((await claim({ id, nickname: '   ' }, TOKEN_A)).status).toBe(400);
    expect((await claim({ id, nickname: 42 }, TOKEN_A)).status).toBe(400);
    expect((await claim({ id: 'not an id!', nickname: 'ok' }, TOKEN_A)).status).toBe(400);
    // Built at run time from a repeated digit: id-shaped, and never a real one.
    const idShaped = `EI${'0'.repeat(16)}`;
    expect((await claim({ id, nickname: idShaped }, TOKEN_A)).status).toBe(200);
    expect(JSON.stringify(stored())).not.toContain(idShaped);
  });

  it('writes nothing when the name is already that', async () => {
    const { id } = await (await postOwned('/submit', { ...SEND, nickname: 'Same' }, TOKEN_A)).json();
    const counts = countKV(env.SUBMISSIONS);
    expect(await (await claim({ id, nickname: 'Same' }, TOKEN_A)).json()).toMatchObject({ ok: true, unchanged: true });
    expect(counts.put).toBe(0);
  });
});

describe('GET /mine', () => {
  it("returns every row sent with any of the caller's codes, anonymous and flagged ones included", async () => {
    await postOwned('/submit', { ...SEND, nickname: 'Main' }, TOKEN_A, '1.1.1.1');
    await postOwned('/submit', { ...SEND, durationDays: 700 }, TOKEN_A, '1.1.1.1');
    await postOwned('/submit', { ...SEND, durationDays: 710, nickname: 'Alt' }, TOKEN_B, '2.2.2.2');
    await postOwned('/submit', { ...SEND, durationDays: 720, flags: ['integrity-stall'] }, TOKEN_B, '2.2.2.2');
    await postOwned('/submit', { ...SEND, durationDays: 730, nickname: 'Stranger' }, TOKEN_C, '3.3.3.3');
    await post('/submit', { ...SEND, durationDays: 740, nickname: 'NoCode' }, '4.4.4.4');

    const res = await getOwned('/mine', `${TOKEN_A}, ${TOKEN_B}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = await res.json();
    expect(body.count).toBe(4);
    expect(body.rows.every(r => r.yours === true)).toBe(true);
    expect(body.rows.map(r => r.durationDays).sort()).toEqual([663.7219, 700, 710, 720]);
    // The flagged row comes back with the rest, and nothing carries an owner.
    expect(body.rows.some(r => r.flags?.includes('integrity-stall'))).toBe(true);
    expect(body.rows.every(r => r.owner === undefined)).toBe(true);

    const justA = (await (await getOwned('/mine', TOKEN_A)).json()).rows;
    expect(justA.map(r => r.durationDays).sort()).toEqual([663.7219, 700]);
  });

  it('needs no list once the snapshots exist', async () => {
    await postOwned('/submit', SEND, TOKEN_A);
    await postOwned('/submit', { ...SEND, flags: ['integrity-stall'] }, TOKEN_A);
    const counts = countKV(env.SUBMISSIONS);
    expect((await (await getOwned('/mine', TOKEN_A)).json()).count).toBe(2);
    expect(counts.list).toBe(0);
    expect(counts.get).toBe(2);
  });

  it('refuses a call with no usable code', async () => {
    expect((await getOwned('/mine')).status).toBe(400);
    expect((await getOwned('/mine', 'not-a-code, also not')).status).toBe(400);
  });

  it('uses at most twenty codes', async () => {
    const many = Array.from({ length: 21 }, (_, i) => i.toString(16).padStart(2, '0').repeat(16));
    await postOwned('/submit', SEND, many[20]);
    expect((await (await getOwned('/mine', many.join(','))).json()).count).toBe(0);
    await postOwned('/submit', { ...SEND, durationDays: 700 }, many[19], '2.2.2.2');
    expect((await (await getOwned('/mine', many.join(','))).json()).count).toBe(1);
  });
});

describe('acct: the same browser account, without the owner code', () => {
  const allRows = async () => (await (await get('/all')).json()).rows;

  it('is on named rows with an owner, and on nothing else', async () => {
    await postOwned('/submit', { ...SEND, nickname: 'Named' }, TOKEN_A, '1.1.1.1');
    await postOwned('/submit', { ...SEND, durationDays: 700 }, TOKEN_A, '1.1.1.1');
    await post('/submit', { ...SEND, durationDays: 710, nickname: 'NoCode' }, '2.2.2.2');
    const rows = await allRows();
    expect(rows.find(r => r.nickname === 'Named').acct).toMatch(/^[a-f0-9]{12}$/);
    // Anonymous with a code: no acct, or anyone could link these runs to the name above.
    expect(rows.find(r => !r.nickname).acct).toBeUndefined();
    expect(rows.find(r => r.nickname === 'NoCode').acct).toBeUndefined();
  });

  it('is stable for one owner across rows and rebuilds, and differs between owners', async () => {
    await postOwned('/submit', { ...SEND, nickname: 'One' }, TOKEN_A, '1.1.1.1');
    await postOwned('/submit', { ...SEND, durationDays: 700, nickname: 'Renamed later' }, TOKEN_A, '1.1.1.1');
    await postOwned('/submit', { ...SEND, durationDays: 710, nickname: 'One' }, TOKEN_B, '2.2.2.2');
    const rows = await allRows();
    const a = rows.filter(r => r.durationDays !== 710).map(r => r.acct);
    expect(a[0]).toBe(a[1]);
    const b = rows.find(r => r.durationDays === 710).acct;
    expect(b).not.toBe(a[0]);
    // A rebuild from scratch computes the same value.
    env.SUBMISSIONS._m.delete('snap:sub');
    expect((await allRows()).find(r => r.durationDays === 710).acct).toBe(b);
  });

  it('cannot be computed from anything served, and is not the owner hash', async () => {
    await postOwned('/submit', { ...SEND, nickname: 'Named' }, TOKEN_A);
    const hash = stored()[0][1].owner;
    const { acct } = (await allRows())[0];
    expect(hash.startsWith(acct)).toBe(false);
    expect(hash).not.toContain(acct);
  });

  it('is absent everywhere when no key is configured', async () => {
    delete env.CSV_UPLOAD_KEY;
    await postOwned('/submit', { ...SEND, nickname: 'Named' }, TOKEN_A);
    expect((await allRows())[0].acct).toBeUndefined();
  });

  it('is never on the flagged board, which is anonymous to everyone but the owner', async () => {
    await postOwned('/submit', { ...SEND, nickname: 'Stalled', flags: ['integrity-stall'] }, TOKEN_A);
    expect((await (await get('/flagged')).json()).rows[0].acct).toBeUndefined();
    expect((await (await getOwned('/flagged', TOKEN_A)).json()).rows[0].acct).toBeUndefined();
  });
});

describe('schema 7', () => {
  const V7 = {
    ...MINIMAL,
    schema: 7,
    backupTE: 199,
    build: 'a1b2c3d',
    startUtc: '2026-09-25T13:12:00.000Z',
    endUtc: '2028-07-20T10:28:00.000Z',
    rechecks: [
      { chain: [223, 253, 282, 316, 490], days: 664.7 },
      { chain: [490], days: 700.2 },
    ],
    backupAgeHours: -0.4,
  };

  it('stores every schema-7 field a real client sends', async () => {
    expect((await post('/submit', V7)).status).toBe(200);
    const row = stored()[0][1];
    for (const k of ['backupTE', 'build', 'startUtc', 'endUtc', 'rechecks', 'backupAgeHours']) {
      expect(row[k], k).toEqual(V7[k]);
    }
    expect(row.schema).toBe(7);
  });

  it('still accepts schema 6', async () => {
    expect((await post('/submit', { ...MINIMAL, schema: 6 })).status).toBe(200);
  });

  it('refuses more than three rechecks, or rechecks that are not a list', async () => {
    const four = Array.from({ length: 4 }, () => ({ chain: [490], days: 700 }));
    expect((await post('/submit', { ...V7, rechecks: four })).status).toBe(400);
    expect((await post('/submit', { ...V7, rechecks: 'soon' })).status).toBe(400);
  });

  it('refuses a build label longer than forty characters, or not text', async () => {
    expect((await post('/submit', { ...V7, build: 'x'.repeat(41) })).status).toBe(400);
    expect((await post('/submit', { ...V7, build: 7 })).status).toBe(400);
  });

  it('drops a recheck that is not a plan for this target, or not a chain at all', async () => {
    await post('/submit', {
      ...V7,
      rechecks: [
        { chain: [223, 300], days: 600 }, // ends somewhere else
        { chain: [300, 250, 490], days: 600 }, // not increasing
        { chain: [250.5, 490], days: 600 }, // not whole TEs
        { chain: [250, 490], days: 1e9 }, // out of range
        { chain: Array.from({ length: 65 }, (_, i) => i + 1).concat(490), days: 600 },
      ].slice(0, 3),
    });
    expect('rechecks' in stored()[0][1]).toBe(false);
  });

  it('drops out-of-range values field by field', async () => {
    await post('/submit', {
      ...V7,
      backupTE: -5,
      startUtc: '2026-09-25 07:12',
      endUtc: 'next Tuesday',
      backupAgeHours: 9000,
      rechecks: [
        { chain: [490], days: 700 },
        { chain: [480], days: 700 },
      ],
    });
    const row = stored()[0][1];
    for (const k of ['backupTE', 'startUtc', 'endUtc', 'backupAgeHours']) expect(k in row, k).toBe(false);
    expect(row.rechecks).toEqual([{ chain: [490], days: 700 }]);
  });

  it('reads backupAgeHours as signed, both ways', async () => {
    await post('/submit', { ...V7, backupAgeHours: -12.5 });
    expect(stored()[0][1].backupAgeHours).toBe(-12.5);
  });
});

describe('/all is the stored snapshot, sent as bytes', () => {
  /** A snapshot in the stored shape, with spacing JSON.stringify would never produce. */
  const plant = (rows, finals = [490]) => {
    const pub = `{"builtAt":${Date.now()},"v":3,"settleAt":0,"finals":${JSON.stringify(finals)},"count":${rows.length},"rows":[ ${rows.join(' ,  ')} ]}`;
    env.SUBMISSIONS._m.set('snap:sub', pub + '\n' + '{"own":{}}');
    return pub;
  };

  it('serves an unfiltered /all without parsing or re-serialising it', async () => {
    const pub = plant(['{"id":"x1",  "finalTE":490, "chain":[195,490], "durationDays":700}']);
    const parse = vi.spyOn(JSON, 'parse');
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      const res = await get('/all');
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.text()).toBe(pub);
      expect(parse.mock.calls.some(([t]) => typeof t === 'string' && t.includes('"rows"'))).toBe(false);
      expect(stringify.mock.calls.some(([o]) => o && typeof o === 'object' && 'rows' in o)).toBe(false);
    } finally {
      parse.mockRestore();
      stringify.mockRestore();
    }
  });

  it('serves /all?final=490 the same way when every row is for 490', async () => {
    const pub = plant(['{"id":"x1",  "finalTE":490, "chain":[195,490], "durationDays":700}']);
    expect(await (await get('/all?final=490')).text()).toBe(pub);
  });

  it('filters when the snapshot holds other targets', async () => {
    plant(
      [
        '{"id":"x1", "finalTE":300, "chain":[195,300], "durationDays":300}',
        '{"id":"x2", "finalTE":490, "chain":[195,490], "durationDays":700}',
      ],
      [300, 490]
    );
    const body = await (await get('/all?final=490')).json();
    expect(body.count).toBe(1);
    expect(body.rows[0].id).toBe('x2');
  });

  it('never serves the private owner index', async () => {
    await postOwned('/submit', SEND, TOKEN_A);
    const text = await (await get('/all')).text();
    expect(text).not.toContain('"own"');
    expect(text).not.toContain('\n');
    expect(snapOf('sub').priv.own[stored()[0][0].split(':').pop()]).toMatch(/^[a-f0-9]{12}$/);
  });

  it('rebuilds a snapshot written by the previous Worker, whose shape it cannot serve', async () => {
    await post('/submit', { ...MINIMAL, nickname: 'Kept' });
    env.SUBMISSIONS._m.set('snap:sub', JSON.stringify({ builtAt: Date.now(), rows: [] }));
    const body = await (await get('/all')).json();
    expect(body.rows.map(r => r.nickname)).toEqual(['Kept']);
    expect(snapOf('sub').pub.v).toBe(3);
  });

  it.each(['/all', '/all?final=490', '/leaderboard?final=490', '/flagged'])('%s makes no list', async path => {
    await post('/submit', MINIMAL);
    await post('/submit', { ...MINIMAL, flags: ['integrity-stall'] });
    const counts = countKV(env.SUBMISSIONS);
    expect((await get(path)).status).toBe(200);
    expect(counts.list).toBe(0);
    expect(counts.get).toBe(1);
  });
});

describe('the upload page lifts a saved owner code into the header', () => {
  /** The page's own upload function, run against the Worker with fetch pointed at it. */
  async function pageUpload() {
    const html = await (await get('/')).text();
    const src = html.match(/async function uploadOne\(f\) \{[\s\S]*?\n\}\n/)[0];
    const sentHeaders = [];
    const fakeFetch = (path, init) => {
      sentHeaders.push(init.headers);
      return worker.fetch(new Request('https://collector.test' + path, init), env);
    };
    const uploadOne = new Function('fetch', src + '; return uploadOne;')(fakeFetch);
    return { uploadOne, sentHeaders };
  }
  const file = obj => ({ text: async () => JSON.stringify(obj) });

  it('sends ownerToken as x-owner-token and strips it from the body', async () => {
    const { uploadOne, sentHeaders } = await pageUpload();
    const res = await uploadOne(file({ ...SEND, ownerToken: TOKEN_A }));
    expect(res.status).toBe(200);
    expect(sentHeaders[0]['x-owner-token']).toBe(TOKEN_A);
    const raw = [...env.SUBMISSIONS._m.entries()].find(([k]) => k.startsWith('sub:'))[1];
    expect(raw).not.toContain(TOKEN_A);
    expect(raw).not.toContain('ownerToken');
    // It counted as an owned send: the browser's own copy of the result is recognised.
    const again = await (await postOwned('/submit', { ...SEND, nickname: 'Named now' }, TOKEN_A)).json();
    expect(again).toMatchObject({ duplicate: 'exact', renamed: true });
  });

  it('posts a file without a code as it was', async () => {
    const { uploadOne, sentHeaders } = await pageUpload();
    expect((await uploadOne(file(SEND))).status).toBe(200);
    expect(sentHeaders[0]['x-owner-token']).toBeUndefined();
    expect(stored()[0][1].owner).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Review fixes (2026-09-26): writes patch the snapshot instead of rebuilding it from a lagging list,
// a settle after them heals what a race dropped, reads stay one KV read, and the fold and `dupOf`
// never let a code-less stranger, or a public link, speak for somebody else.
// ---------------------------------------------------------------------------------------------

/**
 * KV whose list() does not show any row or CSV written during the test yet -- what an eventually
 * consistent list does for up to a minute after a write. Gets still see everything.
 */
function lagList() {
  const kv = env.SUBMISSIONS;
  const hidden = new Set();
  const put = kv.put.bind(kv);
  const list = kv.list.bind(kv);
  kv.put = async (k, v, o) => {
    if (k.startsWith('sub:') || k.startsWith('flag:') || k.startsWith('csv:')) hidden.add(k);
    return put(k, v, o);
  };
  kv.list = async opts => {
    const r = await list(opts);
    return { ...r, keys: r.keys.filter(k => !hidden.has(k.name)) };
  };
  return hidden;
}

const GZIP = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const postCsvFor = (id, token) =>
  worker.fetch(
    new Request(`https://collector.test/csv?id=${id}`, {
      method: 'POST',
      headers: { 'x-upload-token': token },
      body: GZIP,
    }),
    env
  );

/** Make the pending settle due now, as if its minute and a half had passed. */
function settleDue(board = 'sub') {
  const { raw, pub } = snapOf(board);
  env.SUBMISSIONS._m.set('snap:' + board, raw.replace(`"settleAt":${pub.settleAt}`, `"settleAt":${pub.builtAt}`));
}

describe('a write patches the snapshot, so a list that lags cannot take a row off the board', () => {
  it('keeps a new row through the CSV that follows it, and /mine and /claim find it at once', async () => {
    lagList();
    const { id, uploadToken } = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    expect((await postCsvFor(id, uploadToken)).status).toBe(200);
    const row = (await (await get('/all')).json()).rows.find(r => r.id === id);
    expect(row).toMatchObject({ id, hasCsv: true });
    expect((await (await getOwned('/mine', TOKEN_A)).json()).count).toBe(1);
    const claim = await postOwned('/claim', { id, nickname: 'Kenzie' }, TOKEN_A, '7.7.7.7');
    expect(claim.status).toBe(200);
    expect((await (await get('/all')).json()).rows.find(r => r.id === id).nickname).toBe('Kenzie');
  });

  it('keeps three sends in a row, and a settle while the list still lags keeps them too', async () => {
    lagList();
    for (const d of [700, 710, 720]) await post('/submit', { ...SEND, durationDays: d, nickname: `N${d}` });
    expect((await (await get('/all')).json()).rows.map(r => r.durationDays)).toEqual([700, 710, 720]);
    settleDue();
    await get('/all'); // settles behind this answer; the list still shows none of the three
    expect((await (await get('/all')).json()).rows.map(r => r.durationDays)).toEqual([700, 710, 720]);
  });

  it('writes the snapshot with one read and no list', async () => {
    await post('/submit', { ...SEND, durationDays: 700 });
    const counts = countKV(env.SUBMISSIONS);
    const { id, uploadToken } = await (await postOwned('/submit', SEND, TOKEN_A, '2.2.2.2')).json();
    // Gate read, copy check (the one list), snapshot read; row, snapshot and gate writes.
    expect(counts).toEqual({ list: 1, get: 2, put: 3 });
    const csv = countKV(env.SUBMISSIONS);
    await postCsvFor(id, uploadToken);
    // Write-once check, snapshot read; the table and the snapshot. No list at all.
    expect(csv).toEqual({ list: 0, get: 2, put: 2 });
  });

  it('marks a CSV that beat its row into the snapshot once the board settles', async () => {
    const { id, uploadToken } = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    // The race: the snapshot this CSV patches does not show the row yet.
    const { raw, pub } = snapOf('sub');
    const without = raw.replace(/"count":1,"rows":\[.*\]\}\n/, '"count":0,"rows":[]}\n');
    expect(without).not.toBe(raw);
    env.SUBMISSIONS._m.set('snap:sub', without);
    expect((await postCsvFor(id, uploadToken)).status).toBe(200);
    expect((await (await get('/all')).json()).count).toBe(0);
    // The row's own patch asked for a settle; when it comes, the row is back with its table.
    expect(pub.settleAt).toBeGreaterThan(0);
    settleDue();
    await get('/all');
    expect((await (await get('/all')).json()).rows).toMatchObject([{ id, hasCsv: true }]);
  });

  it('heals a rename the snapshot missed, from the name in the key metadata', async () => {
    const { id } = await (await postOwned('/submit', SEND, TOKEN_A)).json();
    const before = snapOf('sub').raw;
    await postOwned('/claim', { id, nickname: 'Renamed' }, TOKEN_A, '7.7.7.7');
    // A write that raced it put the old snapshot back, keeping the settle it asked for.
    const { pub } = snapOf('sub');
    env.SUBMISSIONS._m.set('snap:sub', before.replace(/"settleAt":\d+/, `"settleAt":${pub.settleAt}`));
    settleDue();
    await get('/all');
    const row = (await (await get('/all')).json()).rows[0];
    expect(row.nickname).toBe('Renamed');
    expect(row.acct).toMatch(/^[a-f0-9]{12}$/);
  });

  it('answers a submission when KV refuses the snapshot write, and lands it a second later', async () => {
    await post('/submit', { ...SEND, durationDays: 700, nickname: 'Earlier' });
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const kv = env.SUBMISSIONS;
      const put = kv.put.bind(kv);
      let refuse = true;
      kv.put = async (k, v, o) => {
        if (refuse && k.startsWith('snap:')) throw new Error('429 Too Many Requests');
        return put(k, v, o);
      };
      const pending = [];
      const ctx = { waitUntil: p => pending.push(p) };
      const res = await worker.fetch(
        new Request('https://collector.test/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
          body: JSON.stringify({ ...SEND, nickname: 'Later' }),
        }),
        env,
        ctx
      );
      expect(res.status).toBe(200);
      refuse = false;
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.all(pending);
      expect(snapOf('sub').pub.rows.map(r => r.nickname)).toEqual(['Later', 'Earlier']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still serves a board it built when KV refuses to store it', async () => {
    await post('/submit', { ...SEND, nickname: 'Built' });
    env.SUBMISSIONS._m.delete('snap:sub');
    const put = env.SUBMISSIONS.put.bind(env.SUBMISSIONS);
    env.SUBMISSIONS.put = async (k, v, o) => {
      if (k.startsWith('snap:')) throw new Error('429 Too Many Requests');
      return put(k, v, o);
    };
    const res = await get('/all');
    expect(res.status).toBe(200);
    expect((await res.json()).rows.map(r => r.nickname)).toEqual(['Built']);
  });

  it('reads at most a few hundred rows per request when building from nothing, and finishes on later reads', async () => {
    for (let i = 0; i < 350; i++) {
      const id = i.toString(16).padStart(8, '0');
      env.SUBMISSIONS._m.set(
        `sub:490:${String(7000000 + i).padStart(10, '0')}:${id}`,
        JSON.stringify({ ...MINIMAL, durationDays: 700 + i / 1e4 })
      );
    }
    let most = 0;
    const seen = [];
    for (let n = 0; n < 4 && seen[seen.length - 1] !== 350; n++) {
      const counts = countKV(env.SUBMISSIONS);
      seen.push((await (await get('/all')).json()).count);
      most = Math.max(most, counts.get);
    }
    // The first read answers with what it could read; a later one carries on and finishes.
    expect(seen[0]).toBe(300);
    expect(seen[seen.length - 1]).toBe(350);
    // Workers Free allows 1,000 KV operations per invocation.
    expect(most).toBeLessThanOrEqual(310);
  });
});

describe('/all is never kept by the browser', () => {
  it('tells the browser not to reuse it, so Refresh after a send shows the send', async () => {
    await post('/submit', MINIMAL);
    for (const path of ['/all', '/all?final=490', '/leaderboard?final=490']) {
      expect((await get(path)).headers.get('cache-control'), path).toBe('no-cache');
    }
  });

  it('says the filtered /all is complete too (it carries builtAt, as the unfiltered one does)', async () => {
    await post('/submit', MINIMAL);
    await post('/submit', { ...MINIMAL, chain: [195, 300], finalTE: 300, durationDays: 300 }, '2.2.2.2');
    const body = await (await get('/all?final=490')).json();
    expect(body.count).toBe(1);
    expect(body.builtAt).toBeGreaterThan(0);
  });
});

describe('/leaderboard: a code-less group speaks only for its first sender', () => {
  const SPACE = {
    mode: 'bands',
    bands: [[249, 299]],
    minGap: 0,
    minAscensions: 2,
    maxAscensions: 2,
    // Bigger than the legacy row's chainsPriced, so it WOULD stand if it were eligible.
    chains: 50000,
    chainsPriced: 50000,
    stoppedEarly: false,
  };
  /** A row stored before the collector stamped receipts or took owner codes. */
  const legacy = over => {
    const row = { ...SEND, schema: 6, submittedAt: '2026-09-20T12:00:00.000Z', ...over };
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
    env.SUBMISSIONS._m.set('sub:490:0006637219:1e9ac100', JSON.stringify(row));
  };
  const board = async () => (await (await get('/leaderboard?final=490')).json()).rows;

  it('never lets a later code-less re-post name an anonymous legacy row, or badge it', async () => {
    legacy({});
    await post('/submit', { ...SEND, nickname: 'Mallory', space: SPACE }, '6.6.6.6');
    const rows = await board();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ copies: 2 });
    expect(rows[0].nickname).toBeUndefined();
    expect(rows[0].space).toBeUndefined();
  });

  it("never lets an anonymous code-less re-post lend a legacy player's line a badge", async () => {
    legacy({ nickname: 'Jordan' });
    await post('/submit', { ...SEND, space: SPACE }, '6.6.6.6');
    const rows = await board();
    expect(rows).toHaveLength(1);
    expect(rows[0].nickname).toBe('Jordan');
    expect(rows[0].space).toBeUndefined();
  });

  it('still lets the same code-less name stand for its own legacy row, which is the sender rule', async () => {
    legacy({ nickname: 'Jordan' });
    const res = await (await post('/submit', { ...SEND, nickname: 'Jordan', space: SPACE }, '6.6.6.6')).json();
    expect(res.duplicate).toBe('result');
    const rows = await board();
    expect(rows[0]).toMatchObject({ nickname: 'Jordan', copies: 2 });
    expect(rows[0].space.chains).toBe(50000);
  });
});

describe('dupOf never ties an anonymous row to a named one', () => {
  it('stores a named copy of an anonymous result, from the same code, without pointing at it', async () => {
    const anon = await (await postOwned('/submit', { ...SEND, effort: 'balanced' }, TOKEN_A)).json();
    const named = await (
      await postOwned('/submit', { ...SEND, nickname: 'Alice', effort: 'thorough', chainsPriced: 20000 }, TOKEN_A)
    ).json();
    // Told privately that it is the same result; nothing public says so.
    expect(named.duplicate).toBe('result');
    expect(named.dupOf).toBeUndefined();
    const rows = (await (await get('/all')).json()).rows;
    const alice = rows.find(r => r.nickname === 'Alice');
    expect(alice.acct).toMatch(/^[a-f0-9]{12}$/);
    expect(alice.dupOf).toBeUndefined();
    expect(rows.find(r => r.id === anon.id).dupOf).toBeUndefined();
  });

  it('nor the other way round', async () => {
    await postOwned('/submit', { ...SEND, nickname: 'Alice', effort: 'balanced' }, TOKEN_A);
    const anon = await (await postOwned('/submit', { ...SEND, effort: 'thorough' }, TOKEN_A)).json();
    expect(anon.dupOf).toBeUndefined();
    expect((await (await get('/all')).json()).rows.every(r => r.dupOf === undefined)).toBe(true);
  });

  it('still points a named copy at a named one', async () => {
    const first = await (
      await postOwned('/submit', { ...SEND, nickname: 'Alice', effort: 'balanced' }, TOKEN_A)
    ).json();
    const again = await (
      await postOwned('/submit', { ...SEND, nickname: 'Alice', effort: 'thorough' }, TOKEN_A)
    ).json();
    expect(again).toMatchObject({ duplicate: 'result', dupOf: first.id });
  });
});
