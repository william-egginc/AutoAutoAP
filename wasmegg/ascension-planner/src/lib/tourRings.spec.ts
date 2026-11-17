/**
 * The tour pictures' rings and arrows (spec-tourfix 16 Nov 2026: step 4's ring was an empty box above its button;
 * spec-tour-v3, Jordan, 16 Nov 2026: arrows, one thing a slide, a magnified target when a slide points at ONE thing).
 * The picture generator (~/code/aaap-tools/harness-r7/simpler/tour/make-tour-images-v3.mjs) measures every ring, target and
 * arrow on the page at the screenshot, writes them to src/assets/tour/rings.json, and refuses a picture that breaks the
 * rules below. This spec holds the shipped numbers to the same rules, so a picture re-made without the checks fails here.
 * All numbers are page pixels (the picture's own size is the crop: 1100 x 620 on a desk, 390 x 440 on a phone).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUR_SLIDES } from './tourSlides';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Pt {
  x: number;
  y: number;
}
interface Target {
  /** CSS selector(s) the target was found by. */
  sels: string[];
  /** The target as it is drawn: the enlarged copy when `magnified`, else the page's own element(s). */
  rect: Rect;
  ring: Rect;
  magnified: boolean;
  /** One arrow a target: its tip (touching the ring) and its tail. */
  arrow: { dir: 'left' | 'right' | 'up' | 'down'; tip: Pt; tail: Pt };
}
interface Entry {
  targets: Target[];
  /** The crop on the page: its top edge, height and width. */
  cropTop: number;
  cropH: number;
  cropW: number;
}
const rings: Record<string, Entry> = JSON.parse(readFileSync(new URL('../assets/tour/rings.json', import.meta.url), 'utf8'));
const entries = TOUR_SLIDES.flatMap(s => (['desk', 'phone'] as const).map(f => [`${s.id}-${f}`, rings[`${s.id}-${f}`], f] as const));

const inside = (r: Rect, o: Rect, slack = 1) => r.x >= o.x - slack && r.y >= o.y - slack && r.x + r.w <= o.x + o.w + slack && r.y + r.h <= o.y + o.h + slack;
/** Distance from a point to a rectangle (0 inside). */
const dist = (p: Pt, r: Rect) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));
const inCrop = (p: Pt, e: Entry) => p.x >= 0 && p.x <= e.cropW && p.y >= e.cropTop && p.y <= e.cropTop + e.cropH;

