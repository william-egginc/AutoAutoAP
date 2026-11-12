/**
 * THE NIGHT-BUY NOTE on the Build-up tracker (spec-nightbuynote; Jordan's option b, until Joo's fix after #729): with
 * awake hours set, the plan's research buys can fall outside them, so the plan's finish is a best case. Said once,
 * under the save line, only while the tracker shows a plan and only with awake hours set (lib/nightBuyNote.ts). Words:
 * lib/nightBuyWords.ts NIGHT_BUY_NOTE, with NIGHT_BUY_TIP behind a "?" (HelpTip).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { TrackerState } from '@/composables/useBuildUpTracker';
import { NIGHT_BUY_NOTE } from '@/lib/nightBuyWords';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });
const render = (state: TrackerState, over: Record<string, unknown> = {}) => {
  const ticks = new Set<string>();
  return renderHtml(BuildUpTracker, {
    state,
    open: true,
    result: state === 'ready' ? result : null,
    ticks,
    summary: state === 'ready' ? trackerSummary(result, ticks) : null,
    now: NOW,
    zone: ZONE,
    saveSeconds: mt(10, 30, 12, 5),
    planSave: mt(10, 30, 8, 41),
    ...over,
  });
};
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('Build-up tracker: the night-buy note', () => {
  it('a plan with awake hours set: the note once, from the shared words, under the save line', async () => {
    const html = await render('ready', { awakeHours: HOURS });
    expect(count(html, 'data-testid="buildup-night-buy"')).toBe(1);
    expect(count(textOf(html), NIGHT_BUY_NOTE)).toBe(1);
    expect(html.indexOf('data-testid="buildup-night-buy"')).toBeGreaterThan(html.indexOf('data-testid="buildup-now"'));
    expect(html.indexOf('data-testid="buildup-night-buy"')).toBeLessThan(html.indexOf('data-testid="buildup-day-'));
  });
  it('no awake hours (none, or any hour): no note', async () => {
    expect(await render('ready')).not.toContain('data-testid="buildup-night-buy"');
    expect(await render('ready', { awakeHours: null })).not.toContain(NIGHT_BUY_NOTE);
    const anyHour = { days: [], fromHour: 0, toHour: 0, timezone: ZONE };
    expect(await render('ready', { awakeHours: anyHour })).not.toContain(NIGHT_BUY_NOTE);
  });
  it.each(['notBuilding', 'noRoute', 'noSave', 'working', 'failed', 'checking'] as const)(
    '%s (no plan shown): no note even with awake hours',
    async state => {
      expect(await render(state, { awakeHours: HOURS })).not.toContain(NIGHT_BUY_NOTE);
    }
  );
  it('type: text-small, a slate note with the "?" tip, no px sizes, caps or medium/semibold', () => {
    const src = fs.readFileSync(path.join(__dirname, 'BuildUpTracker.vue'), 'utf8');
    const tag = src.match(/<p[^>]*data-testid="buildup-night-buy"[^>]*>[\s\S]*?<\/p>/)![0];
    expect(tag).toContain('text-small');
    expect(tag).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
    expect(tag).toMatch(/\{\{ NIGHT_BUY_NOTE \}\}\{\{ ' ' \}\}<HelpTip[^>]*>\{\{ NIGHT_BUY_TIP \}\}<\/HelpTip>/);
  });
  it('MyRunsView passes the tracker the hours the note sees: none while the simulation holds its buys (spec-nightbuyfix)', () => {
    const view = fs.readFileSync(path.join(__dirname, '../MyRunsView.vue'), 'utf8');
    expect(view).toMatch(/<BuildUpTracker[\s\S]*?:awake-hours="nightBuyHours"[\s\S]*?\/>/);
  });
});
