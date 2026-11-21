/**
 * THE START LINE (R11, Jordan 21 Nov 2026, the orchestrator's pick): just "Right now, from your save", no Hypothetical switch. When the plan
 * start is set in Setup it says that date instead, and a small button opens Setup to change it. PLACEHOLDER words for Words
 * (lib/startLineWords.ts). On both goal screens, in the card under the target or date row.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import StartLine from './StartLine.vue';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import * as W from '@/lib/startLineWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});
const draw = () => renderHtml(StartLine, {}, {}, [pinia]);

describe('the line', () => {
  it('says right now, from your save, when no start is set', async () => {
    const html = await draw();
    expect(html).toContain('data-testid="start-line"');
    expect(textOf(html)).toContain(W.START_NOW);
  });
  it('says the date when a plan start is set, and still offers Setup', async () => {
    const planner = useAutoPlannerStore();
    planner.timezone = 'America/Denver';
    planner.startDate = '2027-01-05';
    planner.startTime = '09:00';
    const html = await draw();
    expect(textOf(html)).not.toContain(W.START_NOW);
    expect(textOf(html)).toMatch(/Jan 5, 2027/);
  });
  it('one small button opens Setup, 44 px on a phone, and there is no Hypothetical switch', async () => {
    const html = await draw();
    expect(html).toContain('data-testid="start-change"');
    expect(read('StartLine.vue')).toMatch(/min-h-\[44px\] sm:min-h-0/);
    expect(textOf(html)).not.toMatch(/Hypothetical/i);
  });
  it('the words never say "this device" and carry no typed ellipsis', () => {
    for (const v of Object.values(W).filter(v => typeof v === 'string') as string[]) expect(v).not.toMatch(/this device|this computer|…|\.\.\./i);
  });
});

describe('on both screens', () => {
  it('Fastest and By Egg Day draw it, after the target or date row and before the Filters fold', () => {
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const tpl = read(f).slice(0, read(f).indexOf('</template>\n\n<script'));
      expect(tpl, f).toContain('<StartLine');
      expect(tpl.indexOf('<StartLine'), f).toBeLessThan(tpl.indexOf('section="goalFilters"'));
    }
  });
});
