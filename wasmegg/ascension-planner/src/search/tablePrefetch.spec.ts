import { describe, expect, it } from 'vitest';
import { prefetchAllowed, prefetchFiles, prefetchPlan } from './tablePrefetch';
import type { TableEntry } from './tableBracket';

const entries: TableEntry[] = [
  { file: 'table.bin', bonus: 128.71, k: 1, from: 120 },
  { file: 'acct-own.bin', bonus: 126.4, k: 0.94, from: 138 },
  { file: 'gear-mine.bin', bonus: 121.6, k: 0.94, from: 120 },
  { file: 'gear-weak.bin', bonus: 115.28, k: 0.71, from: 120 },
  { file: 'gear-strong.bin', bonus: 127.93, k: 1, from: 120 },
];

describe('prefetchPlan', () => {
  it('the own table alone when the site has it', () => {
    expect(prefetchPlan({ entries, own: 'acct-own.bin', gear: 'gear-mine.bin', player: null, te: 150 })).toEqual([
      'acct-own.bin',
    ]);
  });
  it('else the gear table and the maxed one', () => {
    expect(prefetchPlan({ entries, own: 'acct-x.bin', gear: 'gear-mine.bin', player: null, te: 150 })).toEqual([
      'gear-mine.bin',
      'table.bin',
    ]);
    // An own table that starts above the player's TE is no use to them.
    expect(prefetchPlan({ entries, own: 'acct-own.bin', gear: 'gear-mine.bin', player: null, te: 130 })).toEqual([
      'gear-mine.bin',
      'table.bin',
    ]);
  });
  it('else the maxed table, then the nearest tables above and below (none for maxed gear)', () => {
    expect(
      prefetchPlan({ entries, own: null, gear: 'gear-none.bin', player: { bonus: 125, k: 0.9 }, te: 150 })
    ).toEqual(['table.bin', 'acct-own.bin', 'gear-weak.bin']); // another account's table can be the nearer one
    expect(prefetchPlan({ entries, own: null, gear: null, player: { bonus: 128.71, k: 1 }, te: 150 })).toEqual([
      'table.bin',
    ]);
  });
});

describe('prefetchAllowed', () => {
  const desktop = { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/129', hardwareConcurrency: 8, deviceMemory: 8 };
  it('on a desktop with a decent connection', () => {
    expect(prefetchAllowed({ ...desktop, connection: { effectiveType: '4g' } })).toBe(true);
    expect(prefetchAllowed(desktop)).toBe(true);
  });
  it('not with Save-Data, on 2G, or on a small device', () => {
    expect(prefetchAllowed({ ...desktop, connection: { saveData: true, effectiveType: '4g' } })).toBe(false);
    expect(prefetchAllowed({ ...desktop, connection: { effectiveType: '2g' } })).toBe(false);
    expect(prefetchAllowed({ ...desktop, connection: { effectiveType: 'slow-2g' } })).toBe(false);
    expect(prefetchAllowed({ ...desktop, hardwareConcurrency: 2 })).toBe(false);
    expect(prefetchAllowed({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' })).toBe(false);
  });
});

describe('prefetchFiles', () => {
  it('fetches each .gz in turn at low priority, skips what is missing, and never throws', async () => {
    const calls: string[] = [];
    let open = 0;
    const fetchFn = async (url: string, init: RequestInit & { priority?: string }) => {
      calls.push(`${url} ${init.priority}`);
      expect(open).toBe(0); // one at a time
      open++;
      await new Promise(r => setTimeout(r, 5));
      open--;
      if (url.includes('boom')) throw new Error('network');
      if (url.includes('missing')) return new Response('<html>', { headers: { 'content-type': 'text/html' } });
      return new Response(new Uint8Array(1000) as unknown as BodyInit);
    };
    const got = await prefetchFiles('/p/', ['a.bin', 'missing.bin', 'boom.bin', 'b.bin'], fetchFn);
    expect(got).toEqual(['a.bin', 'b.bin']);
    expect(calls).toEqual(['/p/a.bin.gz low', '/p/missing.bin.gz low', '/p/boom.bin.gz low', '/p/b.bin.gz low']);
  });
});
