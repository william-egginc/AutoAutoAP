/**
 * The tour pictures' spotlights sit on what the slide is about (spec-tourfix, Jordan, 16 Nov 2026: step 4's ring was an
 * empty box above the Simulate this plan button, because the answer card grew after the ring was placed). The picture
 * generator (~/code/aaap-tools/harness-r7/simpler/tour/make-tour-images.mjs) measures the ring and the target on the page
 * at the moment of the screenshot and writes both to src/assets/tour/rings.json; it stops if the target is not inside
 * its ring. This spec holds the shipped numbers to the same rule, so a picture re-made without that check fails here.
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
interface Entry {
  /** The CSS selector(s) the target was found by. */
  target: string[];
  ring: Rect;
  /** The target's own rect(s) at the screenshot, same page coordinates as the ring. */
  rects: Rect[];
  /** The crop's top edge on the page, and its height, in the same units. */
  cropTop: number;
  cropH: number;
}
const rings: Record<string, Entry> = JSON.parse(readFileSync(new URL('../assets/tour/rings.json', import.meta.url), 'utf8'));

const inside = (r: Rect, o: Rect, slack = 1) => r.x >= o.x - slack && r.y >= o.y - slack && r.x + r.w <= o.x + o.w + slack && r.y + r.h <= o.y + o.h + slack;

describe('tour picture rings', () => {
  it('every shipped picture has a ring entry, desk and phone', () => {
    const names = TOUR_SLIDES.flatMap(s => [s.desk.src, s.phone.src]).length;
    expect(names).toBe(TOUR_SLIDES.length * 2);
    for (const s of TOUR_SLIDES) for (const f of ['desk', 'phone']) expect(Object.keys(rings), `${s.id} ${f}`).toContain(`${s.id}-${f}`);
  });

  it('the target is inside its ring (within 1 px), on every picture', () => {
    for (const [name, e] of Object.entries(rings)) {
      expect(e.rects.length, name).toBeGreaterThan(0);
      for (const r of e.rects) expect(inside(r, e.ring), `${name}: target ${JSON.stringify(r)} not inside ring ${JSON.stringify(e.ring)}`).toBe(true);
    }
  });

  it('the ring is no more than 12 px bigger than the target on each side for a button, so it is not an empty box beside it', () => {
    for (const name of ['simulate', 'follow', 'myrunsWhere'].flatMap(n => [`${n}-desk`, `${n}-phone`])) {
      const e = rings[name];
      expect(e, name).toBeDefined();
      const r = e.rects[0];
      for (const [a, b] of [[e.ring.x, r.x], [e.ring.y, r.y], [r.x + r.w, e.ring.x + e.ring.w], [r.y + r.h, e.ring.y + e.ring.h]]) expect(Math.abs(a - b), name).toBeLessThanOrEqual(12);
    }
  });

  it('the ring is in the picture (the crop), not cut off by it (12 px of padding may fall outside), on every small ring (a button, a tab, a choice; the big ones, Setup and the tracker, run past the crop by design)', () => {
    for (const [name, e] of Object.entries(rings)) {
      if (e.ring.h > 200) continue;
      expect(e.ring.y, name).toBeGreaterThanOrEqual(e.cropTop - 12);
      expect(e.ring.y + e.ring.h, name).toBeLessThanOrEqual(e.cropTop + e.cropH + 12);
    }
  });

  it('the Simulate this plan ring is on the button test id, the Follow ring on its own, the My runs ring on the tab', () => {
    expect(rings['simulate-desk'].target.join(' ')).toContain('[data-testid="box-simulate"]');
    expect(rings['follow-desk'].target.join(' ')).toContain('[data-testid="follow-route"]');
    expect(rings['myrunsWhere-desk'].target.join(' ')).toContain('[data-testid="top-tab-myruns"]');
    expect(rings['myrunsWhere-phone'].target.join(' ')).toContain('[data-testid="top-tab-myruns"]');
  });
});
