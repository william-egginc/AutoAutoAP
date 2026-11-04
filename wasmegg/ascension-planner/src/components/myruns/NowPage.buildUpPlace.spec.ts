/**
 * WHERE THE BUILD-UP TRACKER SITS (30 Oct 2026, Jordan on egg-beta: the fold rendered at the very foot of My runs,
 * after Your runs and "Next steps · nothing to look at"). His spec: directly under Right now's Next step and Next
 * shifts, as the Full timeline fold sits in Right now. MyRunsView.vue hands it to RightNowCard.vue's `buildUp` slot;
 * the rendered order is checked in NowPage.unfinishedBuild.spec.ts. Source order here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe('the Build-up tracker under Next step and Next shifts', () => {
  it("MyRunsView puts it in Right now's buildUp slot, before Your runs and Next steps", () => {
    const v = read('../MyRunsView.vue');
    const tpl = v.slice(v.indexOf('<template>'), v.lastIndexOf('</template>'));
    const card = tpl.indexOf('<RightNowCard');
    const slot = tpl.indexOf('<template #buildUp>');
    const tracker = tpl.indexOf('<BuildUpTracker');
    const cardEnd = tpl.indexOf('</RightNowCard>');
    expect(card).toBeGreaterThan(0);
    expect(slot).toBeGreaterThan(card);
    expect(tracker).toBeGreaterThan(slot);
    expect(tracker).toBeLessThan(cardEnd);
    expect(tpl.indexOf('<BuildUpTracker', tracker + 1)).toBe(-1);
    expect(tracker).toBeLessThan(tpl.indexOf('data-testid="my-runs-your-runs"'));
    expect(tracker).toBeLessThan(tpl.indexOf('data-testid="my-runs-summary"'));
  });

  it('RightNowCard renders the slot right after the Next step block (Next shifts), before the gear and the Full timeline', () => {
    const c = read('RightNowCard.vue');
    const slot = c.indexOf('<slot name="buildUp"');
    expect(slot).toBeGreaterThan(c.lastIndexOf('data-testid="now-next-shifts"'));
    expect(slot).toBeLessThan(c.indexOf('<GearBlock'));
    expect(slot).toBeLessThan(c.indexOf('data-testid="now-timeline"'));
  });
});
