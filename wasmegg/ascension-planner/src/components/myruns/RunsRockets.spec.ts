/**
 * My runs' rockets row (Jordan, 23 Nov 2026): at the Humility stop of the ascension being followed, collapsed, opening the
 * optimizer read-only. The panel and the loot data stay behind the tap.
 */
const storage: Record<string, string> = {};
Object.assign(globalThis, { window: { location: { pathname: '/' } }, localStorage: storage });

import { readFileSync } from 'node:fs';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import RunsRockets from './RunsRockets.vue';

const src = readFileSync(new URL('./RunsRockets.vue', import.meta.url), 'utf8');
const view = readFileSync(new URL('../MyRunsView.vue', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../composables/useNowPage.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../../stores/humilityOptimizer.ts', import.meta.url), 'utf8');

const STOP = { arrival: Date.UTC(2027, 4, 14, 5, 4) / 1000, end: Date.UTC(2027, 4, 17, 5, 0) / 1000, lengthSeconds: 71 * 3600 + 56 * 60, current: false, approximate: false };
const draw = async (props: Record<string, unknown>) =>
  textOf(await renderHtml(RunsRockets, { now: STOP.arrival - 86400, zone: 'America/Denver', ...props }, {}, [createPinia()]));

describe('the row', () => {
  it('shows nothing without a stop', async () => {
    expect(await draw({ stop: null })).toBe('');
  });
  it('collapsed: names the stop, its dates and its length, and offers the plan', async () => {
    const t = await draw({ stop: STOP });
    expect(t).toContain('Plan the rockets for your Humility stop');
    expect(t).toContain('Thu, May 13');
    expect(t).toContain('2d 23h');
    expect(t).toContain('Plan the rockets');
  });
  it('a stop from a plan not simulated yet says its dates are about', async () => {
    const t = await draw({ stop: { ...STOP, approximate: true } });
    expect(t).toContain('about ');
    expect(await draw({ stop: STOP })).not.toContain('about ');
  });
  it('the panel is not loaded until the row is opened', () => {
    expect(src).toMatch(/watch\(\s*open,[\s\S]*?import\('@\/components\/actions\/rockets\/HumilityOptimizerPanel\.vue'\)/);
    expect(src).not.toMatch(/^import .*HumilityOptimizerPanel/m);
  });
  it('seeds the days from the stop, once per stop, and hands the panel the stop', () => {
    expect(src).toContain('stopDurationText(');
    expect(src).toMatch(/if \(!store\.hasSettings\(/);
    expect(src).toContain(':stop="current"');
  });
  it('is for Pro Permit saves only, as the Manual Planner card is', () => {
    expect(src).toContain('initialStateStore.proPermit');
  });
});

describe('where it sits', () => {
  it('MyRunsView passes it into Right now\'s rockets slot, with the stop and the minute clock', () => {
    expect(view).toMatch(/<template #rockets>\s*(?:<!--[\s\S]*?-->\s*)?<RunsRockets[^>]*:stop="page\.humilityStop\.value"/);
    expect(view).not.toMatch(/<\/RightNowCard>\s*(?:<!--[\s\S]*?-->\s*)?<RunsRockets/);
  });
  it('the slot is right under the Next step box, before the Build-up tracker (Jordan, 23 Nov, shot 7)', () => {
    const card = readFileSync(new URL('./RightNowCard.vue', import.meta.url), 'utf8');
    const next = card.indexOf('data-testid="now-next"');
    const rockets = card.indexOf('<slot name="rockets"');
    const buildUp = card.indexOf('<slot name="buildUp"');
    expect(next).toBeGreaterThan(0);
    expect(rockets).toBeGreaterThan(next);
    expect(rockets).toBeLessThan(buildUp);
    expect(card).toMatch(/v-if="\$slots\.rockets"/);
  });
  it('useNowPage reads the stop off the simulated first ascension', () => {
    expect(page).toContain('humilityStopOf(actionLegs.value[0] ?? exactFirstLeg.value, now.value, currentEgg.value)');
    // A followed Fast or Exact run keeps the exact check's legs, for which actionLegs is empty (QA, 23 Nov 2026).
    expect(page).toContain('actionLegOfSummary(');
    // Jordan's shot 1: a followed plan still on the table ("a rough estimate") has no simulated leg; the row shows anyway.
    expect(page).not.toMatch(/humilityStop = computed\([^\n]*simulated/);
    expect(page).toMatch(/^\s+humilityStop,$/m);
  });
  it('the store can say whether a visit has its own settings', () => {
    expect(store).toContain('function hasSettings(');
    expect(store).toMatch(/^\s+hasSettings,$/m);
  });
});
