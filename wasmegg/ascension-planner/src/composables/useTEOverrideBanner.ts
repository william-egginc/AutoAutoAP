/**
 * The starting-TE override banner (components/auto/TeOverrideBanner.vue; spec-overridebanner, 7 Nov 2026): whether
 * this account's override is on, its TE and the save's, and Remove.
 *
 * WHY. Jordan's override (197, claimed TE only) made every Auto Planner screen and My runs plan from 197 while his save
 * said 198, and only Single run's Virtue Progress card said so. The banner sits at the top of Fastest, By a date,
 * Single run and My runs.
 *
 * "On" is lib/teOverrideAccount.ts `plannerStartTEOf`'s own test (an override, a loaded account, the override set up
 * for that account), which decides the TE every screen is set up from (App `storesSetUpFromSave`, useNowPage
 * `storeReady`), so the banner shows exactly while plans start from the override. It is restated here, not exported
 * from there, because that file is a result code hash input and this one must not be (lib/resultCodeHash.ts): the
 * spec (TeOverrideBanner.spec.ts) checks the two agree case by case.
 *
 * Not a hash input: src/composables files are only when RESULT_CODE_FILES names them.
 */
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';
import { saveTEOf } from '@/lib/saveFreshness';
import { parseVirtueProgress } from '@/lib/backupVirtue';
import type { ei } from 'lib';
import { VIRTUE_TE_ORDER } from '@/stores/truthEggs';
import { applyAutoStartingTE } from '@/auto/startingTE';
import { saveAutoPlannerTEInputs } from '@/lib/autoPlannerFormCache';
import { noteTEOverrideChange } from '@/composables/useOverrideSync';
import { ref } from 'vue';

export interface TEOverrideBanner {
  /** The TE plans start from: the override's claimed TE, summed. */
  overrideTE: number;
  /** The save's own TE (pending counted, lib/saveFreshness.ts `saveTEOf`), or null when the save holds no virtue progress. */
  saveTE: number | null;
  /** The part of `saveTE` not yet claimed: the save's TE less its claimed TE (0 when `saveTE` is null). */
  pendingTE: number;
  /** 'lower': below the save's TE, a warning (amber); 'info': above it (a what-if), the same, or the save's unknown. */
  tone: 'lower' | 'info';
  /** "Keep my typed TE" was pressed for this very save, this typed TE and this save's TE (spec-syncclient-a, client
   *  brief section 5): the banner hides until the save, its TE or the typed TE moves (the stale case). */
  kept: boolean;
}

/**
 * KEEP (client brief section 5, "Keep the override"): dismissed for this save, kept in this browser per account (its
 * hash, never the ID): the save's time, its TE and the typed TE then. Any of them moving brings the banner back.
 */
const keptKey = (account: string) => `aap.teOverride.kept.${account}`;
interface Kept {
  saveTime: number;
  saveTE: number | null;
  typed: number;
}
/** Bumped by Keep, so the computeds reading the banner read again (storage isn't reactive). */
const keptTick = ref(0);
function readKept(account: string): Kept | null {
  try {
    const v = JSON.parse(localStorage.getItem(keptKey(account)) ?? 'null') as Partial<Kept> | null;
    return v && typeof v.saveTime === 'number' && typeof v.typed === 'number' ? { saveTime: v.saveTime, saveTE: v.saveTE ?? null, typed: v.typed } : null;
  } catch {
    return null;
  }
}
/** Specs: a new page load (the kept state is read from storage each time anyway). */
export function resetKept(): void {
  keptTick.value++;
}

/** The banner, or null while no override of this account's is on. Reads the stores, so a computed follows it. */
export function teOverrideBannerOf(): TEOverrideBanner | null {
  const planner = useAutoPlannerStore();
  const raw = useInitialStateStore().rawBackup;
  const override = planner.teOverride;
  const account = accountOf(raw);
  if (!(override && account && planner.teOverrideAccount === account)) return null;
  const overrideTE = VIRTUE_TE_ORDER.reduce((sum, egg) => sum + (override[egg] ?? 0), 0);
  void keptTick.value;
  const saveTime = useInitialStateStore().lastBackupTime || 0;
  const kept = readKept(account);
  const keptNow = (saveTE: number | null) => !!kept && kept.saveTime === saveTime && kept.saveTE === saveTE && kept.typed === overrideTE;
  if (!(raw as { virtue?: unknown } | null)?.virtue) return { overrideTE, saveTE: null, pendingTE: 0, tone: 'info', kept: keptNow(null) };
  // The save's TE (saveTEOf: per egg the claimed TE or the thresholds passed, whichever is more, capped at 98) less
  // its claimed TE (lib/backupVirtue.ts parseVirtueProgress `teEarned`, the save's eovEarned, as Virtue Progress
  // reads it), so "198, counting 1 not yet claimed" always adds up.
  const saveTE = saveTEOf(raw);
  const claimed = parseVirtueProgress(raw as ei.IBackup).teEarned;
  const claimedTE = VIRTUE_TE_ORDER.reduce((sum, egg) => sum + Math.min(98, claimed[egg] ?? 0), 0);
  return {
    overrideTE,
    saveTE,
    pendingTE: Math.max(0, saveTE - claimedTE),
    tone: overrideTE < saveTE ? 'lower' : 'info',
    kept: keptNow(saveTE),
  };
}

/** "Keep my typed TE": hide the banner for this save (see `kept`). The plan still starts from the typed TE. */
export function keepTypedTE(): void {
  const b = teOverrideBannerOf();
  const account = accountOf(useInitialStateStore().rawBackup);
  if (!b || !account) return;
  try {
    const k: Kept = { saveTime: useInitialStateStore().lastBackupTime || 0, saveTE: b.saveTE, typed: b.overrideTE };
    localStorage.setItem(keptKey(account), JSON.stringify(k));
  } catch {
    // this visit only: nothing to remember it by, so it shows again on the next render
  }
  keptTick.value++;
}

/**
 * Remove: Virtue Progress's Remove Override (VirtueProgressSection.vue `removeOverride`, Joo's card, read only), step
 * for step, since it is that component's own function and no store action: the override cleared, the stores set up
 * from the save again (auto/startingTE.ts `applyAutoStartingTE`), and this account's kept override forgotten
 * (`cacheTEOverride` with none: lib/autoPlannerFormCache.ts `saveAutoPlannerTEInputs(playerId, null)`). The spec
 * pins Virtue Progress's function to these three steps.
 */
export async function removeTEOverride(): Promise<void> {
  const planner = useAutoPlannerStore();
  const initialState = useInitialStateStore();
  planner.teOverride = null;
  const applied = applyAutoStartingTE();
  saveAutoPlannerTEInputs(initialState.playerId, null);
  // spec-syncclient-a: the removal's time kept, and the tombstone saved online (composables/useOverrideSync.ts).
  noteTEOverrideChange(initialState.playerId, null);
  await applied;
}
