import { describe, expect, it } from 'vitest';
import { gearCoverage, prefetchAllowed, prefetchFiles, prefetchPlan } from './tablePrefetch';
import type { TableEntry } from './tableBracket';

const entries: TableEntry[] = [
  { file: 'table-v2.bin', bonus: 128.71, k: 1, from: 120 },
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
      'table-v2.bin',
    ]);
    // An own table that starts above the player's TE is no use to them.
    expect(prefetchPlan({ entries, own: 'acct-own.bin', gear: 'gear-mine.bin', player: null, te: 130 })).toEqual([
      'gear-mine.bin',
      'table-v2.bin',
    ]);
  });
  it('a gear table under the first name tried that is listed, as a file or an alias', () => {
    const aliased: TableEntry[] = entries.map(e =>
      e.file === 'gear-mine.bin' ? { ...e, aliases: ['gear-canon.bin'] } : e
    );
    expect(
      prefetchPlan({ entries: aliased, own: null, gear: ['gear-canon.bin', 'gear-mine.bin'], player: null, te: 150 })
    ).toEqual(['gear-canon.bin', 'table-v2.bin']);
    // Not aliased yet: the legacy name the page falls back to.
    expect(
      prefetchPlan({ entries, own: null, gear: ['gear-canon.bin', 'gear-mine.bin'], player: null, te: 150 })
    ).toEqual(['gear-mine.bin', 'table-v2.bin']);
  });
  it('else the maxed table, then the nearest tables above and below (none for maxed gear)', () => {
    expect(
      prefetchPlan({ entries, own: null, gear: 'gear-none.bin', player: { bonus: 125, k: 0.9 }, te: 150 })
    ).toEqual(['table-v2.bin', 'acct-own.bin', 'gear-weak.bin']); // another account's table can be the nearer one
    expect(prefetchPlan({ entries, own: null, gear: null, player: { bonus: 128.71, k: 1 }, te: 150 })).toEqual([
      'table-v2.bin',
    ]);
  });
});

describe('prefetchPlan beside the version 1 maxed table', () => {
  it('table-v2.bin, never table.bin (kept on the site for older pages)', () => {
    const both: TableEntry[] = [{ file: 'table.bin', bonus: 128.71, k: 1, from: 120 }, ...entries];
    expect(prefetchPlan({ entries: both, own: null, gear: 'gear-none.bin', player: { bonus: 125, k: 0.9 }, te: 150 })).toEqual([
      'table-v2.bin',
      'acct-own.bin',
      'gear-weak.bin',
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

describe('gearCoverage', () => {
  const entries = [
    { file: 'table-v2.bin', bonus: 128.71, k: 1, from: 100 },
    { file: 'acct-aaa.bin', bonus: 128.71, k: 1, from: 100 },
    { file: 'gear-old.bin', bonus: 120, k: 0.9, from: 100, aliases: ['gear-new.bin'] },
  ];
  it('own table first, then a gear table by file or alias, else none', () => {
    expect(gearCoverage(entries, 'acct-aaa.bin', ['gear-x.bin'])).toBe('own');
    expect(gearCoverage(entries, 'acct-bbb.bin', ['gear-new.bin', 'gear-zzz.bin'])).toBe('gear');
    expect(gearCoverage(entries, 'acct-bbb.bin', ['gear-zzz.bin', 'gear-old.bin'])).toBe('gear');
    expect(gearCoverage(entries, null, ['gear-zzz.bin'])).toBe('none');
    expect(gearCoverage(entries, 'acct-bbb.bin', [])).toBe('none');
  });
});

describe('.v2 names (an own or gear table of version 2 beside the version 1 one older pages read)', () => {
  const both: TableEntry[] = [
    { file: 'table-v2.bin', bonus: 128.71, k: 1, from: 120 },
    { file: 'acct-own.bin', bonus: 126.4, k: 0.94, from: 138 },
    { file: 'acct-own.v2.bin', bonus: 126.4, k: 0.94, from: 138 },
    { file: 'gear-mine.bin', bonus: 121.6, k: 0.94, from: 120, aliases: ['gear-canon.bin'] },
    { file: 'gear-mine.v2.bin', bonus: 121.6, k: 0.94, from: 120, aliases: ['gear-canon.v2.bin'] },
    { file: 'gear-weak.bin', bonus: 115.28, k: 0.71, from: 120 },
  ];
  const own = ['acct-own.v2.bin', 'acct-own.bin'];
  const gear = ['gear-canon.v2.bin', 'gear-mine.v2.bin', 'gear-canon.bin', 'gear-mine.bin'];

  it('the own table under its .v2 name when listed, else the plain one', () => {
    expect(prefetchPlan({ entries: both, own, gear, player: null, te: 150 })).toEqual(['acct-own.v2.bin']);
    const plainOnly = both.filter(e => e.file !== 'acct-own.v2.bin');
    expect(prefetchPlan({ entries: plainOnly, own, gear, player: null, te: 150 })).toEqual(['acct-own.bin']);
  });

  it('the gear table under its first .v2 name listed (file or alias), else a plain one', () => {
    expect(prefetchPlan({ entries: both, own: null, gear, player: null, te: 150 })).toEqual(['gear-canon.v2.bin', 'table-v2.bin']);
    const plainOnly = both.filter(e => !e.file.endsWith('.v2.bin') || e.file === 'table-v2.bin');
    expect(prefetchPlan({ entries: plainOnly, own: null, gear, player: null, te: 150 })).toEqual(['gear-canon.bin', 'table-v2.bin']);
  });

  it('the nearest tables: the .v2 file, never its plain twin', () => {
    expect(
      prefetchPlan({ entries: both, own: null, gear: ['gear-none.bin'], player: { bonus: 125, k: 0.9 }, te: 150 })
    ).toEqual(['table-v2.bin', 'acct-own.v2.bin', 'gear-weak.bin']);
  });

  it('gearCoverage: either own name, any gear name', () => {
    expect(gearCoverage(both, own, [])).toBe('own');
    expect(gearCoverage(both.filter(e => e.file !== 'acct-own.v2.bin'), own, [])).toBe('own');
    expect(gearCoverage(both, ['acct-x.v2.bin', 'acct-x.bin'], gear)).toBe('gear');
    expect(gearCoverage(both, ['acct-x.v2.bin', 'acct-x.bin'], ['gear-z.v2.bin', 'gear-z.bin'])).toBe('none');
  });
});
