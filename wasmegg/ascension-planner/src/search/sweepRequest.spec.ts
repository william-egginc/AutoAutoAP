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
      forceContinue: null,
    });
  });

  it('carries force-continue both ways, and leaves it alone when unset', () => {
    const base = { preset: 'M1', label: 'M1', bands: '181-489:1', minGap: 0 };
    expect(parseSweepRequest(sweepRequestQuery({ ...base, forceContinue: true }))?.forceContinue).toBe(true);
    expect(parseSweepRequest(sweepRequestQuery({ ...base, forceContinue: false }))?.forceContinue).toBe(false);
    expect(parseSweepRequest(sweepRequestQuery(base))?.forceContinue).toBeNull();
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
    const href = `https://x.test/p/${sweepRequestQuery({ preset: 'F2', label: 'F2', bands: '181-250:1', minGap: 10, forceContinue: true })}&playerId=EI1#/auto/fastest/full`;
    expect(parseSweepRequest(new URL(href).search)).not.toBeNull();
    const out = withoutSweepParams(href);
    expect(out).toBe('https://x.test/p/?insane=1&playerId=EI1#/auto/fastest/full');
    expect(parseSweepRequest(new URL(out).search)).toBeNull();
  });
});
