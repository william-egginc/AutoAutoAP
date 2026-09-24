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
import { describe, it, expect, beforeEach } from 'vitest';
import worker from './worker.js';

/** KV, as far as this Worker is concerned: get, put with an ignored TTL, prefix list in key order. */
function makeKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async put(k, v) {
      m.set(k, v);
    },
    async list({ prefix, limit }) {
      const keys = [...m.keys()]
        .filter(k => k.startsWith(prefix))
        .sort()
        .slice(0, limit);
      return { keys: keys.map(name => ({ name })) };
    },
  };
}

let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
});

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

describe('the board keeps different experiments, and collapses re-runs', () => {
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

  it('collapses a genuine re-run to the faster one', async () => {
    // Same chain, same effort, same schedule -- the same experiment priced twice. Duration is
    // deliberately not part of the identity, so these are one row and the quicker stands.
    await run({ durationDays: 700 }, '1.1.1.1');
    await run({ durationDays: 690 }, '1.1.1.1');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].durationDays).toBe(690);
  });

  it('never collapses anonymous submissions, which are not one person', async () => {
    await run({ nickname: undefined, durationDays: 700 }, '1.1.1.1');
    await run({ nickname: undefined, durationDays: 701 }, '2.2.2.2');
    const board = await (await get('/leaderboard?final=490')).json();
    expect(board.rows).toHaveLength(2);
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
  /** A real submission, and the one-time token /submit signed for it. */
  const submitted = async () => (await post('/submit', MINIMAL)).json();

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

  // The case the space signature exists for. A wider space that reaches the same answer rules out
  // more and is the more valuable row; without the signature it collapsed into the narrower one.
  it('keeps one chain proven twice over different spaces', async () => {
    await post('/submit', { ...NAMED, durationDays: 900, space: SPACE });
    await post('/submit', {
      ...NAMED,
      durationDays: 900,
      space: { ...SPACE, bands: [[200, 249, 299, 350]], chains: 4, chainsPriced: 4 },
    });
    expect(await board()).toHaveLength(2);
  });

  it('still collapses the same space run twice, which is one experiment priced again', async () => {
    await post('/submit', { ...NAMED, durationDays: 900, space: SPACE });
    await post('/submit', { ...NAMED, durationDays: 901, space: SPACE });
    const rows = await board();
    expect(rows).toHaveLength(1);
    expect(rows[0].durationDays).toBe(900);
  });

  // A run stopped halfway and the same run later finished are the same experiment. The completed
  // one takes the slot on its own merits: over one space it cannot be slower than the partial.
  it('treats a stopped run and a finished run over one space as the same experiment', async () => {
    await post('/submit', { ...NAMED, durationDays: 950, space: { ...SPACE, chainsPriced: 1, stoppedEarly: true } });
    await post('/submit', { ...NAMED, durationDays: 900, space: SPACE });
    const rows = await board();
    expect(rows).toHaveLength(1);
    expect(rows[0].space.stoppedEarly).toBe(false);
  });

  it('keeps a proof apart from a searched row that happens to agree', async () => {
    await post('/submit', { ...NAMED, durationDays: 900 });
    await post('/submit', { ...NAMED, durationDays: 900, space: SPACE });
    expect(await board()).toHaveLength(2);
  });

  it('leaves rows with no space collapsing exactly as they did before', async () => {
    await post('/submit', { ...NAMED, schema: 3, durationDays: 900 });
    await post('/submit', { ...NAMED, schema: 3, durationDays: 901 });
    expect(await board()).toHaveLength(1);
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
      backupAgeHours: -1,
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
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(token ? { 'x-owner-token': token } : {}) },
        body: JSON.stringify(body),
      }),
      env
    );
  const flaggedAs = token =>
    worker.fetch(new Request('https://collector.test/flagged', { headers: token ? { 'x-owner-token': token } : {} }), env);
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
    await postAs({ ...MINIMAL, timeOff: [{ from: '2027-07-14', to: '2027-07-15' }, { from: 'soon', to: 'later' }] });
    const row = (await (await get('/all')).json()).rows[0];
    expect(row.timeOff).toEqual([{ from: '2027-07-14', to: '2027-07-15' }]);
  });
});
