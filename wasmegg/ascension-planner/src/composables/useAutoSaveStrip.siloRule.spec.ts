/**
 * THE SAVE STRIP AND THE SILO LINE, SPLIT (Jordan, 12 Nov 2026, with the orchestrator's reading): the silos get their own
 * small line, and the save strip no longer turns into the big amber or red box at any age or silo level.
 *   - The save strip (myruns/SaveAgeStrip.vue, fed by lib/saveBanner.ts `saveBannerState`): always the small quiet line,
 *     the save's age; "Why is my save out of date?" and Details once the save is old; its text amber (no box) past a day
 *     (lib/saveFreshness.ts SYNC_AFTER_SECONDS). Replaces 9a994dfcf's rule (the box only with under 6 h of silos).
 *   - The silo line (layout/SiloLine.vue, lib/saveBanner.ts `siloLineState`): always with a virtue farm, none without;
 *     "Silos run out about {when} (from your save)", Words' low words and an amber tint under 30% of the silos' time
 *     (SILO_LINE_LOW_FRACTION, equal to Words' SILO_AMBER_PERCENT_WORDS); "ran out" once it has gone by. The run-out time
 *     is the farm's last run plus its silo time, both already in the save state (no new calculation).
 * The clock-behind state ("Check your clock") is not this and is unchanged. Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, ref } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import SiloLine from '@/components/layout/SiloLine.vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';
import { resetServerSaveChecks, WHY_OUT_OF_DATE } from '@/lib/serverSave';
import { siloSeconds } from '@/lib/saveAge';
import { SAVE_LOW_SILOS_LEAD, SILO_AMBER_PERCENT_WORDS } from '@/lib/saveFreshnessWords';
import { dateAt } from '@/lib/eventWhen';
import { useAutoSaveStrip } from './useAutoSaveStrip';
import * as banner from '@/lib/saveBanner';

const requestSave = vi.hoisted(() => vi.fn());
vi.mock('@/lib/saveLoad', async orig => ({ ...(await orig<typeof import('@/lib/saveLoad')>()), requestSave }));

const NOW = Date.UTC(2026, 9, 27, 18, 0) / 1000;
const H = 3600;
const LEVEL = 20;
const ZONE = 'America/Denver';
const save = (t: number, o: { farmAt?: number; silos?: number } = {}) => ({
  approxTime: t,
  settings: { lastBackupTime: t },
  game: { epicResearch: [{ id: 'silo_capacity', level: LEVEL }] },
  ...(o.silos ? { farms: [{ eggType: 51, lastStepTime: o.farmAt ?? t, silosOwned: o.silos }] } : {}),
});

function strip(t: number, o: { farmAt?: number; silos?: number } = {}) {
  useInitialStateStore().$patch({ rawBackup: save(t, o) as never, hasData: true, lastBackupTime: t });
  useUIStore().screenPlayerId = 'EI0000000000000001';
  const scope = effectScope();
  const s = scope.run(() => useAutoSaveStrip({ now: ref(NOW) }))!;
  return { s, stop: () => scope.stop() };
}
const render = (st: unknown, server: unknown = { kind: 'newest', serverSeconds: NOW - 30 * H }) =>
  renderHtml(SaveAgeStrip, { state: st, server, now: NOW, loading: false, slim: true });
const BOX = /bg-(amber|rose)-50|border-(amber|rose)-300/;

beforeEach(() => {
  resetServerSaveChecks();
  setActivePinia(createPinia());
  requestSave.mockReset();
  requestSave.mockRejectedValue(new Error('offline'));
});
afterEach(() => vi.restoreAllMocks());

describe('the save strip: small and quiet at any age and silo level', () => {
  const S = siloSeconds(10, LEVEL); // ten silos at full Silo Capacity

  it('the silo line\'s 30% is one named fraction, equal to the percent Details says', () => {
    expect(banner.SILO_LINE_LOW_FRACTION).toBe(0.3);
    expect(banner.SILO_LINE_LOW_FRACTION).toBe(SILO_AMBER_PERCENT_WORDS / 100);
  });

  it('an old save with low silos: the quiet line, no box, no low-silos blurb; Why and Details are there', async () => {
    const { s, stop } = strip(NOW - (S - 4 * H), { silos: 10 });
    const st = s.state.value!;
    expect(st.tone).toBe('green');
    expect(st.headline).toMatch(/^Your save is from /);
    expect(st.headline).not.toBe(SAVE_LOW_SILOS_LEAD);
    expect(s.shown.value).toBe(true);
    const html = await render(st);
    expect(html).not.toMatch(BOX);
    expect(textOf(html)).toContain(WHY_OUT_OF_DATE.summary);
    expect(html).toContain('data-testid="save-details"');
    stop();
  });

  it('red-level silos and an old save: still the quiet line, no box', async () => {
    const { s, stop } = strip(NOW - (S - 1 * H), { silos: 10 });
    expect(s.state.value?.tone).toBe('green');
    expect(await render(s.state.value)).not.toMatch(BOX);
    stop();
  });

  it('past a day old: the strip\'s text is amber (no box); under a day it is not', async () => {
    const day = strip(NOW - 25 * H, { silos: 10 });
    expect(day.s.state.value?.outOfDate).toBe(true);
    const html = await render(day.s.state.value);
    expect(html).not.toMatch(BOX);
    expect(html).toMatch(/data-testid="save-headline"[^>]*class="[^"]*text-amber-800|class="[^"]*text-amber-800[^"]*"[^>]*data-testid="save-headline"/);
    day.stop();
    const young = strip(NOW - 23 * H, { silos: 10 });
    expect(young.s.state.value?.outOfDate).toBe(false);
    expect(await render(young.s.state.value)).not.toContain('text-amber-800');
    young.stop();
  });

  it('a fresh save: the quiet line, no Details, no Why', async () => {
    const { s, stop } = strip(NOW - 20 * 60, { silos: 10 });
    expect(s.state.value?.old).toBe(false);
    const html = await render(s.state.value, { kind: 'newest', serverSeconds: NOW - 20 * 60 });
    expect(html).not.toContain('data-testid="save-details"');
    expect(textOf(html)).not.toContain(WHY_OUT_OF_DATE.summary);
    stop();
  });
});

describe('the silo line: always with a virtue farm, amber under 30%', () => {
  const S = siloSeconds(10, LEVEL);

  it('plenty left: "Silos run out about {when} (from your save)", the farm\'s last run plus its silo time, not low', async () => {
    const farmAt = NOW - 2 * H;
    const { s, stop } = strip(farmAt, { silos: 10 });
    const l = s.silo.value!;
    expect(l.low).toBe(false);
    expect(l.past).toBe(false);
    expect(l.text).toBe(`Silos run out about ${dateAt(farmAt + S, NOW, ZONE)} (from your save)`);
    expect(l.text).toMatch(/\d:\d\d [AP]M \(from your save\)$/);
    const html = await renderHtml(SiloLine, { silo: l });
    expect(html).toContain('data-testid="silo-line"');
    expect(html).not.toContain('amber');
    stop();
  });

  it('under 30% of the silo time left: Words\' low words and an amber tint', async () => {
    const { s, stop } = strip(NOW - (S - 0.25 * S), { silos: 10 });
    const l = s.silo.value!;
    expect(l.low).toBe(true);
    expect(l.text).toMatch(/^Silos are low: they run out about .* \(from your save\)\. The game may have synced since/);
    const html = await renderHtml(SiloLine, { silo: l });
    expect(html).toContain('text-amber-800');
    expect(html).toContain('data-low="true"');
    stop();
  });

  it('exactly 30% left is not low yet', () => {
    const { s, stop } = strip(NOW - 0.7 * S, { silos: 10 });
    expect(s.silo.value?.low).toBe(false);
    stop();
  });

  it('already gone by: "they ran out about …", low', () => {
    const { s, stop } = strip(NOW - S - 3 * H, { silos: 10 });
    expect(s.silo.value?.past).toBe(true);
    expect(s.silo.value?.text).toMatch(/^Silos are low: they ran out about /);
    stop();
  });

  it('a fresh backup over a farm that last ran long ago: the strip quiet, the silo line low', () => {
    const { s, stop } = strip(NOW - 4 * 60, { silos: 10, farmAt: NOW - (S - 2 * H) });
    expect(s.state.value?.tone).toBe('green');
    expect(s.silo.value?.low).toBe(true);
    stop();
  });

  it('no virtue farm: no silo line', async () => {
    const { s, stop } = strip(NOW - 20 * H);
    expect(s.silo.value).toBeNull();
    expect(textOf(await renderHtml(SiloLine, { silo: null }))).toBe('');
    stop();
  });
});
