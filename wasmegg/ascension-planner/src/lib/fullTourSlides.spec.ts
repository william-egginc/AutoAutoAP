/**
 * The full tour's pictures (spec-fulltour, 14 Nov 2026; ~/code/aaap-tools/harness-r7/spec-fulltour/make-full-tour-images.mjs):
 * one desk and one phone picture per step, each a WebP under 25 KB, all together under 300 KB (the first tour's budget,
 * lib/tourSlides.spec.ts, its own set), and fetched only when the full tour opens: nothing statically imports them.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_TOUR_STEPS } from './fullTour';
import { FULL_TOUR_SLIDES } from './fullTourSlides';

const dir = path.resolve(__dirname, '..', 'assets', 'fulltour');
const src = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('the full tour slides', () => {
  it('one slide per step, in the tour\'s order, 720x406 desk and 390x440 phone', () => {
    expect(FULL_TOUR_SLIDES.map(s => s.id)).toEqual([...FULL_TOUR_STEPS]);
    for (const s of FULL_TOUR_SLIDES) {
      expect([s.desk.width, s.desk.height]).toEqual([720, 406]);
      expect([s.phone.width, s.phone.height]).toEqual([390, 440]);
    }
  });
  it('every file is a WebP under 25 KB and the set is under 300 KB; two files per step and none left over', () => {
    const files = readdirSync(dir).filter(f => f.endsWith('.webp'));
    expect(files).toHaveLength(FULL_TOUR_STEPS.length * 2);
    let total = 0;
    for (const f of files) {
      const b = readFileSync(path.join(dir, f));
      expect(b.subarray(0, 4).toString('latin1'), f).toBe('RIFF');
      expect(b.subarray(8, 12).toString('latin1'), f).toBe('WEBP');
      expect(statSync(path.join(dir, f)).size, f).toBeLessThan(25 * 1024);
      total += b.length;
    }
    expect(total).toBeLessThan(300 * 1024);
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
