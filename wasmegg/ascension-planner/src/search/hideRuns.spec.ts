import { describe, expect, it, vi } from 'vitest';
import { csvFileName, fetchOwnCsv, hideBody, isOneCode, setRunsHidden } from './hideRuns';

// A made-up code: 32 hex, the shape search/owner.ts mints. Never a real one.
const CODE = 'c0de'.repeat(8);
const BASE = 'https://collector.test/';

/** A fetch that records its calls and answers `status` with `body`. */
function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
}

describe('POST /hide', () => {
  it('hides named runs: one POST to /hide, the code in x-owner-token, the body exactly {ids, hidden}', async () => {
    const f = fakeFetch(200, { ok: true, hidden: true, ids: ['ab12', 'cd34'], changed: ['ab12'] });
    const r = await setRunsHidden({
      base: BASE,
      token: CODE,
      target: { ids: ['ab12', 'cd34', 'ab12'] },
      hidden: true,
      fetch: f,
    });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://collector.test/hide');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/json', 'x-owner-token': CODE });
    expect(JSON.parse(init?.body as string)).toEqual({ ids: ['ab12', 'cd34'], hidden: true });
    expect(init?.body).toBe('{"ids":["ab12","cd34"],"hidden":true}');
    expect(r).toEqual({ kind: 'ok', reply: { ok: true, hidden: true, ids: ['ab12', 'cd34'], changed: ['ab12'] } });
  });

  it('shows runs again with hidden: false', async () => {
    const f = fakeFetch(200, { ok: true, hidden: false, ids: ['ab12'], changed: ['ab12'] });
    const r = await setRunsHidden({ base: BASE, token: CODE, target: { ids: ['ab12'] }, hidden: false, fetch: f });
    expect(f.mock.calls[0][1]?.body).toBe('{"ids":["ab12"],"hidden":false}');
    expect(r.kind === 'ok' && r.reply.hidden).toBe(false);
  });

  it('hides every run of the account with {all: true}, and passes `more` on', async () => {
    const f = fakeFetch(200, { ok: true, hidden: true, ids: ['ab12'], changed: ['ab12'], more: true });
    const r = await setRunsHidden({ base: BASE, token: CODE, target: { all: true }, hidden: true, fetch: f });
    expect(f.mock.calls[0][1]?.body).toBe('{"all":true,"hidden":true}');
    expect(r).toEqual({ kind: 'ok', reply: { ok: true, hidden: true, ids: ['ab12'], changed: ['ab12'], more: true } });
  });

  it('passes missing on (not saved yet, or not yours)', async () => {
    const f = fakeFetch(200, { ok: true, hidden: true, ids: [], changed: [], missing: ['ab12'] });
    const r = await setRunsHidden({ base: BASE, token: CODE, target: { ids: ['ab12'] }, hidden: true, fetch: f });
    expect(r).toEqual({ kind: 'ok', reply: { ok: true, hidden: true, ids: [], changed: [], missing: ['ab12'] } });
  });

  it('reads a 429 with retryAfter', async () => {
    const f = fakeFetch(429, { error: 'slow down', retryAfter: 42 });
    expect(await setRunsHidden({ base: BASE, token: CODE, target: { ids: ['ab12'] }, hidden: true, fetch: f })).toEqual(
      {
        kind: 'rate',
        retryAfter: 42,
        dailyCap: false,
      }
    );
  });

  it('reads the daily cap', async () => {
    const f = fakeFetch(429, { error: 'at most 200', retryAfter: 7200, dailyCap: true });
    expect(await setRunsHidden({ base: BASE, token: CODE, target: { all: true }, hidden: false, fetch: f })).toEqual({
      kind: 'rate',
      retryAfter: 7200,
      dailyCap: true,
    });
  });

  it('a 429 without a body still says rate', async () => {
    const f = fakeFetch(429, 'nope');
    expect(await setRunsHidden({ base: BASE, token: CODE, target: { all: true }, hidden: true, fetch: f })).toEqual({
      kind: 'rate',
      retryAfter: null,
      dailyCap: false,
    });
  });

  it('reads a 400 and its problems', async () => {
    const f = fakeFetch(400, { error: 'rejected', problems: ['ids must be a list of 1 to 50 row ids'] });
    expect(await setRunsHidden({ base: BASE, token: CODE, target: { ids: ['ab12'] }, hidden: true, fetch: f })).toEqual(
      {
        kind: 'bad',
        message: 'rejected',
        problems: ['ids must be a list of 1 to 50 row ids'],
      }
    );
  });

  it('answers network for a fetch that throws', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await setRunsHidden({ base: BASE, token: CODE, target: { ids: ['ab12'] }, hidden: true, fetch: f })).toEqual(
      {
        kind: 'network',
        message: 'Failed to fetch',
      }
    );
  });

  it('answers http for anything else', async () => {
    const f = fakeFetch(500, { error: 'boom' });
    expect(await setRunsHidden({ base: BASE, token: CODE, target: { ids: ['ab12'] }, hidden: true, fetch: f })).toEqual(
      {
        kind: 'http',
        status: 500,
      }
    );
  });

  it('sends one code per call: no code, or a comma list of codes, is refused before anything is sent', async () => {
    const f = fakeFetch(200, { ok: true, hidden: true, ids: [], changed: [] });
    for (const token of [null, '', `${CODE},${CODE}`, CODE.toUpperCase(), CODE.slice(1)]) {
      const r = await setRunsHidden({ base: BASE, token, target: { ids: ['ab12'] }, hidden: true, fetch: f });
      expect(r.kind).toBe('bad');
    }
    expect(f).not.toHaveBeenCalled();
    expect(isOneCode(CODE)).toBe(true);
    expect(isOneCode(`${CODE},${CODE}`)).toBe(false);
  });

  it('refuses no ids, more than 50, and ids that are not run ids, before sending', async () => {
    const f = fakeFetch(200, {});
    const many = Array.from({ length: 51 }, (_, i) => `a${String(i).padStart(3, '0')}`);
    for (const ids of [[], many, ['../x'], ['AB12']]) {
      expect((await setRunsHidden({ base: BASE, token: CODE, target: { ids }, hidden: true, fetch: f })).kind).toBe(
        'bad'
      );
    }
    expect(f).not.toHaveBeenCalled();
    expect(hideBody({ ids: many.slice(0, 50) }, true)).toHaveProperty('body');
  });
});

