/**
 * The Build-up tracker's tick boxes on a phone (red team R7, finding 7: "tracker tick boxes are 16x16 px"). The box
 * sits in a 44 x 44 px label, and the line's words are a second label for it, so a tap on the words ticks too: the
 * whole row (at least 44 px high) is the target. The box's own label, title and the "use save" button stay as they
 * were. Rendered on the server (test/renderComponent.ts), placeholder plan, fixed clock; the tap itself is checked in
 * headless Chrome (notes/spec-r7redteam-c.md).
 */
import { describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });

async function render(): Promise<string> {
  const ticks = new Set<string>();
  return renderHtml(BuildUpTracker, {
    state: 'ready',
    open: true,
    result,
    ticks,
    summary: trackerSummary(result, ticks),
    now: NOW,
    zone: ZONE,
    saveSeconds: mt(10, 30, 12, 5),
    planSave: mt(10, 30, 8, 41),
  });
}

describe('BuildUpTracker: tick targets', () => {
  it('every box sits in a label at least 44 x 44 px', async () => {
    const html = await render();
    const boxes = [...html.matchAll(/<label([^>]*)>\s*<input[^>]*type="checkbox"[^>]*>/g)];
    expect(boxes.length).toBeGreaterThan(10);
    for (const [, attrs] of boxes) {
      expect(attrs).toMatch(/class="[^"]*min-h-\[44px\]/);
      expect(attrs).toMatch(/class="[^"]*min-w-\[44px\]/);
    }
  });

  it('the line’s words are a label for its box (a tap on them ticks), at least 44 px high', async () => {
    const html = await render();
    const inputs = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(m => m[0]);
    expect(inputs.length).toBeGreaterThan(10);
    for (const input of inputs) {
      const id = input.match(/\sid="([^"]+)"/)?.[1];
      expect(id, input).toBeTruthy();
      const words = html.match(new RegExp(`<label[^>]*for="${id!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`))?.[0];
      expect(words, `a label for ${id}`).toBeTruthy();
      expect(words).toMatch(/class="[^"]*min-h-\[44px\]/);
      expect(words).toMatch(/class="[^"]*cursor-pointer/);
    }
    // Ids are unique.
    const ids = inputs.map(i => i.match(/\sid="([^"]+)"/)?.[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a line with no box keeps its words as plain text', async () => {
    const html = await render();
    const li = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map(m => m[0]).find(l => l.includes('wait for the sale')) ?? '';
    expect(li).toContain('wait for the sale');
    expect(li).not.toContain('<label');
    expect(li).not.toContain('<input');
  });

  it('the box keeps its accessible name and the title says where the tick came from', async () => {
    const html = await render();
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*aria-label="Done: 8:42 am · buy Comfortable Nests \(0 → 50\)/);
  });
});
