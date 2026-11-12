/**
 * THE SAVE BANNER ONLY WHEN THE SILOS ARE LOW (spec-myruns-fix task 3, Jordan 12 Nov 2026): the amber "Getting old"
 * (and red) save banner shows only when the save's silo estimate (lib/saveFreshness.ts `siloLeftSeconds`: the virtue
 * farm's silo time less the time since it last ran) is under SAVE_BANNER_SILO_HOURS (6 h), not just because the save
 * is old: the silos can be fresh while the save isn't, so the save alone can't tell. Its text is Words' one blurb
 * (lib/saveFreshnessWords.ts: SAVE_LOW_SILOS_LEAD, then SAVE_LOW_SILOS_DO). The rule:
 *   - silos under 6 h AND the old tone amber or red: the banner, in that tone, with the blurb;
 *   - otherwise: the quiet line (the save's age), as for a green save;
 *   - a fresh save over low silos keeps the old rule's green (the silos alone, under 6 h, don't raise it: a save with
 *     two silos always has under 6 h); no virtue farm, so no silo estimate: never the banner.
 * The clock-behind state is not this banner and is unchanged. Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, ref } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';
import { resetServerSaveChecks } from '@/lib/serverSave';
import { siloSeconds } from '@/lib/saveAge';
import { SAVE_LOW_SILOS_DO, SAVE_LOW_SILOS_LEAD } from '@/lib/saveFreshnessWords';
import { WHY_OUT_OF_DATE } from '@/lib/serverSave';
import { useAutoSaveStrip } from './useAutoSaveStrip';
import * as banner from '@/lib/saveBanner';

const requestSave = vi.hoisted(() => vi.fn());
vi.mock('@/lib/saveLoad', async orig => ({ ...(await orig<typeof import('@/lib/saveLoad')>()), requestSave }));

const NOW = Date.UTC(2026, 9, 27, 18, 0) / 1000;
const H = 3600;
const LEVEL = 20;
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

beforeEach(() => {
  resetServerSaveChecks();
  setActivePinia(createPinia());
  requestSave.mockReset();
  requestSave.mockRejectedValue(new Error('offline'));
});
afterEach(() => vi.restoreAllMocks());

describe('the save banner: only with under 6 h of silos left', () => {
  const S = siloSeconds(10, LEVEL); // ten silos at full Silo Capacity

  it('one named constant: 6 hours', () => {
    expect(banner.SAVE_BANNER_SILO_HOURS).toBe(6);
  });

  it('an old save with 6 h or more of silos left: no banner, the quiet line', () => {
    expect(S).toBeGreaterThanOrEqual(16 * H);
    // Old enough for the old rule's amber (half the silo time), with exactly 6 h left.
    const { s, stop } = strip(NOW - (S - 6 * H), { silos: 10 });
    expect(s.state.value?.siloLeftSeconds).toBe(6 * H);
    expect(s.state.value?.tone).toBe('green');
    expect(s.state.value?.headline).toMatch(/^Your save is from /);
    stop();
  });

  it('an old save with under 6 h of silos left: the banner, with Words\' blurb; Why and Details unchanged', async () => {
    const { s, stop } = strip(NOW - (S - 4 * H), { silos: 10 });
    const st = s.state.value!;
    expect(st.siloLeftSeconds).toBe(4 * H);
    expect(st.tone).toBe('yellow');
    expect(st.word).toBe('Getting old');
    expect(st.headline).toBe(SAVE_LOW_SILOS_LEAD);
    expect(st.reason).toBe(SAVE_LOW_SILOS_DO);
    expect(s.shown.value).toBe(true);
    const html = await renderHtml(SaveAgeStrip, { state: st, server: { kind: 'newest', serverSeconds: NOW - (S - 4 * H) }, now: NOW, loading: false, slim: true });
    const t = textOf(html);
    expect(t).toContain(`${SAVE_LOW_SILOS_LEAD} ${SAVE_LOW_SILOS_DO}`);
    expect(t).toContain(WHY_OUT_OF_DATE.summary);
    expect(html).toContain('data-testid="save-details"');
    stop();
  });

  it('red stays red (a tenth or less of the silos left), with the same blurb', () => {
    const { s, stop } = strip(NOW - (S - 1 * H), { silos: 10 });
    expect(s.state.value?.tone).toBe('red');
    expect(s.state.value?.headline).toBe(SAVE_LOW_SILOS_LEAD);
    stop();
  });

  it('a fresh backup over a farm that last ran long ago (a check-in that didn\'t sync): the banner, the silos are low', () => {
    const { s, stop } = strip(NOW - 4 * 60, { silos: 10, farmAt: NOW - (S - 2 * H) });
    expect(s.state.value?.tone).not.toBe('green');
    expect(s.state.value?.headline).toBe(SAVE_LOW_SILOS_LEAD);
    stop();
  });

  it('a fresh save over small silos (under 6 h in all): green as before; the silos alone do not raise it', () => {
    const { s, stop } = strip(NOW - 20 * 60, { silos: 1 });
    expect(s.state.value?.siloLeftSeconds).toBeLessThan(6 * H);
    expect(s.state.value?.tone).toBe('green');
    stop();
  });

  it('no virtue farm (no silo estimate): an old save is the quiet line, never the banner', () => {
    const { s, stop } = strip(NOW - 20 * H);
    expect(s.state.value?.siloLeftSeconds).toBeNull();
    expect(s.state.value?.tone).toBe('green');
    stop();
  });
});
