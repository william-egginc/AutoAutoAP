/**
 * The CSV, the submission and the sent-already key describe results by the start they were priced
 * from, never the Plan start box as it reads at click time (the 28-29 Sep edge cases): a CSV of the
 * stored checkpoint's entries, with nothing priced in this tab, used to take the box.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { buildCheckpoint } from '@/search/persistence';
import { formatInZone } from '@/search/csv';
import { useAutoPlannerStore } from './autoPlanner';
import { useInitialStateStore } from './initialState';

const PRICED_FROM = 1_790_000_000;

beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
afterAll(() => vi.resetModules());
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());

describe('the plan start results are described by', () => {
  it("a CSV of the stored checkpoint's entries: the checkpoint's own start, not the box", async () => {
    const { useChainSearchStore } = await import('./chainSearch');
    const s = useChainSearchStore();
    // The box: no planner start here, so it reads now, months after the checkpoint's start.
    expect(s.planStart).not.toBe(PRICED_FROM);
    s.resumable = buildCheckpoint({
      fingerprint: `player|${PRICED_FROM}|196|490|fc`,
      effort: 'quick',
      seedChain: [196, 490],
      bestChain: [196, 250, 490],
      bestSeconds: 600 * 86400,
      entries: [{ key: '196,250,490', seconds: 600 * 86400, legs: [] }],
      stage: 'running',
      detail: '',
      chainsDone: 1,
    });
    const tz = useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const csv = s.exportCsv();
    const line = csv.split('\n').find(l => l.startsWith('# plan start'));
    expect(line).toBe(`# plan start ${formatInZone(PRICED_FROM, tz)}`);
    expect(line).not.toContain(formatInZone(s.planStart, tz));
  });
});

describe('the plan-start pin', () => {
  // A fixed clock (spec-instantclock, 31 Oct 2026): unpinned, the start comes back through the Plan start boxes
  // (lib/events.ts getLocalTimestampInTimezone), which on a fall-back morning (Nov 1, 2026, 12:30-2:30 am in the
  // machine's Denver) read the box an hour early, so "two hours ahead" became one and the rule kept continue.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-11-04T12:00:00-07:00'));
  });
  afterEach(() => vi.useRealTimers());

  it("goes when another player's save is loaded, not when the same player's is", async () => {
    const { useChainSearchStore } = await import('./chainSearch');
    const s = useChainSearchStore();
    const initial = useInitialStateStore();
    initial.rawBackup = { eiUserId: 'player-a' } as never;
    await nextTick();
    // A carried-on run's own start, two hours ahead: pinned, it keeps the run's continue setting;
    // unpinned, Classic's one-hour rule would make it a fresh start.
    s.pinPlanStart(Math.floor(Date.now() / 1000) + 7200);
    expect(s.firstAscensionFor(undefined, 'continue')).toBe('continue');

    initial.rawBackup = { eiUserId: 'player-a', approxTime: 1 } as never;
    await nextTick();
    expect(s.firstAscensionFor(undefined, 'continue')).toBe('continue');

    initial.rawBackup = { eiUserId: 'player-b' } as never;
    await nextTick();
    expect(s.firstAscensionFor(undefined, 'continue')).toBe('fresh');
  });
});
