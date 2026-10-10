/**
 * The integrity check ahead of Start ran only from Fastest's panels, so By a date opened on its own
 * never measured it: no "This account stalls" notice and Find not blocked. Every panel now starts it
 * through `useIntegrityProbe`, By a date included.
 */
import { describe, it, expect, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const store = reactive({ currentTE: 100, planStart: 1_790_000_000, probeIntegrity: vi.fn(async () => {}) });
const initial = reactive({ rawBackup: null as object | null });
vi.mock('@/stores/chainSearch', () => ({ useChainSearchStore: () => store }));
vi.mock('@/stores/initialState', () => ({ useInitialStateStore: () => initial }));

const { useIntegrityProbe } = await import('./useIntegrityProbe');

describe('useIntegrityProbe', () => {
  it('probes at once, and again when the save, TE or plan start changes', async () => {
    const scope = effectScope();
    scope.run(() => useIntegrityProbe(() => 'EI1234567890123456'));
    expect(store.probeIntegrity).toHaveBeenCalledTimes(1);
    expect(store.probeIntegrity).toHaveBeenLastCalledWith('EI1234567890123456');
    initial.rawBackup = {};
    await nextTick();
    expect(store.probeIntegrity).toHaveBeenCalledTimes(2);
    store.currentTE = 101;
    await nextTick();
    store.planStart += 3600;
    await nextTick();
    expect(store.probeIntegrity).toHaveBeenCalledTimes(4);
    scope.stop();
  });

  it('is started by By a date as well as by Fastest/Insane', () => {
    for (const panel of ['DeadlinePanel', 'InsanePanel', 'ChainSearchPanel']) {
      const src = readFileSync(fileURLToPath(new URL(`../components/auto/${panel}.vue`, import.meta.url)), 'utf8');
      expect(src, panel).toMatch(/useIntegrityProbe\(\(\) => props\.playerId\)/);
    }
  });
});
