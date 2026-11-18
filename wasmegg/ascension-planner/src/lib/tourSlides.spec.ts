/**
 * spec-firsttour2 (9 Nov 2026, Jordan: "can we have a dummy site or pictures and grey out everything but what's in
 * focus"): the slideshow's pictures. Real screens of a sample account ("Sample", scrubbed save, no player ID) with the
 * spotlight baked in, made by ~/code/aaap-tools/harness-r7/tutorial-v2/make-tour-images.mjs, shipped as vite-hashed
 * assets in src/assets/tour/. Light (WebP, each under 30 KB), one set per form, alt text for each.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUR_FILES, TOUR_SLIDES, sharesPicture, slidesFor } from './tourSlides';
import { FIRST_TOUR_ALT } from './firstTourWords';


describe('tour slides', () => {
  it('twenty-two slides in order (tour v3, spec-tour-v3, Jordan, 16 Nov 2026: one thing a slide, big things first; the tab row is four slides, the goal switch two); each has its own picture pair', () => {
    expect(TOUR_SLIDES.map(s => s.id)).toEqual(['tabManual', 'tabAuto', 'tabChain', 'tabMyruns', 'load', 'goalTarget', 'goalDate', 'result', 'filters', 'setupAwake', 'setupTimeOff', 'prefer', 'simulate', 'follow', 'myrunsPage', 'followedRoute', 'nextStep', 'tracker', 'shifts', 'setupWhere', 'setupInside', 'closing']);
    const files: Record<string, string> = {
      tabManual: '1-tab-manual',
      tabAuto: '2-tab-auto',
      tabChain: '3-tab-chain',
      tabMyruns: '4-tab-myruns',
      load: '5-load',
      goalTarget: '6-goal-target',
      goalDate: '7-goal-date',
      result: '8-result',
      filters: '9-filters',
      setupAwake: '10-setup-awake',
      setupTimeOff: '11-setup-time-off',
      prefer: '12-prefer',
      simulate: '14-simulate',
      follow: '15-follow',
      myrunsPage: '16-myruns-page',
      followedRoute: '17-followed-route',
      nextStep: '18-next-step',
      tracker: '19-tracker',
      setupWhere: '20-setup-where',
      setupInside: '21-setup-inside',
      shifts: '22-shifts',
      closing: '23-closing',
    };
    expect(TOUR_FILES).toEqual(files);
  });

  it('every slide has a desk and a phone picture and alt text; every WebP is a real WebP under 30 KB, and all together (the first tour and the full tour, both forms) under 900 KB (a visitor loads one form of one tour: 130 to 220 KB)', () => {
    const dir = new URL('../assets/tour/', import.meta.url);
    let total = 0;
    for (const f of readdirSync(dir).filter(n => n.endsWith('.webp'))) {
      const buf = readFileSync(new URL(f, dir));
      expect(`${f} ${buf.subarray(0, 4).toString('latin1')}${buf.subarray(8, 12).toString('latin1')}`).toBe(`${f} RIFFWEBP`);
      expect(buf.length, f).toBeLessThan(30_000);
      total += buf.length;
    }
    expect(total).toBeLessThan(900_000);
    for (const s of TOUR_SLIDES) {
      expect(FIRST_TOUR_ALT[s.id].length).toBeGreaterThan(20);
      expect(s.desk.width).toBe(720);
      expect(s.phone.width).toBe(390);
      expect(s.desk.src).not.toBe(s.phone.src);
    }
  });

  it('slides that share a page picture are neighbours the dialog slides between (sharesPicture); a slide with its own picture fades', () => {
    const by = (id: string) => TOUR_SLIDES.find(s => s.id === id)!;
    // Each tab slide is its own page now (17 Nov 2026), so Manual and Auto Planner fade; Chain Finder's page is Target TE's.
    expect(sharesPicture(by('tabManual'), by('tabAuto'))).toBe(false);
    // A sub-tab slide shows that sub-tab SELECTED (17 Nov 2026, Jordan): By a date is its own picture, Target TE's is the filters slide's.
    expect(sharesPicture(by('goalTarget'), by('goalDate'))).toBe(false);
    // The filters slide shares Target TE's picture on a desk; on a phone the wrapped Setup button needs its own (so, as a pair, no).
    expect(by('goalTarget').desk.src).toBe(by('filters').desk.src);
    expect(by('goalTarget').phone.src).not.toBe(by('filters').phone.src);
    expect(sharesPicture(by('tabMyruns'), by('myrunsPage'))).toBe(true);
    expect(sharesPicture(by('load'), by('goalTarget'))).toBe(false);
    expect(sharesPicture(null, by('tabAuto'))).toBe(false);
    // Fewer pictures than slides: that is the point of sharing.
    expect(new Set(TOUR_SLIDES.map(s => s.desk.src)).size).toBeLessThan(TOUR_SLIDES.length - 5);
  });

  it('a save file with no player ID: thirteen slides (no My runs tab), Simulate this plan included, ending at Follow this route', () => {
    expect(slidesFor({ hasAccount: false, hasSaveFile: true }).map(s => s.id)).toEqual(['tabManual', 'tabAuto', 'tabChain', 'load', 'goalTarget', 'goalDate', 'result', 'filters', 'setupAwake', 'setupTimeOff', 'prefer', 'simulate', 'follow']);
    expect(slidesFor({ hasAccount: true, hasSaveFile: false })).toHaveLength(22);
    expect(slidesFor({ hasAccount: false, hasSaveFile: false })).toHaveLength(22);
  });

  it('imported, so vite hashes them (not public/): the module globs src/assets/tour/ and resolves each picture to a URL', () => {
    const src = readFileSync(new URL('./tourSlides.ts', import.meta.url), 'utf8');
    expect(src).toContain("import.meta.glob('../assets/tour/*.webp'");
    for (const s of TOUR_SLIDES) for (const u of [s.desk.src, s.phone.src]) expect(u).toMatch(/\.webp/);
  });
});
