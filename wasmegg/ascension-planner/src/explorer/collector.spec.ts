import { describe, it, expect } from 'vitest';
import { parseRunCsv, resolveCollectorBase, inflateIfGzip } from './collector';

/** A CSV in the shape `search/csv.ts` writes: comment block, header, then one row per leg. */
const SAMPLE = [
  '# ascension-planner chain search — every chain this run priced',
  '# generated 2026-09-20 12:02 (America/Denver)',
  '# current TE 132 -> final target 490',
  '# chains priced 3',
  '#',
  'rank,chain,prestiges,total_days,gap_days,leg,target_te,strategy,sales,tier13,leg_start_local',
  '1,140 200 490,3,952.3099,0.0000,1,140,continue,1,no,2026-09-19 13:50',
  '1,140 200 490,3,952.3099,0.0000,2,200,3-sale,3,no,2026-10-02 22:35',
  '1,140 200 490,3,952.3099,0.0000,3,490,2-sale-tier13,2,yes,2027-04-05 01:42',
  '2,235 490,2,1285.4207,333.1108,,,,,,',
  '3,236 490,2,1290.3328,338.0229,,,,,,',
  '',
].join('\n');

describe('parseRunCsv', () => {
  it('reads the journey out of the comment block', () => {
    const parsed = parseRunCsv(SAMPLE);
    expect(parsed.currentTE).toBe(132);
    expect(parsed.finalTE).toBe(490);
  });

  it('collapses one-row-per-leg back into one entry per chain', () => {
    // The three `140 200 490` rows are one chain's three legs, not three chains.
    const parsed = parseRunCsv(SAMPLE);
    expect(parsed.chains).toHaveLength(3);
    expect(parsed.chains[0]).toEqual({
      chain: [140, 200, 490],
      days: 952.3099,
      prestiges: 3,
      lastCheckpoint: 200,
    });
  });

  it('keeps the file order, which is the ranking', () => {
    const parsed = parseRunCsv(SAMPLE);
    expect(parsed.chains.map(c => c.days)).toEqual([952.3099, 1285.4207, 1290.3328]);
  });

  it('carries the last checkpoint, which is the axis the sawtooth shows up against', () => {
    expect(parseRunCsv(SAMPLE).chains[1].lastCheckpoint).toBe(235);
  });

  it('survives CRLF, which is what a spreadsheet hands back', () => {
    const parsed = parseRunCsv(SAMPLE.replace(/\n/g, '\r\n'));
    expect(parsed.chains).toHaveLength(3);
    expect(parsed.chains[0].chain).toEqual([140, 200, 490]);
  });

  it('reports what a cap dropped instead of silently shortening the table', () => {
    const parsed = parseRunCsv(SAMPLE, 1);
    expect(parsed.chains).toHaveLength(1);
    expect(parsed.truncated).toBe(2);
  });

  it('returns nothing rather than throwing on a file that is not one of ours', () => {
    const parsed = parseRunCsv('name,value\nalpha,1\nbeta,2\n');
    expect(parsed.chains).toEqual([]);
    expect(parsed.currentTE).toBe(0);
  });
});

describe('resolveCollectorBase', () => {
  it('takes the query parameter first, so a hosted copy can be pointed anywhere', () => {
    expect(resolveCollectorBase('?collector=https://c.example.dev')).toBe('https://c.example.dev');
  });

  it('strips a /submit, since that is the URL people have to hand', () => {
    expect(resolveCollectorBase('?collector=https://c.example.dev/submit')).toBe('https://c.example.dev');
    expect(resolveCollectorBase('?collector=https://c.example.dev/')).toBe('https://c.example.dev');
  });

  it('refuses a non-http scheme in the query parameter', () => {
    // This page is meant to be linked around, and a link that makes it fetch a `javascript:` or
    // `data:` URL is the shape of every "just click this" attack.
    expect(resolveCollectorBase('?collector=javascript:alert(1)')).toBeNull();
    expect(resolveCollectorBase('?collector=data:text/html,x')).toBeNull();
  });

  it('falls back to the build-time collector when no query parameter is given', () => {
    // Asserted against whatever this checkout is configured with rather than a fixed string: a
    // fork with no collector must get null, and one with a .env.local must get its own URL minus
    // the /submit. Both are correct answers and which one applies is a property of the machine.
    const configured = import.meta.env.VITE_SUBMIT_URL as string | undefined;
    const expected = configured ? configured.replace(/\/submit\/?$/, '').replace(/\/$/, '') : null;
    expect(resolveCollectorBase('')).toBe(expected);
  });
});

describe('inflateIfGzip', () => {
  it('passes plain bytes through as text', async () => {
    const bytes = new TextEncoder().encode('rank,chain\n1,195 490\n');
    await expect(inflateIfGzip(bytes)).resolves.toContain('195 490');
  });

  it('inflates a gzip member, which is what the collector always sends', async () => {
    // The Worker serves `application/gzip` with no content-encoding on purpose (its own comment
    // explains: the CDN double-compresses anything it thinks is text), so nothing inflates these
    // bytes unless this does.
    const gz = new Response(
      new Blob([new TextEncoder().encode('hello chains')]).stream().pipeThrough(new CompressionStream('gzip'))
    );
    const bytes = new Uint8Array(await gz.arrayBuffer());
    expect(bytes[0]).toBe(0x1f);
    await expect(inflateIfGzip(bytes)).resolves.toBe('hello chains');
  });
});
