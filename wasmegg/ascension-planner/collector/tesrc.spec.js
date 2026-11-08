/**
 * start.teSrc (R8, Jordan's override of 7 Nov 2026): the page says whether a run started from the save's TE ('save') or from a TE
 * typed in as the starting-TE override ('typed'), and the typed total. A typed start is kept on the row and instant record; with
 * FLAG_TYPED_TE=1 (off until the client ships and Jordan confirms) a typed-start run goes to the flagged board, unranked, so it
 * cannot take a ranked place with a start the save does not have.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import worker from './worker.js';

function makeKV() {
  const m = new Map();
  const meta = new Map();
  return {
    _m: m,
    _meta: meta,
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async getWithMetadata(k, type) {
      const value = await this.get(k, type);
      return { value, metadata: value !== null && meta.has(k) ? meta.get(k) : null };
    },
    async put(k, v, opts) {
      m.set(k, v);
      (this._ttl ||= new Map()).set(k, opts && opts.expirationTtl);
      if (opts && opts.metadata) meta.set(k, opts.metadata);
      else meta.delete(k);
    },
    async delete(k) {
      m.delete(k);
      meta.delete(k);
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




const START = { src: 'fresh', claimed: [40, 40, 39, 39, 39], pending: [0, 0, 0, 0, 1], saveAt: 1793137074.4, saveHash: 'a684e806', eggs: [1, 2, 3, 4, 5], plan: 'now', tabH: 0.3, buildH: 0.8 };
let env;
let n = 0;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
});
const call = (path, init) => worker.fetch(new Request('https://collector.test' + path, init), env);
const submit = async start => {
  n++;
  const res = await call('/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `7.1.${n >> 8}.${n & 255}`, 'x-owner-token': String(n).padStart(32, 'f') },
    body: JSON.stringify({ schema: 3, chain: [195, 490], durationDays: 700 + n, finalTE: 490, build: '2026-11-07T18:00:00.000Z', start }),
  });
  return { res, body: await res.json() };
};
const keysOf = p => [...env.SUBMISSIONS._m.keys()].filter(k => k.startsWith(p));
const rowOf = id => JSON.parse(env.SUBMISSIONS._m.get([...env.SUBMISSIONS._m.keys()].find(k => k.endsWith(':' + id) && /^(sub|flag):/.test(k))));

describe('start.teSrc on a board row', () => {
  it('is kept with the typed total, and the block still fits its 400 bytes', async () => {
    const { body } = await submit({ ...START, teSrc: 'typed', teTyped: 197 });
    const start = rowOf(body.id).start;
    expect(start.teSrc).toBe('typed');
    expect(start.teTyped).toBe(197);
    expect(JSON.stringify(start).length).toBeLessThanOrEqual(400);
  });
  it("keeps 'save' without a typed total", async () => {
    const { body } = await submit({ ...START, teSrc: 'save' });
    expect(rowOf(body.id).start.teSrc).toBe('save');
    expect(rowOf(body.id).start.teTyped).toBeUndefined();
  });
  it.each([
    ['an unknown source', { teSrc: 'guess' }],
    ['a number', { teSrc: 1 }],
  ])('drops %s, keeping the rest of the block', async (_n, extra) => {
    const { body } = await submit({ ...START, ...extra });
    const start = rowOf(body.id).start;
    expect(start.teSrc).toBeUndefined();
    expect(start.saveHash).toBe('a684e806');
  });
  it.each([491, -1, 3.5, 'x'])('drops a typed total of %s', async v => {
    const { body } = await submit({ ...START, teSrc: 'typed', teTyped: v });
    expect(rowOf(body.id).start.teTyped).toBeUndefined();
  });
});

describe('FLAG_TYPED_TE', () => {
  it('is off by default: a typed start ranks as before', async () => {
    const { body } = await submit({ ...START, teSrc: 'typed', teTyped: 197 });
    expect(body.flagged).toBeUndefined();
    expect(keysOf('sub:')).toHaveLength(1);
    expect(keysOf('flag:')).toHaveLength(0);
  });
  it("with FLAG_TYPED_TE=1 a typed start goes to the flagged board with the flag 'typed-te'; the main board does not see it", async () => {
    env.FLAG_TYPED_TE = '1';
    const { body } = await submit({ ...START, teSrc: 'typed', teTyped: 197 });
    expect(body.ok).toBe(true);
    expect(body.flagged).toEqual(['typed-te']);
    expect(keysOf('sub:')).toHaveLength(0);
    expect(keysOf('flag:')).toHaveLength(1);
    expect((await (await call('/all')).json()).rows).toEqual([]);
  });
  it("leaves 'save', an absent source and an older page's row alone", async () => {
    env.FLAG_TYPED_TE = '1';
    expect((await submit({ ...START, teSrc: 'save' })).body.flagged).toBeUndefined();
    expect((await submit({ ...START })).body.flagged).toBeUndefined();
    expect((await submit(undefined)).body.flagged).toBeUndefined();
    expect(keysOf('flag:')).toHaveLength(0);
  });
  it('a client cannot send the flag itself', async () => {
    env.FLAG_TYPED_TE = '1';
    const res = await call('/submit', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '7.9.9.9', 'x-owner-token': 'a'.repeat(32) }, body: JSON.stringify({ schema: 3, chain: [195, 490], durationDays: 801, finalTE: 490, build: '2026-11-07T18:00:00.000Z', flags: ['typed-te'], start: START }) });
    expect((await res.json()).flagged).toBeUndefined();
  });
});
