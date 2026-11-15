/**
 * QA 15 Nov 2026 (LOW): the plan table's "A1 ends · Prestige at 222 TE" said "around 10:00 PM" while Next step and Next shifts said 11:00 PM.
 * The instant answer starts the next ascension on the hour after the stop, with no hours wait (lib/nowPlan.ts `markPrestigeWaits` carries that start
 * as `prestigeAt`); the row now shows that start, as Next step does (lib/nowWords.ts `nextStepText`), and says nothing about waiting for hours.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import EventsTable from './EventsTable.vue';
import type { PlanEvent } from '@/lib/nowPlan';

const ZONE = 'America/Denver';
const reached = Date.UTC(2027, 0, 1, 5, 17) / 1000; // Dec 31, 10:17 PM Denver
const starts = Date.UTC(2027, 0, 1, 6, 0) / 1000; // Dec 31, 11:00 PM Denver
const NOW = reached - 6 * 3600;
const render = (e: Partial<PlanEvent>) =>
  renderHtml(EventsTable, {
    events: [{ kind: 'prestige', at: reached, asc: 1, te: 222, past: false, next: true, ...e } as PlanEvent],
    goal: 'fastest',
    goalName: 'Fastest to 490 TE',
    now: NOW,
    zone: ZONE,
    saveWhen: 'x',
    calculatedWhen: 'y',
    rounded: true,
  });

describe("the plan table's prestige row", () => {
  it('shows the next ascension\'s start (11:00 PM), not the stop time (10:00 PM), with no waiting note', async () => {
    const t = textOf(await render({ prestigeAt: starts }));
    expect(t).toContain('11:00');
    expect(t).not.toContain('10:00');
    expect(t).not.toContain('waits for your hours');
    expect(t).not.toContain('Reached');
  });
  it('without a later start it keeps the stop time', async () => {
    expect(textOf(await render({}))).toContain('10:00');
  });
  it('an hours wait still says so, as before', async () => {
    const t = textOf(await render({ prestigeAt: starts, wait: 'hours' }));
    expect(t).toContain('waits for your hours');
    expect(t).toContain('11:00');
  });
});