describe('GET /csv with the code (a hidden run of yours)', () => {
  it('sends the code and hands back the bytes', async () => {
    const f = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([0x1f, 0x8b, 1]), { status: 200 })
    );
    const blob = await fetchOwnCsv({ base: BASE, id: 'ab12', token: CODE, fetch: f });
    expect(f.mock.calls[0][0]).toBe('https://collector.test/csv?id=ab12');
    expect(f.mock.calls[0][1]?.headers).toEqual({ 'x-owner-token': CODE });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0x1f, 0x8b, 1]));
    expect(csvFileName('ab12')).toBe('chains-ab12.csv.gz');
  });

  it('says why in plain words when it cannot', async () => {
    await expect(fetchOwnCsv({ base: BASE, id: 'ab12', token: CODE, fetch: fakeFetch(403, {}) })).rejects.toThrow(
      /code/
    );
    await expect(fetchOwnCsv({ base: BASE, id: 'ab12', token: CODE, fetch: fakeFetch(404, {}) })).rejects.toThrow(
      /no CSV/
    );
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchOwnCsv({ base: BASE, id: 'ab12', token: CODE, fetch: down })).rejects.toThrow(/reach the leaderboard/);
    const f = fakeFetch(200, {});
    await expect(fetchOwnCsv({ base: BASE, id: 'ab12', token: null, fetch: f })).rejects.toThrow(/no code/);
    expect(f).not.toHaveBeenCalled();
  });
});
