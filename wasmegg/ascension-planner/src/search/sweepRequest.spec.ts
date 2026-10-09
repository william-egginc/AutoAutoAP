import { describe, expect, it } from 'vitest';
import { parseSweepRequest, sweepRequestQuery, withoutSweepParams } from './sweepRequest';

describe('sweep request links', () => {
  it('round-trips everything the Explorer puts in a link', () => {
    const q = sweepRequestQuery({ preset: 'M2', label: 'M2, 3 ascensions', bands: '181-280:2; 270-372:2', minGap: 10 });
    expect(q).toContain('insane=1');
    expect(parseSweepRequest(q)).toEqual({
      preset: 'M2',
      label: 'M2, 3 ascensions',
      bands: '181-280:2; 270-372:2',
      minGap: 10,
      firstAscension: null,
    });
  });

  it('carries the first ascension all three ways, and leaves it alone when unset', () => {
    const base = { preset: 'M1', label: 'M1', bands: '181-489:1', minGap: 0 };
    for (const first of ['auto', 'continue', 'fresh'] as const)
      expect(parseSweepRequest(sweepRequestQuery({ ...base, firstAscension: first }))?.firstAscension).toBe(first);
    expect(parseSweepRequest(sweepRequestQuery(base))?.firstAscension).toBeNull();
  });

  it('writes Continue and Fastest as the fc= links have always said them', () => {
    const base = { preset: 'M1', label: 'M1', bands: '181-489:1', minGap: 0 };
    expect(sweepRequestQuery({ ...base, firstAscension: 'continue' })).toContain('fc=1');
    expect(sweepRequestQuery({ ...base, firstAscension: 'auto' })).toContain('fc=0');
    expect(sweepRequestQuery({ ...base, firstAscension: 'fresh' })).toContain('first=fresh');
  });

  it('reads an old link: fc=1 is Continue Asc., fc=0 is Fastest', () => {
    expect(parseSweepRequest('?sweep=M1&bands=181-489:1&fc=1')?.firstAscension).toBe('continue');
    expect(parseSweepRequest('?sweep=M1&bands=181-489:1&fc=0')?.firstAscension).toBe('auto');
    // The old boolean still writes a link.
    const old = { preset: 'M1', label: 'M1', bands: '181-489:1', minGap: 0, forceContinue: true };
    expect(sweepRequestQuery(old)).toContain('fc=1');
  });

  it('ignores a first= it does not know', () => {
    expect(parseSweepRequest('?sweep=M1&bands=181-489:1&first=later')?.firstAscension).toBeNull();
  });

  it('never puts a player id in the link', () => {
    const q = sweepRequestQuery({ preset: 'M2', label: 'M2', bands: '181-280:2', minGap: 10 });
    expect(q).not.toMatch(/playerId|EI\d/);
  });

  it('refuses a malformed request rather than filling the panel with junk', () => {
    expect(parseSweepRequest('')).toBeNull();
    expect(parseSweepRequest('?insane=1')).toBeNull();
    expect(parseSweepRequest('?sweep=M2&bands=nonsense')).toBeNull();
    expect(parseSweepRequest('?sweep=<script>&bands=181-280:2')).toBeNull();
  });

  it('bounds a label that is too long', () => {
    const r = parseSweepRequest(`?sweep=M2&bands=181-280:2&label=${'x'.repeat(500)}`);
    expect(r?.label.length).toBe(80);
  });
});

describe('withoutSweepParams', () => {
  it('drops only the sweep link parameters, keeping the rest and the hash', () => {
    const href = `https://x.test/p/${sweepRequestQuery({ preset: 'F2', label: 'F2', bands: '181-250:1', minGap: 10, firstAscension: 'fresh' })}&playerId=EI1#/auto/fastest/full`;
    expect(parseSweepRequest(new URL(href).search)).not.toBeNull();
    const out = withoutSweepParams(href);
    expect(out).toBe('https://x.test/p/?insane=1&playerId=EI1#/auto/fastest/full');
    expect(parseSweepRequest(new URL(out).search)).toBeNull();
  });
});
