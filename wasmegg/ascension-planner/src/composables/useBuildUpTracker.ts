/**
 * My runs' Build-up tracker (Phase 1, 30 Oct 2026; outline ~/code/aaap-tools/wireframes/buildup-tracker-v1.md): what
 * the fold shows and when the simulation is asked for the build-up list.
 *
 *   - THE PLAN. The followed route's current ascension simulated by useCurrentSim with `wantBuildUp` on (helper A's
 *     opt-in; off by default). It is asked for ONLY while the fold is open and the player is in a build-up, never during
 *     a search (useCurrentSim waits for one), and only when no plan is kept for this ascension yet: `buildUpWanted`
 *     below is the switch useNowPage hands to useCurrentSim. The first plan of an ascension is kept per account
 *     (lib/buildUpTracker.ts `writeAnchoredPlan`): tied to the save it was worked out from, so a newer save never
 *     re-plans (Re-plan is Phase 2).
 *   - THE FOLD. Closed by default, open while building: once per account and ascension, then the player's close holds
 *     (lib/buildUpTracker.ts `trackerFoldOpen`).
 *   - TICKS (Phase 1: by hand). One checkbox per line, kept per account and ascension.
 *
 * The save's time comes from the page (useNowPage `saveSeconds`: the loaded save's own backup time, which the
 * save-start rule of search/saveStart.ts keeps apart from a Manual plan's start), never from a Manual plan.
 */
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import type { BuildUpPlan } from '@/search/buildUpActions';
import type { Availability } from '@/search/availability';
import {
  buildUpTracker,
  readAnchoredPlan,
  readFoldChoice,
  readTicks,
  trackerFoldOpen,
  trackerSummary,
  writeAnchoredPlan,
  writeFoldChoice,
  writeTicks,
  type AnchoredPlan,
  type TrackerResult,
} from '@/lib/buildUpTracker';

/**
 * The switch useNowPage hands to useCurrentSim as `wantBuildUp`: on while a tracker on screen wants a plan. One for
 * the page (My runs shows one tracker).
 */
export const buildUpWanted = ref(false);

/** What the fold shows. */
export type TrackerState =
  | 'hidden' // not on virtue: no fold (as Right now)
  | 'noSave'
  | 'noRoute'
  | 'notBuilding'
  | 'working'
  | 'failed'
  | 'ready';

export interface BuildUpTrackerInputs {
  /** The account on screen (its hash), null without one. */
  account: Ref<string | null>;
  hasSave: Ref<boolean>;
  /** null: not known yet. */
  onVirtue: Ref<boolean | null>;
  /** A route is followed for the selected goal. */
  followed: Ref<boolean>;
  /** In a build-up: Right now's Building badge (lib/nowPhase.ts, before the H1 step). */
  building: Ref<boolean>;
  /** The current ascension's start (lib/buildUpTracker.ts `ascensionStartOf`), null when not known. */
  ascensionStart: Ref<number | null>;
  /** The loaded save's backup time, unix seconds. */
  saveSeconds: Ref<number>;
  zone: Ref<string>;
  hours: Ref<Availability | null>;
  now: Ref<number>;
  /** The simulation's build-up plan for this save (useCurrentSim `state.buildUp`), null until there is one. */
  fresh: Ref<BuildUpPlan | null>;
  /** The simulation's state while asked: working / waiting for a search / failed with why. */
  sim: Ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>;
}

