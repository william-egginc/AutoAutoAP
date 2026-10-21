/**
 * My runs' "ahead / behind" badges on saved runs and saved answers (R6 simple, ~/code/aaap-tools/specialists/
 * ui-r6-plan.md): the loading around lib/planPace.ts.
 *
 *   - The latest save is the one in memory (initial-state `rawBackup`, as Right now reads it); no new load. Without
 *     it (or while the stores still set it up): "Load your save to see how you are doing".
 *   - Each plan's line: a saved answer's legs are in memory; a saved run's are in its BODY (runLibrary `loadRun`,
 *     IndexedDB, can be MB). Each egg's TE at the plan's start comes from the save it was priced from, when that is
 *     still kept here (keptSaves `loadKeptSave`); without it the line is leg by leg ("rough").
 *   - Loaded only while "Saved on this device" is open (`active`), one entry at a time, after mount (never on the
 *     server). Only the derived line is cached (in memory, by account, entry and when it was saved), never a body.
 *   - Not the route followed for its goal (stores/follow.ts): greyed.
 */
import { computed, onMounted, shallowReactive, watch } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useFollowStore } from '@/stores/follow';
import { hashID } from '@/lib/storage/db';
import { loadRun, type RunSummary } from '@/search/runLibrary';
import { loadKeptSave } from '@/search/keptSaves';
import type { SavedAnswer } from '@/search/deadlineStore';
import type { LegSummary } from '@/search/types';
import { backupSecondsOf, saveTEByEggOf } from '@/lib/saveFreshness';
import { sameChain } from '@/lib/follow';
import { paceLine, paceWords, planPace, progressOf, type NoLine, type PaceLine, type PaceWords } from '@/lib/planPace';
import { useMinuteClock } from './useMinuteClock';

export type PaceEntry =
  | { kind: 'run'; run: RunSummary; goalKey: string }
  | { kind: 'answer'; answer: SavedAnswer; goalKey: string };

const idOf = (e: PaceEntry) =>
  e.kind === 'run' ? `run|${e.run.id}|${e.run.savedAt}` : `answer|${e.answer.id}|${e.answer.savedAt}`;
const chainOf = (e: PaceEntry): readonly number[] =>
  e.kind === 'run' ? e.run.bestChain : (e.answer.result.routes[0]?.chain ?? []);

/** A saved run's line from its body's legs (and its save's TE per egg when kept). Pure. */
export function runLine(run: RunSummary, legs: readonly LegSummary[] | null, startTEByEgg: readonly number[] | null) {
  return paceLine({
    legs: legs ? legs.slice(0, run.bestChain.length || legs.length) : null,
    startTEByEgg,
    startTE: run.save?.te ?? run.currentTE,
    planSave: run.save?.backupAt || null,
  });
}

/** A saved By a date answer's line from its lead route's legs. Pure. */
export function answerLine(a: SavedAnswer, startTEByEgg: readonly number[] | null) {
  const r = a.result.routes[0];
  return paceLine({
    legs: r ? r.legs.slice(0, r.chain.length || r.legs.length) : null,
    planStart: a.result.planStart,
    startTEByEgg,
    startTE: a.save?.te ?? a.result.backupTE ?? a.result.te,
    planSave: a.save?.backupAt || a.result.backupAt || null,
  });
}

/** Lines already worked out this session, by account hash and entry (never a run's body). */
const cache = new Map<string, PaceLine | NoLine>();

export function usePlanPace(o: { playerId: () => string; active: () => boolean; entries: () => PaceEntry[] }) {
  const initial = useInitialStateStore();
  const planner = useAutoPlannerStore();
  const follows = (() => {
    try {
      return useFollowStore();
    } catch {
      return null;
    }
  })();
  const now = useMinuteClock();
  const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  // The save, as Right now reads it (composables/useNowPage.ts): the save itself, once the stores hold it.
  const raw = computed(() => (backupSecondsOf(initial.rawBackup) > 0 ? initial.rawBackup : null));
  const saveSeconds = computed(() => backupSecondsOf(raw.value));
  const hasSave = computed(() => !!raw.value && initial.hasData && initial.lastBackupTime === saveSeconds.value);
  const progress = computed(() => (hasSave.value ? progressOf(raw.value, saveSeconds.value) : null));

  /** This instance's lines, by `${hash}|${entry}` (the module cache seeds it). */
  const lines = shallowReactive(new Map<string, PaceLine | NoLine>());
  let hash = '';
  let mounted = false;
  let busy = false;

  async function lineOf(e: PaceEntry, h: string): Promise<PaceLine | NoLine> {
    const save = e.kind === 'run' ? e.run.save : e.answer.save;
    let byEgg: number[] | null = null;
    if (save?.key) {
      const kept = await loadKeptSave(h, save.key).catch(() => null);
      if (kept) byEgg = saveTEByEggOf(kept);
    }
    if (e.kind === 'answer') return answerLine(e.answer, byEgg);
    const body = await loadRun(h, e.run.id).catch(() => null);
    return runLine(e.run, body?.bestLegs ?? null, byEgg);
  }

  /** Load what is missing, one entry at a time, while the list is open. */
  async function pump(): Promise<void> {
    if (busy || !mounted || !o.active()) return;
    busy = true;
    try {
      const id = o.playerId();
      if (!id) return;
      const h = await hashID(id);
      hash = h;
      for (;;) {
        if (!o.active() || o.playerId() !== id) break;
        const next = o.entries().find(e => !lines.has(`${h}|${idOf(e)}`));
        if (!next) break;
        const key = `${h}|${idOf(next)}`;
        const line = cache.get(key) ?? (await lineOf(next, h));
        cache.set(key, line);
        lines.set(key, line);
      }
    } finally {
      busy = false;
    }
    // The list may have changed while loading.
    if (o.active() && o.entries().some(e => !lines.has(`${hash}|${idOf(e)}`))) void pump();
  }

  onMounted(() => {
    mounted = true;
    void pump();
  });
  watch(
    () => [o.active(), o.playerId(), o.entries().map(idOf).join(',')],
    () => void pump()
  );

  /** The badge's words for an entry; null while its line is loading (or the list has never been open). */
  function paceOf(e: PaceEntry): PaceWords | null {
    const followed = follows?.followed(e.goalKey) ?? null;
    const opts = { followed: !followed || sameChain(followed.chain, chainOf(e)) };
    if (!progress.value) return paceWords(planPace('no-timeline', null), now.value, zone.value, opts);
    const line = hash ? lines.get(`${hash}|${idOf(e)}`) : undefined;
    if (!line) return null;
    return paceWords(planPace(line, progress.value), now.value, zone.value, opts);
  }

  return { paceOf, hasSave };
}
