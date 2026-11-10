/**
 * THE LAYOUT CONTRACT on Fastest to 490 TE (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026): the
 * title and its one line, the answer (always shown, no Hide) with Follow this route as its one main button and first,
 * what to do now, then the one closed More holding the search and the rest, in that order and nothing between. Read
 * from the source (as the other layout specs do), plus the pieces rendered on the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import FollowButton from '@/components/FollowButton.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
/** The template without its comments (they name the regions too). */
const template = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
/** Where each marker first appears, in order; -1 for one missing. */
const order = (src: string, marks: string[]) => marks.map(m => src.indexOf(m));

describe('Fastest: the regions in their fixed order', () => {
  const t = template(read('auto/FastestRoute.vue'));
  it('title, answer, what to do now, More: in this order', () => {
    const at = order(t, ['data-region="title"', 'data-region="answer"', '<NowLine', '<MoreFold']);
    expect(at.every(i => i >= 0), String(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('the search, the table and How this is worked out are inside More; the save strip and Hide are gone', () => {
    const more = t.slice(t.indexOf('<MoreFold'), t.indexOf('</MoreFold>'));
    expect(more).toContain('<SearchPanel');
    expect(more).toContain('id="more-fastest-answer"');
    expect(more).toContain('id="more-fastest-answer-how"');
    expect(more).toContain('HOW_IT_WORKS_LINK');
    expect(t).toContain('more-to="more-fastest-answer"');
    expect(t).not.toContain('<AutoSaveStrip');
    expect(t).not.toContain('<CollapsibleSection');
    expect(t).not.toContain('hide-in-heading');
    // The tracker's "Pick a route to follow" finds the answer by its old section id (lib/pickRoute.ts).
    expect(t).toContain('data-testid="section-instant"');
  });
  it('More opens with a run going or one to carry on, and its line names what is not at its default', () => {
    const more = t.slice(t.indexOf('<MoreFold'), t.indexOf('>', t.indexOf('<MoreFold')));
    expect(more).toContain('section="moreFastest"');
    expect(more).toContain(':line="moreLineWithChanges(MORE_LINE_AUTO, moreChanges)"');
    expect(more).toContain(':running="smartRunning || fullRunning"');
    expect(more).toContain(':unfinished="!!store.crashedRun"');
  });
});

describe('the answer card (InstantRoute.vue) with a More', () => {
  const t = template(read('auto/InstantRoute.vue'));
  it('Follow this route comes first in each box, as the one main button; Simulate after it', () => {
    for (const box of t.split('data-testid="box-actions"').slice(1)) {
      const follow = box.indexOf('<FollowButton');
      const simulate = box.indexOf('data-testid="box-simulate"');
      expect(follow).toBeGreaterThanOrEqual(0);
      expect(follow).toBeLessThan(simulate);
      expect(box.slice(follow, box.indexOf('/>', follow))).toMatch(/\smain\s/);
    }
  });
  it('the filters, the table and How this is worked out move into More; no row opens by itself under the box', () => {
    expect(t.match(/<Teleport :to="moreEl \?\? 'body'" :disabled="!moreEl">/g)).toHaveLength(3);
    expect(t).toContain(`<Teleport :to="moreHowEl ?? 'body'" :disabled="!moreHowEl">`);
    const src = read('auto/InstantRoute.vue');
    expect(src).toContain('return props.moreTo ? false : countLit(r);');
  });
  it('the main Follow is filled; a plain one is not', async () => {
    setActivePinia(createPinia());
    const main = await renderHtml(FollowButton, { chain: [200, 490], goalKey: 'fastest-490', from: 'answer', main: true, primary: true });
    expect(main).toContain('bg-indigo-600');
    const plain = await renderHtml(FollowButton, { chain: [200, 490], goalKey: 'fastest-490', from: 'count', primary: true });
    expect(plain).not.toContain('bg-indigo-600');
  });
});

/** One order wherever the pair sits side by side (Allan, 9 Nov 2026: on the answer Follow was first, in Every number
 *  of ascensions Simulate was): Follow this route first, Simulate this plan second. Source order is DOM order. */
describe('Follow this route first, Simulate this plan second, everywhere the pair is shown', () => {
  const simulateAt = (s: string, from = 0) => {
    const m = /<Tip[^>]*:text="TIP_SIMULATE"/.exec(s.slice(from));
    return m ? from + m.index : -1;
  };
  it('the answer (both boxes) and every table row (Every number of ascensions, on both screens)', () => {
    const t = template(read('auto/InstantRoute.vue'));
    const boxes = t.split('data-testid="box-actions"').slice(1);
    const rows = t.split('data-testid="counts-row-panel"').slice(1);
    expect(boxes).toHaveLength(2);
    expect(rows).toHaveLength(2);
    for (const [i, part] of [...boxes, ...rows].entries()) {
      const follow = part.indexOf('<FollowButton');
      const simulate = simulateAt(part);
      expect(follow, `part ${i}`).toBeGreaterThanOrEqual(0);
      expect(simulate, `part ${i}`).toBeGreaterThan(follow);
    }
  });
  it('the result cards and More routes', () => {
    for (const f of ['auto/RouteResultCard.vue', 'auto/ByDateRouteCard.vue', 'auto/TopRoutes.vue']) {
      // Each button in source order: F for Follow, S for Simulate. Each pair is Follow then Simulate.
      const seq = [...template(read(f)).matchAll(/<FollowButton|:text="TIP_SIMULATE"/g)].map(m => (m[0] === '<FollowButton' ? 'F' : 'S')).join('');
      expect(seq, f).toMatch(/^(FS)+$/);
    }
  });

});
