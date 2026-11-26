/**
 * spec-firsttour2 (9 Nov 2026, Jordan: "can we have a dummy site or pictures and grey out everything but what's in
 * focus"): the slideshow's pictures. Real screens of a sample account ("Sample", scrubbed save, no player ID) with the
 * spotlight baked in, made by ~/code/aaap-tools/harness-r7/tutorial-v2/make-tour-images.mjs, shipped as vite-hashed
 * assets in src/assets/tour/. Light (WebP, each under 60 KB), one set per form, alt text for each.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUR_FILES, TOUR_SLIDES, buildSlide, sharesPicture, slidesFor } from './tourSlides';
import { FIRST_TOUR_ALT } from './firstTourWords';


describe('tour slides', () => {
  it('seven slides in the quick tour (Jordan, 18 Nov 2026: cut to about 8, ending with More in the Full tour; 19 Nov: the load slide dropped); every step keeps its own picture pair, for the full tour', () => {
    expect(TOUR_SLIDES.map(s => s.id)).toEqual(['tabAuto', 'goalTarget', 'result', 'follow', 'myrunsPage', 'setupWhere', 'closing']);
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

  it('every slide has a desk and a phone picture and alt text; every WebP is a real WebP under 80 KB (the Science tab page is all text; 2x: 780x880 phone, the Instant Answer slide 780x1120, 1440x812 desk), and all together (the first tour and the full tour, both forms) under 3.5 MB (a visitor loads one form of one tour: a few hundred KB)', () => {
    const dir = new URL('../assets/tour/', import.meta.url);
    let total = 0;
    for (const f of readdirSync(dir).filter(n => n.endsWith('.webp'))) {
      const buf = readFileSync(new URL(f, dir));
      expect(`${f} ${buf.subarray(0, 4).toString('latin1')}${buf.subarray(8, 12).toString('latin1')}`).toBe(`${f} RIFFWEBP`);
      expect(buf.length, f).toBeLessThan(80_000);
      total += buf.length;
    }
    expect(total).toBeLessThan(3_500_000);
    for (const s of TOUR_SLIDES) {
      expect(FIRST_TOUR_ALT[s.id].length).toBeGreaterThan(20);
      expect(s.desk.width).toBe(720);
      expect(s.phone.width).toBe(390);
      expect(s.desk.src).not.toBe(s.phone.src);
    }
  });

  it('slides that share a page picture are neighbours the dialog slides between (sharesPicture); a slide with its own picture fades', () => {
    // The quick tour is seven slides now; the pictures of the others are still the full tour's.
    const by = (id: keyof typeof TOUR_FILES) => buildSlide(id, TOUR_FILES[id]);
    // Each tab slide is its own page now (17 Nov 2026), so Manual and Auto Planner fade; Chain Finder's page is Target TE's.
    expect(sharesPicture(by('tabManual'), by('tabAuto'))).toBe(false);
    // A sub-tab slide shows that sub-tab SELECTED (17 Nov 2026, Jordan): By a date is its own picture, Target TE's is the filters slide's.
    expect(sharesPicture(by('goalTarget'), by('goalDate'))).toBe(false);
    // Goals boxes BOTH switches (26 Nov 2026, Jordan), so it is a baked picture of its own, shared with no slide.
    expect(by('goalTarget').overlay).toBeUndefined();
    expect(sharesPicture(by('goalTarget'), by('filters'))).toBe(false);
    expect(by('goalTarget').desk.src).toMatch(/6-goal-target-desk/);
    expect(by('goalTarget').phone.src).toMatch(/6-goal-target-phone/);
    expect(sharesPicture(by('tabMyruns'), by('myrunsPage'))).toBe(true);
    expect(sharesPicture(by('load'), by('goalTarget'))).toBe(false);
    expect(sharesPicture(null, by('tabAuto'))).toBe(false);
    // Fewer pictures than slides: that is the point of sharing.
    expect(new Set((Object.keys(TOUR_FILES) as (keyof typeof TOUR_FILES)[]).map(id => by(id).desk.src)).size).toBeLessThan(Object.keys(TOUR_FILES).length - 5);
  });

  it('a save file with no player ID: six slides (no My Runs slide), ending at the closing card', () => {
    expect(slidesFor({ hasAccount: false, hasSaveFile: true }).map(s => s.id)).toEqual(['tabAuto', 'goalTarget', 'result', 'follow', 'setupWhere', 'closing']);
    expect(slidesFor({ hasAccount: true, hasSaveFile: false })).toHaveLength(7);
    expect(slidesFor({ hasAccount: false, hasSaveFile: false })).toHaveLength(7);
  });

  it('imported, so vite hashes them (not public/): the module globs src/assets/tour/ and resolves each picture to a URL', () => {
    const src = readFileSync(new URL('./tourSlides.ts', import.meta.url), 'utf8');
    expect(src).toContain("import.meta.glob('../assets/tour/*.webp'");
    for (const s of TOUR_SLIDES) for (const u of [s.desk.src, s.phone.src]) expect(u).toMatch(/\.webp/);
  });
});

describe('a slide\'s picture shape is its real crop (R10.3, 26 Nov 2026)', () => {
  it('the phone picture of a taller crop reports its own height, so the dialog caps its width and the caption fits the phone', () => {
    const by = (id: keyof typeof TOUR_FILES) => buildSlide(id, TOUR_FILES[id]);
    const r = by('result');
    expect(r.phone.height).toBeGreaterThan(440);
    expect(r.phone.height).toBeLessThanOrEqual(600);
    expect(by('follow').phone.height).toBe(440);
  });
});
