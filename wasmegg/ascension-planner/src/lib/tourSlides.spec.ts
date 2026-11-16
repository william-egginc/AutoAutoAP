/**
 * spec-firsttour2 (9 Nov 2026, Jordan: "can we have a dummy site or pictures and grey out everything but what's in
 * focus"): the slideshow's pictures. Real screens of a sample account ("Sample", scrubbed save, no player ID) with the
 * spotlight baked in, made by ~/code/aaap-tools/harness-r7/tutorial-v2/make-tour-images.mjs, shipped as vite-hashed
 * assets in src/assets/tour/. Light (WebP, each under 25 KB), one set per form, alt text for each.
 */
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUR_IMAGES, TOUR_SLIDES, slidesFor } from './tourSlides';
import { FIRST_TOUR_ALT } from './firstTourWords';

const asset = (n: string) => new URL(`../assets/tour/${n}`, import.meta.url);

describe('tour slides', () => {
  it('fifteen slides in order (tour v3, spec-tour-v3, Jordan, 16 Nov 2026: one thing a slide, big things first; the tab row is four slides, the goal switch two); each has its own picture pair', () => {
    expect(TOUR_SLIDES.map(s => s.id)).toEqual(['tabManual', 'tabAuto', 'tabChain', 'tabMyruns', 'load', 'goalTarget', 'goalDate', 'date', 'firstStep', 'simulate', 'follow', 'tracker', 'setupWhere', 'setup', 'moreWhere']);
    const files: Record<string, string> = {
      tabManual: '1-tab-manual', tabAuto: '2-tab-auto', tabChain: '3-tab-chain', tabMyruns: '4-tab-myruns', load: '5-load',
      goalTarget: '6-goal-target', goalDate: '7-goal-date', date: '8-date', firstStep: '9-first-step', simulate: '10-simulate',
      follow: '11-follow', tracker: '12-tracker', setupWhere: '13-setup-where', setup: '14-setup', moreWhere: '15-more-where',
    };
    for (const [id, f] of Object.entries(files)) expect(TOUR_IMAGES[id as keyof typeof TOUR_IMAGES]).toEqual({ desk: `${f}-desk.webp`, phone: `${f}-phone.webp` });
  });

  it('every slide has a desk and a phone WebP, each under 25 KB and a few hundred KB in all, with alt text', () => {
    let total = 0;
    for (const s of TOUR_SLIDES) {
      expect(FIRST_TOUR_ALT[s.id].length).toBeGreaterThan(20);
      expect(s.desk.width).toBe(720);
      expect(s.phone.width).toBe(390);
      for (const n of [TOUR_IMAGES[s.id].desk, TOUR_IMAGES[s.id].phone]) {
        const bytes = statSync(asset(n)).size;
        const head = readFileSync(asset(n)).subarray(0, 12).toString('latin1');
        expect(`${n} ${head.slice(0, 4)}${head.slice(8, 12)}`).toBe(`${n} RIFFWEBP`);
        expect(bytes).toBeLessThan(25_000);
        total += bytes;
      }
    }
    expect(total).toBeLessThan(300_000);
  });

  it('a save file with no player ID: ten slides (no My runs tab), Simulate this plan included, ending at Follow this route', () => {
    expect(slidesFor({ hasAccount: false, hasSaveFile: true }).map(s => s.id)).toEqual(['tabManual', 'tabAuto', 'tabChain', 'load', 'goalTarget', 'goalDate', 'date', 'firstStep', 'simulate', 'follow']);
    expect(slidesFor({ hasAccount: true, hasSaveFile: false })).toHaveLength(15);
    expect(slidesFor({ hasAccount: false, hasSaveFile: false })).toHaveLength(15);
  });

  it('imported, so vite hashes them (not public/): the module imports each file', () => {
    const src = readFileSync(new URL('./tourSlides.ts', import.meta.url), 'utf8');
    for (const s of TOUR_SLIDES) for (const n of [TOUR_IMAGES[s.id].desk, TOUR_IMAGES[s.id].phone]) expect(src).toContain(`@/assets/tour/${n}'`);
  });
});
