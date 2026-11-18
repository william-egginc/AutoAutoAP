/**
 * The full tour's pictures (spec-fulltour, 14 Nov 2026; ~/code/aaap-tools/harness-r7/spec-fulltour/make-full-tour-images.mjs):
 * one desk and one phone picture per step (the first tour's own where they share a slide; the budget is lib/tourSlides.spec.ts's), and
 * fetched only when the full tour opens: nothing statically imports them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_TOUR_STEPS } from './fullTour';
import { FULL_TOUR_SLIDES } from './fullTourSlides';
import { TOUR_FILES, TOUR_SLIDES, buildSlide, sharesPicture } from './tourSlides';

const src = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('the full tour slides', () => {
  it("forty-two slides, one per step, in the tour's order, 720x406 desk and 390x440 phone (spec-tour-v4: the v3 style, plus everything inside More)", () => {
    expect(FULL_TOUR_STEPS).toHaveLength(42);
    expect(FULL_TOUR_SLIDES.map(s => s.id)).toEqual([...FULL_TOUR_STEPS]);
    for (const s of FULL_TOUR_SLIDES) {
      expect([s.desk.width, s.desk.height]).toEqual([720, 406]);
      expect([s.phone.width, s.phone.height]).toEqual([390, 440]);
    }
  });
  it("the slides it shares with the first tour use the first tour's pictures and overlays (no second copy)", () => {
    for (const id of ['load', 'goalTarget', 'goalDate', 'result', 'filters', 'setupAwake', 'setupTimeOff', 'prefer', 'simulate', 'follow', 'myrunsPage', 'followedRoute', 'nextStep', 'tracker', 'shifts', 'setupWhere', 'setupInside'] as const) {
      const full = FULL_TOUR_SLIDES.find(s => s.id === id)!;
      const first = buildSlide(id, TOUR_FILES[id]);
      expect(full.desk.src, id).toBe(first.desk.src);
      expect(full.phone.src, id).toBe(first.phone.src);
    }
  });
  it('every slide of More is live (its own overlay, desk and phone), so the ring slides between neighbours that share a picture', () => {
    for (const s of FULL_TOUR_SLIDES.filter(x => /^[mr]\d/.test(x.id))) expect(s.overlay, s.id).toBeDefined();
    const by = (id: string) => FULL_TOUR_SLIDES.find(s => s.id === id)!;
    expect(sharesPicture(by('m3fast'), by('m4exact'))).toBe(true);
    expect(sharesPicture(by('m4exact'), by('m5custom'))).toBe(true);
  });
  it('the optional tabs are shown on (their real state): the tab slides have pictures of their own, each a picture of its page (17 Nov 2026)', () => {
    const by = (id: string) => FULL_TOUR_SLIDES.find(s => s.id === id)!;
    expect(sharesPicture(by('tabManual'), by('tabLeaderboard'))).toBe(false);
    expect(new Set(['tabManual', 'tabAuto', 'tabChain', 'tabLeaderboard', 'tabScience'].map(id => by(id).desk.src)).size).toBe(5);
    expect(by('tabManual').desk.src).not.toBe(buildSlide('tabManual', TOUR_FILES.tabManual).desk.src);
  });
  it('fetched only when the tour opens: the modal imports the slides dynamically, nothing else imports them', () => {
    expect(src('components/TourModal.vue')).toContain("await import('@/lib/fullTourSlides')");
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.spec.ts') && /from '@\/lib\/fullTourSlides'|from '\.\/fullTourSlides'/.test(readFileSync(p, 'utf8'))) hits.push(path.relative(path.resolve(__dirname, '..'), p));
      }
    };
    walk(path.resolve(__dirname, '..'));
    // Type-only imports are erased; the only value import is the modal's dynamic one.
    const valueImports = hits.filter(h => /^import (?!type)[^;]*from '(@\/lib|\.)\/fullTourSlides'/m.test(readFileSync(path.resolve(__dirname, '..', h), 'utf8')));
    expect(valueImports).toEqual([]);
  });
});