export function useBuildUpTracker(i: BuildUpTrackerInputs) {
  /** This page's kept plan (read again when the account changes). */
  const anchored = ref<AnchoredPlan | null>(null);
  watch(
    i.account,
    a => {
      anchored.value = a ? readAnchoredPlan(a) : null;
    },
    { immediate: true }
  );
  /** The ascension the tracker is about: the plan's, else the kept plan's own. */
  const ascKey = computed(() => i.ascensionStart.value ?? anchored.value?.ascensionStart ?? i.fresh.value?.startedAt ?? null);
  /** The kept plan when it is this ascension's. */
  const plan = computed<AnchoredPlan | null>(() => {
    const a = anchored.value;
    const k = ascKey.value;
    return a && k !== null && a.ascensionStart === k ? a : null;
  });
  // The first plan of the ascension is kept; a later one (a newer save) is not (Phase 2: Re-plan).
  watch(
    i.fresh,
    p => {
      const acct = i.account.value;
      const k = ascKey.value;
      if (!p || !acct || k === null || plan.value) return;
      const a: AnchoredPlan = { ascensionStart: k, saveSeconds: i.saveSeconds.value, plan: p };
      writeAnchoredPlan(acct, a);
      anchored.value = a;
    },
    { immediate: true }
  );

  // ------------------------------------------------------------------ the fold
  const choiceVersion = ref(0);
  const choice = computed(() => {
    void choiceVersion.value;
    const acct = i.account.value;
    const k = ascKey.value;
    return acct && k !== null ? readFoldChoice(acct, k) : null;
  });
  const open = computed(() => trackerFoldOpen({ choice: choice.value, building: i.building.value && i.hasSave.value }));
  /** The player opened or closed it: kept for this account and ascension. */
  function playerToggle(isOpen: boolean): void {
    const acct = i.account.value;
    const k = ascKey.value;
    if (acct && k !== null) writeFoldChoice(acct, k, isOpen);
    choiceVersion.value++;
  }

  // ------------------------------------------------------------------ asking for the plan
  const wanted = computed(() => open.value && i.building.value && i.hasSave.value && i.followed.value && !plan.value);
  watch(wanted, w => (buildUpWanted.value = w), { immediate: true });
  // Leaving My runs: nothing wants it any more.
  onScopeDispose(() => (buildUpWanted.value = false));

  // ------------------------------------------------------------------ the list
  const result = computed<TrackerResult | null>(() => {
    const a = plan.value;
    if (!a) return null;
    return buildUpTracker({
      actions: a.plan.actions,
      zone: i.zone.value,
      hours: i.hours.value,
      siloSeconds: a.plan.siloSeconds,
      startSilos: a.plan.start?.siloCount ?? null,
      startEgg: a.plan.start?.egg ?? null,
      now: dayOf(i.now.value),
    });
  });

  // ------------------------------------------------------------------ ticks
  const tickVersion = ref(0);
  const ticks = computed(() => {
    void tickVersion.value;
    const acct = i.account.value;
    const k = ascKey.value;
    return acct && k !== null ? readTicks(acct, k) : new Set<string>();
  });
  function toggleTick(key: string, on: boolean): void {
    const acct = i.account.value;
    const k = ascKey.value;
    if (!acct || k === null) return;
    const t = new Set(ticks.value);
    if (on) t.add(key);
    else t.delete(key);
    writeTicks(acct, k, t);
    tickVersion.value++;
  }
  const summary = computed(() => (result.value ? trackerSummary(result.value, ticks.value) : null));

  const state = computed<TrackerState>(() => {
    if (i.onVirtue.value === false) return 'hidden';
    if (!i.hasSave.value) return 'noSave';
    if (!i.followed.value && !plan.value) return 'noRoute';
    if (plan.value) return 'ready';
    if (!i.building.value) return 'notBuilding';
    if (i.sim.value?.status === 'failed') return 'failed';
    return 'working';
  });
  /** Silo trick warnings in the list: the "silos too short" strip. */
  const siloWarnings = computed(() => (result.value?.lines ?? []).filter(l => l.kind === 'warning' && /silo/i.test(l.text)).length);

  return {
    state,
    open,
    playerToggle,
    wanted,
    plan,
    result,
    ticks,
    toggleTick,
    summary,
    siloWarnings,
    failReason: computed(() => (i.sim.value?.status === 'failed' ? (i.sim.value.reason ?? '') : '')),
  };
}

/** `now` to the minute, so the list is not rebuilt every second. */
function dayOf(now: number): number {
  return Math.floor(now / 60) * 60;
}
