/**
 * The instant baselines My runs compares each run with (lib/instantBaseline.ts): the log kept in this browser, with
 * the instant answers still in snapshots added to it once (a snapshot lasts a day, the log longer). Read once per
 * page; a run's baseline is found by the loaded account, the run's goal and its save.
 */
import { computed, shallowRef } from 'vue';
import { readSnapIndex, readSnapshot } from '@/search/instantSnapshot';
import { accountOf } from '@/search/runSaves';
import { useInitialStateStore } from '@/stores/initialState';
import {
  baselineLine,
  baselineOfSnapshot,
  findBaseline,
  readBaselines,
  readRowBaseline,
  recordBaseline,
  type BaselineEntry,
  type RunVsBaseline,
} from '@/lib/instantBaseline';
import type { FoundLevel } from '@/lib/searchPointer';

/** The snapshots' instant answers not logged yet, logged; then the whole log. */
export function loadBaselines(): BaselineEntry[] {
  const have = readBaselines();
  for (const e of readSnapIndex()) {
    const m = e.meta;
    if (!m || findBaseline(have, { account: m.account, goal: m.goal, backupTime: m.backupTime })) continue;
    const s = readSnapshot<Parameters<typeof baselineOfSnapshot>[0]>(e.key);
    const b = s ? baselineOfSnapshot(s) : null;
    if (b) recordBaseline(b);
  }
  return readBaselines();
}

export interface BaselineChipWords {
  lead: string;
  words: string;
  tail: string;
  tone: 'better' | 'worse' | 'same';
}

export function useBaselines() {
  const list = shallowRef<BaselineEntry[]>(loadBaselines());
  // Without a Pinia (a list rendered on its own) there is no loaded save: only a row's own baseline is shown.
  let initial: ReturnType<typeof useInitialStateStore> | null = null;
  try {
    initial = useInitialStateStore();
  } catch {
    initial = null;
  }
  const account = computed(() => (initial ? accountOf(initial.rawBackup) || null : null));
  /**
   * One run's line, or null with no baseline: the row's own (`rowBaseline`, sent with it) first, else the one logged
   * here for the loaded account, the run's goal and its save.
   */
  function lineFor(o: {
    goal: string;
    backupTime: number | null;
    run: RunVsBaseline | null;
    level: FoundLevel | null;
    rowBaseline?: unknown;
  }): BaselineChipWords | null {
    if (!o.run) return null;
    const base = readRowBaseline(o.rowBaseline) ?? findBaseline(list.value, { account: account.value, goal: o.goal, backupTime: o.backupTime });
    return base ? baselineLine(o.run, base, o.level, 'your') : null;
  }
  return { list, lineFor, refresh: () => (list.value = loadBaselines()) };
}
