/**
 * By a date's card on a phone (site-wide fluff review 2, 5 Nov 2026, beyond-fluff item 8): on a 390 px phone the
 * result card was 256 px wide (Fastest's is 358 px), inside two frames Fastest does not have: InsanePanel's own
 * section-premium box (ByDateScreen rendered it without `embedded`, which FastestRoute passes) and DeadlinePanel's
 * bordered p-4 box. ByDateScreen now passes `embedded`, and DeadlinePanel keeps its frame from sm up only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('By a date: no extra frames on a phone', () => {
  it('ByDateScreen renders InsanePanel embedded, as FastestRoute does', () => {
    expect(read('ByDateScreen.vue')).toContain('<InsanePanel :player-id="playerId" goal="deadline" embedded @update:goal="onGoal" />');
    expect(read('FastestRoute.vue')).toContain('<InsanePanel :player-id="playerId" goal="fastest" embedded @update:goal="onGoal" />');
  });
  it('DeadlinePanel’s own bordered p-4 frame starts at sm', () => {
    const panel = read('DeadlinePanel.vue');
    const root = panel.slice(panel.indexOf('<template>') + '<template>'.length);
    const tag = root.slice(root.indexOf('<div'), root.indexOf('>', root.indexOf('<div')) + 1);
    expect(tag).toBe('<div class="space-y-4 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-4">');
  });
});
