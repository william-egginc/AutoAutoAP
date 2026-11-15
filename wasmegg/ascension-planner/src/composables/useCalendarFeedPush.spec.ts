/**
 * useCalendarFeedPush for a PRODUCING player (14 Nov 2026): the tracker has no lines (`notBuilding`), the Next shifts do. The feed is handed the
 * shifts and the prestige instead (and a slot of 0 when the plan has no start yet), never both, and nothing at all when neither is known.
 */
import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

vi.mock('@/stores/initialState', () => ({ useInitialStateStore: () => ({ rawBackup: {} }) }));
vi.mock('@/search/runSaves', () => ({ accountOf: () => 'acct1' }));
vi.mock('./useOverrideSync', () => ({ syncTarget: () => ({ url: 'https://collector.example/sync', k: 'b'.repeat(64) }) }));

import { calendarFeedFor, resetCalendarFeeds, useCalendarFeedPush } from './useCalendarFeed';
import type { CalLine } from '@/lib/calendarFeedEvents';

const line = (key: string, kind: 'shift' | 'prestige' | 'research'): CalLine => ({ key, kind, at: 1_800_000_000, text: `${kind} x`, tickable: true, checkIn: kind === 'research' ? 0 : -1 });
function run(src: { lines: CalLine[] | null; fallback?: CalLine[] | null; start: number | null }) {
  resetCalendarFeeds();
  const note = vi.fn();
  calendarFeedFor('acct1').note = note;
  const scope = effectScope();
  scope.run(() =>
    useCalendarFeedPush({
      lines: ref(src.lines),
      ticks: ref(new Set<string>()),
      ascensionStart: ref(src.start),
      zone: ref('America/Denver'),
      hours: ref(null),
      ...(src.fallback !== undefined ? { fallbackLines: ref(src.fallback) } : {}),
    })
  );
  return { note, scope };
}

describe('Producing: the Next shifts stand in for the tracker\'s lines', () => {
  it('no tracker lines but shifts: the feed is handed the shifts, with slot 0 when the plan has no start', async () => {
    const { note, scope } = run({ lines: null, fallback: [line('ns:shift:kindness:1', 'shift'), line('ns:prestige:1', 'prestige')], start: null });
    await nextTick();
    expect(note).toHaveBeenCalledTimes(1);
    const arg = note.mock.calls[0]![0];
    expect(arg.lines.map((l: CalLine) => l.key)).toEqual(['ns:shift:kindness:1', 'ns:prestige:1']);
    expect(arg.ascensionStart).toBe(0);
    scope.stop();
  });
  it('a plan with a start keeps it', async () => {
    const { note, scope } = run({ lines: null, fallback: [line('ns:shift:kindness:1', 'shift')], start: 1_799_000_000 });
    await nextTick();
    expect(note.mock.calls[0]![0].ascensionStart).toBe(1_799_000_000);
    scope.stop();
  });
  it('the tracker\'s own lines win: the shifts are not added to them', async () => {
    const { note, scope } = run({ lines: [line('1:0', 'research')], fallback: [line('ns:shift:kindness:1', 'shift')], start: 1_799_000_000 });
    await nextTick();
    expect(note.mock.calls[0]![0].lines.map((l: CalLine) => l.key)).toEqual(['1:0']);
    scope.stop();
  });
  it('the window: 60 days exactly when the stand-ins are used, the default (none given: 14) when the tracker has lines', async () => {
    const a = run({ lines: null, fallback: [line('ns:shift:kindness:1', 'shift')], start: null });
    await nextTick();
    expect(a.note.mock.calls[0]![0].options).toEqual({ days: 60 });
    a.scope.stop();
    const b = run({ lines: [line('1:0', 'research')], fallback: [line('ns:shift:kindness:1', 'shift')], start: 1_799_000_000 });
    await nextTick();
    expect(b.note.mock.calls[0]![0].options).toBeUndefined();
    b.scope.stop();
  });
  it('nothing from either: nothing is handed over (the tracker is still working out)', async () => {
    const { note, scope } = run({ lines: null, fallback: null, start: null });
    await nextTick();
    expect(note).not.toHaveBeenCalled();
    scope.stop();
  });
  it('without the new input it behaves as before: no lines, nothing handed over', async () => {
    const { note, scope } = run({ lines: null, start: 1_799_000_000 });
    await nextTick();
    expect(note).not.toHaveBeenCalled();
    scope.stop();
  });
});
