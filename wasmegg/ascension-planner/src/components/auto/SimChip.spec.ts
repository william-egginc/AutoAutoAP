import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import { SIM_VERSION } from '@/search/simVersion';
import { bySimToggle, hiddenSimText, isCurrentSim, SHOW_OLDER_KEY } from '@/composables/useShowOlderSims';
import SimChip from './SimChip.vue';

const OLD = '2026-10-13-lowte-gate';
const NEW = '2026-10-21-egg-beta2';

describe('SimChip', () => {
  it('says which simulator in plain words, the stamp on hover', async () => {
    const cur = await renderHtml(SimChip, { stamp: NEW, current: NEW });
    expect(textOf(cur)).toBe('sim: current');
    expect(cur).toContain(`title="Simulator ${NEW}, the one this site runs."`);
    expect(cur).toContain('data-kind="current"');
    // The quiet accent on the current simulator's chip only.
    expect(cur).toContain('bg-emerald-50');

    const old = await renderHtml(SimChip, { stamp: OLD, current: NEW });
    expect(textOf(old)).toBe('older simulator');
    expect(old).toContain(OLD);
    expect(old).not.toContain('bg-emerald-50');

    const none = await renderHtml(SimChip, { current: NEW });
    expect(textOf(none)).toBe('sim: unknown (before Oct 13)');
  });

  it('is a 44 px tap target that opens the stamp (the box is closed at first)', async () => {
    const html = await renderHtml(SimChip, { stamp: OLD, current: NEW });
    expect(html).toMatch(/<button[^>]*class="[^"]*min-h-\[44px\]/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="note"');
  });

  it('defaults to this site’s simulator', async () => {
    expect(textOf(await renderHtml(SimChip, { stamp: SIM_VERSION }))).toBe('sim: current');
  });
});

describe('Show runs from older simulators', () => {
  const rows = [{ simVersion: SIM_VERSION }, { simVersion: '2000-01-01-old' }, {}];
  it('off keeps only this simulator’s runs; on keeps every run', () => {
    expect(bySimToggle(rows, true)).toHaveLength(3);
    expect(bySimToggle(rows, false)).toEqual([{ simVersion: SIM_VERSION }]);
    expect(isCurrentSim({})).toBe(false);
  });
  it('says how many are hidden', () => {
    expect(hiddenSimText(0)).toBe('');
    expect(hiddenSimText(1)).toBe('1 run from an older simulator is hidden');
    expect(hiddenSimText(12)).toBe('12 runs from older simulators are hidden');
  });
  it('is kept per browser under aap.simlabel.older', () => {
    expect(SHOW_OLDER_KEY).toBe('aap.simlabel.older');
  });
});
