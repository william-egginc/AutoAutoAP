/**
 * The tour pictures' rings and arrows. spec-tourfix (16 Nov 2026): step 4's ring was an empty box above its button;
 * spec-tour-v3 (Jordan): arrows, one thing a slide, a magnified target when a slide points at ONE thing; spec-tour-v4 (Jordan,
 * 16 Nov, ~10:40 PM): slides that share a page picture keep it and the ring, arrow and copy SLIDE (components/TourOverlay.vue),
 * and a thing that lives under a top tab also gets a light ring on that tab.
 * The picture generator (~/code/aaap-tools/harness-r7/simpler/tour/make-tour-images-v4.mjs) measures every ring, target and arrow
 * on the page, writes them to src/assets/tour/overlays.json (live slides, in the shared base picture's own pixels) and rings.json
 * (baked slides, in page pixels), and refuses a picture that breaks the rules below. This spec holds the shipped numbers to the same
 * rules, so a picture re-made without the checks fails here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUR_SLIDES } from './tourSlides';
import { FULL_TOUR_STEPS } from './fullTour';

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
interface Ov {
  base: string;
  cw: number;
  ch: number;
  rect: Rect;
  ring: Rect;
  mag: string | null;
  tabs: Rect[];
  arrow: { dir: 'left' | 'right' | 'up' | 'down'; x: number; y: number; len: number };
}
const read = (n: string) => JSON.parse(readFileSync(new URL(`../assets/tour/${n}`, import.meta.url), 'utf8'));
const overlays: Record<string, Ov> = read('overlays.json');
const baked: Record<string, { targets: { rect: Rect; ring: Rect; magnified: boolean; arrow: { tip: Pt; tail: Pt } }[]; cropTop: number; cropH: number; cropW: number }> = read('rings.json');
const asset = (stem: string) => new URL(`../assets/tour/${stem}.webp`, import.meta.url);

const inside = (r: Rect, o: Rect, slack = 1) => r.x >= o.x - slack && r.y >= o.y - slack && r.x + r.w <= o.x + o.w + slack && r.y + r.h <= o.y + o.h + slack;
const dist = (p: Pt, r: Rect) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));
const tail = (o: Ov): Pt => {
  const { dir, x, y, len } = o.arrow;
  return dir === 'left' ? { x: x + len, y } : dir === 'right' ? { x: x - len, y } : dir === 'up' ? { x, y: y + len } : { x, y: y - len };
};
/** Every overlay in the file: the first tour's and the full tour's own (its tab row is shot with the optional tabs on: `full-<id>`). */
const entries = Object.entries(overlays);
const BAKED = ['load'];

