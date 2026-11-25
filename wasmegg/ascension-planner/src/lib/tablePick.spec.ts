/**
 * The "which table answered" ping (R10.1, Jordan, 25 Nov 2026): on by default, off with the Setup tick, a stored No or a
 * Withdraw stays off. One tiny POST to the collector's /tablepick, once a day per browser per combination. It carries
 * no player ID, account code, hash, stamp or timestamp. Counts are answers shown (browser-days), never players.
 * Placeholder ID only; no real one anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TE_EDGES, dayOf, sendTablePick, tablePickOf, tablePickUrlOf, teEdge, type PickInput } from './tablePick';

const base: PickInput = { kind: 'gear', delivery: 'T4L-T4E-T4L', te: 212, build: 'abc1234' };

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const run = (i: PickInput, o: Partial<Parameters<typeof sendTablePick>[1]> = {}) => {
  const sent: { url: string; body: string }[] = [];
  const st = store();
  const opts = { url: 'https://c.example/tablepick', enabled: () => true, now: () => Date.UTC(2026, 10, 25, 12), storage: st, post: (url: string, body: string) => void sent.push({ url, body }), ...o };
  return { sent, st, go: (x: PickInput = i) => sendTablePick(x, opts) };
};

describe('the fixed TE edges (Collector pins the same list in worker code)', () => {
  it('are exactly these eleven, and line up with the table edges 75, 150 and 340', () => {
    expect([...TE_EDGES]).toEqual([0, 50, 75, 100, 125, 150, 200, 250, 300, 340, 400]);
    for (const e of [75, 150, 340]) expect(TE_EDGES).toContain(e);
  });
  it('a TE goes to the largest edge at or below it; nothing for a bad TE', () => {
    expect(teEdge(0)).toBe(0);
    expect(teEdge(74.9)).toBe(50);
    expect(teEdge(75)).toBe(75);
    expect(teEdge(212)).toBe(200);
    expect(teEdge(339)).toBe(300);
    expect(teEdge(340)).toBe(340);
    expect(teEdge(900)).toBe(400);
    for (const bad of [-1, NaN, Infinity, undefined as unknown as number]) expect(teEdge(bad)).toBeNull();
  });
});

describe('what is in the ping', () => {
  it('exactly the agreed keys, nothing else', () => {
    expect(tablePickOf(base)).toEqual({ kind: 'gear', delivery: 'T4L-T4E-T4L', te: 200, build: 'abc1234' });
    expect(Object.keys(tablePickOf({ ...base, kind: 'delivery', answered: 'T3E-X-T2E', noTable: false })!).sort()).toEqual(
      ['answered', 'build', 'delivery', 'kind', 'noTable', 'te']
    );
  });
  it('answered only for kind delivery, and delivery kind needs a valid one', () => {
    expect(tablePickOf({ ...base, kind: 'gear', answered: 'T3E-X-T2E' })).not.toHaveProperty('answered');
    expect(tablePickOf({ ...base, kind: 'delivery', answered: 'bad key!' })).toBeNull();
    expect(tablePickOf({ ...base, kind: 'delivery' })).toBeNull();
  });
  it('a bad own key is left out and the rest still goes; a bad kind or TE sends nothing', () => {
    expect(tablePickOf({ ...base, delivery: 'x'.repeat(25) })).not.toHaveProperty('delivery');
    expect(tablePickOf({ ...base, kind: 'weird' as never })).toBeNull();
    expect(tablePickOf({ ...base, te: NaN })).toBeNull();
  });
  it('a value that holds a player ID shape is never sent', () => {
    const id = 'EI1234567890123456';
    expect(tablePickOf({ ...base, delivery: id })).not.toHaveProperty('delivery');
    expect(JSON.stringify(tablePickOf({ ...base, build: id }))).not.toMatch(/EI\d{16}/i);
  });
  it('build is the page build, or unknown', () => {
    expect(tablePickOf({ ...base, build: '' })!.build).toBe('unknown');
    expect(tablePickOf({ ...base, build: 'not ok!' })!.build).toBe('unknown');
  });
  it('under 256 bytes, with no stamp, hash, account code or time', () => {
    const body = JSON.stringify(tablePickOf({ ...base, kind: 'delivery', answered: 'T4L-T4E-T4L-T4L-T4L-T4', noTable: true })!);
    expect(body.length).toBeLessThanOrEqual(256);
    expect(body).not.toMatch(/stamp|hash|partition|account|time|at"/i);
  });
});

describe('the address', () => {
  it('the collector’s /submit becomes /tablepick; no collector, no address', () => {
    expect(tablePickUrlOf('https://c.example/submit')).toBe('https://c.example/tablepick');
    expect(tablePickUrlOf('https://c.example/submit/')).toBe('https://c.example/tablepick');
    expect(tablePickUrlOf('')).toBe('');
    expect(tablePickUrlOf('https://c.example/other')).toBe('');
  });
});

describe('sending', () => {
  it('sends one plain-text JSON body to the address', () => {
    const r = run(base);
    expect(r.go()).toBe(true);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].url).toBe('https://c.example/tablepick');
    expect(JSON.parse(r.sent[0].body)).toEqual({ kind: 'gear', delivery: 'T4L-T4E-T4L', te: 200, build: 'abc1234' });
  });
  it('nothing with the consent off, with no address, or offline', () => {
    const off = run(base, { enabled: () => false });
    expect(off.go()).toBe(false);
    expect(off.sent).toHaveLength(0);
    const none = run(base, { url: '' });
    expect(none.go()).toBe(false);
    expect(none.sent).toHaveLength(0);
    const down = run(base, { online: () => false });
    expect(down.go()).toBe(false);
    expect(down.sent).toHaveLength(0);
  });
  it('once a day per browser per combination: the same again is not sent, another combination is, a new day is', () => {
    let now = Date.UTC(2026, 10, 25, 12);
    const r = run(base, { now: () => now });
    r.go();
    r.go();
    expect(r.sent).toHaveLength(1);
    r.go({ ...base, te: 260 });
    expect(r.sent).toHaveLength(2);
    r.go({ ...base, te: 215 }); // the same edge as 212 (200): the same combination
    expect(r.sent).toHaveLength(2);
    now += 24 * 3600 * 1000;
    r.go();
    expect(r.sent).toHaveLength(3);
  });
  it('the day is UTC, and what is kept in storage holds the day and the combinations only', () => {
    expect(dayOf(Date.UTC(2026, 10, 25, 23, 59))).toBe('2026-11-25');
    const r = run(base);
    r.go();
    const kept = [...r.st.m.values()].join('');
    expect(kept).toContain('2026-11-25');
    expect(kept).not.toMatch(/EI\d{16}/i);
  });
  it('blocked storage: once per visit from memory, and no throw', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => undefined };
    const r = run(base, { storage: broken });
    expect(() => r.go()).not.toThrow();
    r.go();
    expect(r.sent.length).toBeLessThanOrEqual(1);
  });
  it('a failing post changes nothing and never throws', () => {
    const r = run(base, { post: () => { throw new Error('net'); } });
    expect(() => r.go()).not.toThrow();
  });
});

describe('the words never say players', () => {
  const src = fs.readFileSync(path.join(__dirname, 'tablePick.ts'), 'utf8');
  it('this file holds no player-facing words', () => {
    expect(src).not.toMatch(/['"`][^'"`\n]*\bplayers\b[^'"`\n]*['"`]/);
  });
});
