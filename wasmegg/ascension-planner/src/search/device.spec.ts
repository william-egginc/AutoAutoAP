import { describe, expect, it } from 'vitest';
import { isSmallDevice } from './device';

const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
describe('isSmallDevice', () => {
  it('a phone or tablet browser', () => {
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
    expect(isSmallDevice({ userAgent: ipad, maxTouchPoints: 5, hardwareConcurrency: 8 })).toBe(true);
    expect(
      isSmallDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', hardwareConcurrency: 6 })
    ).toBe(true);
    expect(isSmallDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari', hardwareConcurrency: 8 })).toBe(
      true
    );
  });
  it('little memory or few cores', () => {
    expect(isSmallDevice({ userAgent: desktop, hardwareConcurrency: 8, deviceMemory: 4 })).toBe(true);
    expect(isSmallDevice({ userAgent: desktop, hardwareConcurrency: 2 })).toBe(true);
  });
  it('a desktop with memory and cores to spare, or nothing known', () => {
    expect(isSmallDevice({ userAgent: desktop, hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(isSmallDevice({ userAgent: desktop, hardwareConcurrency: 12 })).toBe(false);
    // Headless Chrome on an 8-thread Mac reports 4 cores and 16 GB.
    expect(isSmallDevice({ userAgent: desktop, hardwareConcurrency: 4, deviceMemory: 16 })).toBe(false);
    expect(isSmallDevice({})).toBe(false);
  });
});

describe('isPhone (12 Oct 2026)', () => {
  const coarse = (w: number) => ({ innerWidth: w, matchMedia: () => ({ matches: true }) });
  const fine = (w: number) => ({ innerWidth: w, matchMedia: () => ({ matches: false }) });
  it('phones by user agent or a narrow touch screen; not tablets or computers', async () => {
    const { isPhone } = await import('./device');
    expect(isPhone({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, fine(1200))).toBe(true);
    expect(isPhone({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari' }, fine(1200))).toBe(true);
    expect(isPhone({ userAgent: 'Mozilla/5.0 (Macintosh)' }, coarse(390))).toBe(true);
    expect(isPhone({ userAgent: 'Mozilla/5.0 (Macintosh)' }, coarse(1024))).toBe(false);
    expect(isPhone({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }, fine(390))).toBe(false);
  });
});