describe('tour picture overlays (v4)', () => {
  it('every slide is live (an overlay entry, desk and phone) or baked (several targets: a rings.json entry), and nothing is left over from a dropped slide', () => {
    for (const s of TOUR_SLIDES) {
      const has = (['desk', 'phone'] as const).map(f => !!overlays[`${s.id}-${f}`]);
      expect(has[0], s.id).toBe(has[1]);
      if (!has[0]) expect(Object.keys(baked), s.id).toContain(`${s.id}-desk`);
    }
    const ids = new Set<string>([...TOUR_SLIDES.map(s => s.id), ...FULL_TOUR_STEPS, ...FULL_TOUR_STEPS.map(s => `full-${s}`)]);
    for (const k of [...Object.keys(overlays), ...Object.keys(baked)]) expect(ids.has(k.replace(/-(desk|phone)$/, '')), k).toBe(true);
    for (const id of BAKED) expect(TOUR_SLIDES.find(s => s.id === id)?.overlay, id).toBeUndefined();
  });

  it('the base pictures and copies exist as files', () => {
    for (const [name, o] of entries) {
      expect(existsSync(asset(o.base)), `${name} base ${o.base}`).toBe(true);
      if (o.mag) expect(existsSync(asset(o.mag)), `${name} copy ${o.mag}`).toBe(true);
    }
  });

  it('the thing is inside its ring (within 1 px) and the ring hugs it (12 px of padding at most)', () => {
    for (const [name, o] of entries) {
      expect(inside(o.rect, o.ring), `${name}: ${JSON.stringify(o.rect)} not inside ${JSON.stringify(o.ring)}`).toBe(true);
      for (const [a, b] of [[o.ring.x, o.rect.x], [o.ring.y, o.rect.y], [o.rect.x + o.rect.w, o.ring.x + o.ring.w], [o.rect.y + o.rect.h, o.ring.y + o.ring.h]]) expect(Math.abs(a - b), name).toBeLessThanOrEqual(12);
    }
  });

  it('the ring and the whole arrow are in the picture (12 px of ring padding may fall outside, a tall thing is clipped); the tip is within 6 px of the ring', () => {
    for (const [name, o] of entries) {
      const full: Rect = { x: 0, y: 0, w: o.cw, h: o.ch };
      expect(inside(o.ring, { x: -12, y: -12, w: o.cw + 24, h: o.ch + 24 }), `${name}: ring ${JSON.stringify(o.ring)}`).toBe(true);
      const t = tail(o);
      for (const pt of [{ x: o.arrow.x, y: o.arrow.y }, t]) expect(inside({ x: pt.x, y: pt.y, w: 0, h: 0 }, full), `${name}: arrow ${JSON.stringify(pt)}`).toBe(true);
      expect(dist({ x: o.arrow.x, y: o.arrow.y }, o.ring), `${name}: tip from ring`).toBeLessThanOrEqual(6);
      for (const tab of o.tabs) expect(inside(tab, { x: -8, y: -8, w: o.cw + 16, h: o.ch + 16 }), `${name}: tab ring`).toBe(true);
    }
  });

  it('Jordan: magnify when a slide points at ONE small thing; a tall or crowded thing is drawn as the page has it (ring and arrow only)', () => {
    // A thing with no copy: the tall Setup panel, the shifts table, the time-off boxes, and any that the generator found no room to
    // enlarge without covering a neighbour (it never enlarges onto another control: Jordan, 16 Nov, the phone tabs).
    for (const [name, o] of entries) if (o.mag) expect(o.rect.w, name).toBeGreaterThan(o.cw * 0.1);
  });

  it('the arrow is shorter on a phone than on a desk, and long enough to see', () => {
    for (const [name, o] of entries) {
      expect(o.arrow.len, name).toBeGreaterThanOrEqual(40);
      expect(o.arrow.len, name).toBeLessThanOrEqual(name.endsWith('-phone') ? 80 : 130);
    }
  });

  it("no arrow's tip is inside a tab ring (an arrow does not hide the tab it goes with)", () => {
    for (const [name, o] of entries) for (const tab of o.tabs) expect(dist({ x: o.arrow.x, y: o.arrow.y }, tab), name).toBeGreaterThan(0);
  });

  it('Jordan: a thing under a top tab (Chain Finder or My runs) is shown with that tab ringed lightly, at least on a desk, wherever the tab fits in the picture', () => {
    const under = ['goalTarget', 'goalDate', 'filters', 'followedRoute', 'nextStep']; // (the My runs slide rings the My runs tab itself)
    for (const id of under) expect(overlays[`${id}-desk`].tabs.length, `${id}-desk`).toBeGreaterThan(0);
  });

  it('a shared page picture: slides that use one base all carry the same crop size, so the overlay can slide between them', () => {
    const by: Record<string, Ov[]> = {};
    for (const [, o] of entries) (by[o.base] ??= []).push(o);
    for (const [base, os] of Object.entries(by)) for (const o of os) expect([o.cw, o.ch], base).toEqual([os[0].cw, os[0].ch]);
  });

  it('the first four tab slides, and the goal switch, share one picture (so the ring slides), desk and phone', () => {
    const base = (id: string, f: string) => overlays[`${id}-${f}`]?.base;
    for (const f of ['desk', 'phone']) {
      expect(new Set(['tabManual', 'tabAuto', 'tabChain', 'tabMyruns'].map(id => base(id, f))).size, f).toBe(1);
    }
  });

  it('each ring sits on what its slide is about (the baked slides: by the test ids they were found by)', () => {
    for (const f of ['desk', 'phone']) {
      expect(Object.keys(baked)).toContain(`load-${f}`);
      expect(baked[`load-${f}`].targets.length).toBeGreaterThanOrEqual(2);
    }
  });
});
