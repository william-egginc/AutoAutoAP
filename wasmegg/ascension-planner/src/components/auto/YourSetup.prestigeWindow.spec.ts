/**
 * Setup's More options box for the prestige-window hint (R10, 21 Nov 2026): off by default, this browser's own, named in the
 * More options line when on. Words own the label (lib/prestigeWindowWords.ts, DRAFT).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import { resetTabPrefsForTest } from '@/composables/useTabPrefs';
import { PRESTIGE_HINT_KEY } from '@/lib/prestigeWindow';
import { setupMoreSummary, type SetupMoreValues } from '@/lib/setupMore';
import YourSetup from './YourSetup.vue';

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetTabPrefsForTest(null);
});

const render = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  return renderHtml(YourSetup, { screen: 'fastest', docked: true }, {}, [pinia]);
};
const checked = (html: string) => /<input[^>]*data-testid="prestige-hint-box"[^>]*>/.exec(html)?.[0] ?? '';

describe("Setup's prestige-window hint box", () => {
  it('is in More options, unticked by default', async () => {
    const tag = checked(await render());
    expect(tag).toContain('type="checkbox"');
    expect(tag).not.toMatch(/\schecked/);
  });
  it('ticked when this browser has it on', async () => {
    mem.set(PRESTIGE_HINT_KEY, '1');
    expect(checked(await render())).toMatch(/\schecked/);
  });
});

describe('the More options line', () => {
  const base: SetupMoreValues = {
    workers: 4,
    threads: 8,
    keepAwake: true,
    instantDuringSearch: false,
    backgroundWorkers: 0,
    legDetail: 0,
    legDetailDefault: 0,
    isoDates: null,
    leaderboardTab: false,
    scienceTab: false,
    prestigeBy: false,
    prestigeByDefault: false,
    prestigeByRecord: false,
  };
  it('names the hint when on, and only then', () => {
    expect(setupMoreSummary(base)).toBe('4 of 8 workers');
    expect(setupMoreSummary({ ...base, prestigeHint: true })).toBe('4 of 8 workers · Prestige-window hint on');
  });
});
