import { describe, expect, it } from 'vitest';
import { BY_DATE_LEVELS, simpleByDateSpace, simpleWidth, widthForLevel } from './simpleByDate';
import { countBandShapes } from './deadline';

describe('Simple By a date space', () => {
  it('centres a chain on the instant route for each count, narrower for more stops', () => {
    expect([1, 2, 3, 4, 5, 6, 8].map(simpleWidth)).toEqual([3, 3, 3, 2, 2, 1, 1]);
    const s = simpleByDateSpace({
      currentTE: 150,
      routes: { 1: [300], 2: [230, 310], 3: [190, 250, 320], 4: [170, 210, 260, 325] },
    })!;
    expect(s.rows.map(r => r.asc)).toEqual([1, 2, 3, 4]);
    expect(s.rows[0].text).toBe('');
    expect(s.rows[1].text).toBe('227-233:1');
    expect(s.rows[2].text).toBe('187-193:1; 247-253:1');
    expect(s.rows[3].text).toBe('168-172:1; 208-212:1; 258-262:1');
    // The last stop starts around the instant answer's own last stops.
    expect([s.lastLo, s.lastHi]).toEqual([295, 330]);
  });

  it('keeps the boxes above the current TE and leaves out routes that cannot be played', () => {
    const s = simpleByDateSpace({
      currentTE: 150,
      routes: { 2: [152, 300], 3: [140, 200, 300], 4: [160, 160, 200, 300] },
    })!;
    expect(s.rows.map(r => r.asc)).toEqual([2]);
    expect(s.rows[0].bands[0][0]).toBe(151);
  });

  it('narrows a chain that would be too big, down to the instant route alone', () => {
    const route = [160, 180, 200, 220, 240, 260, 280, 300, 320, 340];
    const s = simpleByDateSpace({ currentTE: 150, routes: { 10: route }, maxSetsPerRow: 1000 })!;
    // ±1 is 3^9 = 19,683 sets: over 1,000, so only the instant route itself.
    expect(s.rows[0].width).toBe(0);
    expect(s.rows[0].text).toBe('160; 180; 200; 220; 240; 260; 280; 300; 320');
  });

  it('narrows the biggest chain first to stay inside the time', () => {
    const routes = { 3: [190, 250, 320], 5: [170, 200, 240, 280, 330] };
    const secondsOf = (sp: { rows: { bands: number[][] }[]; lastHi: number }) =>
      sp.rows.reduce((a, r) => a + countBandShapes(r.bands, 150, sp.lastHi), 0);
    const wide = simpleByDateSpace({ currentTE: 150, routes })!;
    expect(wide.rows.map(r => r.width)).toEqual([3, 2]);
    const s = simpleByDateSpace({ currentTE: 150, routes, secondsOf, maxSeconds: 200 })!;
    // 5 stops at ±2 is 625 sets; at ±1, 81; with 3 stops at ±3 (49) that fits 200.
    expect(s.rows.map(r => r.width)).toEqual([3, 1]);
  });

  it('is null without a route to centre on', () => {
    expect(simpleByDateSpace({ currentTE: 150, routes: {} })).toBeNull();
  });
});

describe('By a date levels (12 Oct 2026)', () => {
  it('each level gives each early stop more TE either side, and more room before narrowing', () => {
    expect([widthForLevel('quick')(3), widthForLevel('normal')(3), widthForLevel('thorough')(3)]).toEqual([3, 4, 5]);
    expect([widthForLevel('quick')(6), widthForLevel('thorough')(6)]).toEqual([1, 3]);
    expect(BY_DATE_LEVELS.quick.maxSeconds).toBeLessThan(BY_DATE_LEVELS.normal.maxSeconds);
    expect(BY_DATE_LEVELS.normal.maxSeconds).toBeLessThan(BY_DATE_LEVELS.thorough.maxSeconds);
  });
  it('a wider level searches more sets around the same routes', () => {
    const routes = { 3: [160, 200, 248], 4: [161, 198, 218, 248] };
    const sets = (l: 'quick' | 'normal' | 'thorough') =>
      simpleByDateSpace({ currentTE: 141, routes, widthFor: widthForLevel(l), maxSetsPerRow: BY_DATE_LEVELS[l].maxSetsPerRow })!.rows.map(
        r => r.bands.reduce((n, b) => n * b.length, 1)
      );
    expect(sets('quick')).toEqual([49, 125]);
    expect(sets('normal')).toEqual([81, 343]);
    expect(sets('thorough')).toEqual([121, 729]);
  });
});
