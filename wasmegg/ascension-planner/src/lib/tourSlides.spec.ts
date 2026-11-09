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
  it('eight slides in order (Jordan, 9 Nov 2026: Simulate this plan after the answer, and Setup as two: where it is, then inside); slide 6 is the Build-up tracker picture', () => {
    expect(TOUR_SLIDES.map(s => s.id)).toEqual(['load', 'goal', 'answer', 'simulate', 'follow', 'myruns', 'setupWhere', 'setup']);
    expect(TOUR_IMAGES.simulate).toEqual({ desk: '4-simulate-desk.webp', phone: '4-simulate-phone.webp' });
    expect(TOUR_IMAGES.myruns).toEqual({ desk: '6-tracker-desk.webp', phone: '6-tracker-phone.webp' });
    expect(TOUR_IMAGES.setupWhere).toEqual({ desk: '7-setup-where-desk.webp', phone: '7-setup-where-phone.webp' });
    expect(TOUR_IMAGES.setup).toEqual({ desk: '8-setup-desk.webp', phone: '8-setup-phone.webp' });
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

  it('a save file with no player ID: five slides, Simulate this plan included, ending at Follow this route', () => {
    expect(slidesFor({ hasAccount: false, hasSaveFile: true }).map(s => s.id)).toEqual(['load', 'goal', 'answer', 'simulate', 'follow']);
    expect(slidesFor({ hasAccount: true, hasSaveFile: false })).toHaveLength(8);
    expect(slidesFor({ hasAccount: false, hasSaveFile: false })).toHaveLength(8);
  });

  it('imported, so vite hashes them (not public/): the module imports each file', () => {
    const src = readFileSync(new URL('./tourSlides.ts', import.meta.url), 'utf8');
    for (const s of TOUR_SLIDES) for (const n of [TOUR_IMAGES[s.id].desk, TOUR_IMAGES[s.id].phone]) expect(src).toContain(`@/assets/tour/${n}'`);
  });
});