describe('tour picture rings and arrows (v3)', () => {
  it('every slide has a ring entry, desk and phone, and no entry is left over from a dropped slide', () => {
    for (const [name, e] of entries) expect(e, name).toBeDefined();
    expect(Object.keys(rings).sort()).toEqual(entries.map(([n]) => n).sort());
  });

  it('the target is inside its ring (within 1 px) on every picture', () => {
    for (const [name, e] of entries) for (const t of e.targets) expect(inside(t.rect, t.ring), `${name}: ${JSON.stringify(t.rect)} not inside ${JSON.stringify(t.ring)}`).toBe(true);
  });

  it('the ring hugs its target: no more than 12 px of padding on a side (not an empty box beside it)', () => {
    for (const [name, e] of entries)
      for (const t of e.targets)
        for (const [a, b] of [[t.ring.x, t.rect.x], [t.ring.y, t.rect.y], [t.rect.x + t.rect.w, t.ring.x + t.ring.w], [t.rect.y + t.rect.h, t.ring.y + t.ring.h]])
          expect(Math.abs(a - b), name).toBeLessThanOrEqual(12);
  });

  it('every target has exactly one arrow, its tip within 6 px of the ring and the whole arrow inside the picture', () => {
    for (const [name, e] of entries) {
      expect(e.targets.length, name).toBeGreaterThan(0);
      for (const t of e.targets) {
        expect(dist(t.arrow.tip, t.ring), `${name}: tip ${JSON.stringify(t.arrow.tip)} from ring ${JSON.stringify(t.ring)}`).toBeLessThanOrEqual(6);
        expect(inCrop(t.arrow.tip, e), `${name}: tip outside the picture`).toBe(true);
        expect(inCrop(t.arrow.tail, e), `${name}: tail outside the picture`).toBe(true);
      }
    }
  });

  it('the rings are in the picture (12 px of padding may fall outside), except the tracker', () => {
    for (const [name, e] of entries)
      for (const t of e.targets) {
        if (t.ring.h > 200) continue;
        expect(t.ring.y, name).toBeGreaterThanOrEqual(e.cropTop - 12);
        expect(t.ring.y + t.ring.h, name).toBeLessThanOrEqual(e.cropTop + e.cropH + 12);
        expect(t.ring.x, name).toBeGreaterThanOrEqual(-12);
        expect(t.ring.x + t.ring.w, name).toBeLessThanOrEqual(e.cropW + 12);
      }
  });

  it('Jordan: magnify when a slide points at ONE thing; several things, normal size and an arrow to each', () => {
    // The player ID box and the save-file button are two things. The Setup panel's top, the shifts table and the time-off boxes are one
    // tall thing each (clipped to what fits, on a phone), so they are not copied.
    const several = ['load'];
    const tall = ['setupInside', 'shifts', 'setupTimeOff'];
    for (const [name, e] of entries) {
      const id = name.replace(/-(desk|phone)$/, '');
      if (several.includes(id)) {
        expect(e.targets.length, name).toBeGreaterThanOrEqual(2);
        for (const t of e.targets) expect(t.magnified, name).toBe(false);
      } else {
        expect(e.targets.length, name).toBe(1);
        if (!tall.includes(id)) expect(e.targets[0].magnified, name).toBe(true);
      }
    }
  });

  it('the arrow is shorter on a phone (70 px) than on a desk (120 px)', () => {
    for (const [name, e] of entries)
      for (const t of e.targets) {
        const len = Math.hypot(t.arrow.tail.x - t.arrow.tip.x, t.arrow.tail.y - t.arrow.tip.y);
        expect(len, name).toBeGreaterThan(40);
        expect(len, name).toBeLessThanOrEqual(name.endsWith('-phone') ? 80 : 130);
      }
  });

  it('each ring sits on what its slide is about (the test ids and labels it was found by)', () => {
    const sel = (id: string, f: string) => rings[`${id}-${f}`].targets.flatMap(t => t.sels).join(' ');
    for (const f of ['desk', 'phone']) {
      expect(sel('tabManual', f)).toContain('top-tab-manual');
      expect(sel('tabAuto', f)).toContain('top-tab-auto');
      expect(sel('tabChain', f)).toContain('top-tab-chain');
      expect(sel('tabMyruns', f)).toContain('top-tab-myruns');
      expect(sel('goalTarget', f)).toContain('data-goal="fastest"');
      expect(sel('goalDate', f)).toContain('data-goal="by-date"');
      expect(sel('result', f)).toContain('instant-box');
      expect(sel('filters', f)).toContain('filters-button');
      expect(sel('simulate', f)).toContain('box-simulate');
      expect(sel('follow', f)).toContain('follow-route');
      expect(sel('gear', f)).toContain('instant-maxed-what-if-summary');
      expect(sel('closing', f)).toContain('more-full-tour');
      expect(sel('followedRoute', f)).toContain('now-chain');
      expect(sel('tracker', f)).toContain('buildup-tracker');
      expect(sel('setupWhere', f)).toContain('setup-dock-pill');
      expect(sel('setupTimeOff', f)).toContain('timeoff-grid');
      expect(sel('shifts', f)).toContain('now-events');
    }
  });

  it('no arrow lies on another control and no enlarged copy covers one (the generator measures it; here: the arrow tip is not inside any other target\'s ring)', () => {
    for (const [name, e] of entries)
      for (const [i, t] of e.targets.entries())
        for (const [j, o] of e.targets.entries()) if (i !== j) expect(dist(t.arrow.tip, o.ring), `${name}: arrow ${i} tip on ring ${j}`).toBeGreaterThan(6);
  });
});
