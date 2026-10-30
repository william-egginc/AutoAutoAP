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
 *   - TICKS. Phase 2: from the SAVE (lib/buildUpBought.ts): a line whose items the save holds is ticked by itself, so a
 *     newer save only adds ticks within the fixed plan. The player's checkbox is an override both ways (kept per account
 *     and ascension: ticked under the Phase 1 key, unticked under `unticksKey`) and can be cleared back to the save's.
 *   - RE-PLAN (Phase 2, outline question 2): offered when the save is over 1 h behind the plan or has bought things
 *     off-plan (lib/buildUpBought.ts `replanOffer`). It asks useCurrentSim for this save's plan while the old one stays
 *     on screen; when it comes it replaces the kept plan, re-anchored on this save, with the overrides of lines that
 *     are still in it (`carryTicks`); if it fails the old plan stays and the reason shows.
 *
 * The save's time comes from the page (useNowPage `saveSeconds`: the loaded save's own backup time, which the
 * save-start rule of search/saveStart.ts keeps apart from a Manual plan's start), never from a Manual plan.
 */
import { computed, markRaw, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { calendarOf } from '@/lib/clock';
import type { BuildUpPlan } from '@/search/buildUpActions';
import { getResearchById } from '@/calculations/commonResearch';
import type { Availability } from '@/search/availability';
import { BUILDUP_PLAN_KEY } from '@/lib/followSim';
import {
  buildUpTracker,
  dropAnchoredPlan,
  readAnchoredPlan,
  readFoldChoice,
  readTicks,
  readUnticks,
  trackerFoldOpen,
  trackerSummary,
  writeAnchoredPlan,
  writeFoldChoice,
  writeTicks,
  writeUnticks,
  type AnchoredPlan,
  type TrackerResult,
} from '@/lib/buildUpTracker';
import {
  boughtFromSave,
  carryTicks,
  effectiveTicks,
  replanOffer,
  type BoughtResult,
  type OffPlanItem,
  type SaveFarm,
} from '@/lib/buildUpBought';

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
  /** Phase 2: the loaded save as the tracker ticks from it (useNowPage `buildUpSave`); null without one. */
  saveFarm?: Ref<SaveFarm | null>;
}

export function useBuildUpTracker(i: BuildUpTrackerInputs) {
  /**
   * This page's kept plan (read again when the account changes). NOT deeply reactive (build-up perf, 30 Oct 2026): a
   * shallow ref of a raw object, replaced whole, so its hundreds to thousands of buys are never wrapped or walked by
   * Vue. Read from storage once per account; written only when a plan is kept.
   */
  const anchored = shallowRef<AnchoredPlan | null>(null);
  const keep = (a: AnchoredPlan | null): AnchoredPlan | null => (a ? markRaw({ ...a, plan: markRaw(a.plan) }) : null);
  /** Re-plan: asked for and not in yet; why the last one failed. */
  const replanning = ref(false);
  const replanError = ref('');
  watch(
    i.account,
    a => {
      anchored.value = a ? keep(readAnchoredPlan(a)) : null;
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
  const saveFarm = computed(() => i.saveFarm?.value ?? null);
  // The first plan of the ascension is kept; a later one (a newer save) is not, unless the player re-plans. Also when
  // the ascension's key moves while this save's plan is in (the page's estimate of the ascension's start changed): the
  // plan of this save is kept under the new key, never asked for again (30 Oct 2026: "working it out…" for minutes
  // with the plan already worked out).
  watch(
    [i.fresh, ascKey],
    ([p]) => {
      if (replanning.value) {
        adoptReplan(p);
        return;
      }
      const acct = i.account.value;
      const k = ascKey.value;
      if (!p || !acct || k === null || plan.value) return;
      const a: AnchoredPlan = { ascensionStart: k, saveSeconds: i.saveSeconds.value, plan: p, ...anchorFarmNow() };
      // Kept here (compacted): useCurrentSim's own copy of the raw plan (lib/followSim.ts BUILDUP_PLAN_KEY, ~250 kB
      // on the synthetic save) is then not needed, and the plan is not asked for again in this ascension.
      if (writeAnchoredPlan(acct, a)) dropSimPlanCopy();
      anchored.value = keep(a);
    },
    { immediate: true }
  );
  function anchorFarmNow(): { anchorFarm?: SaveFarm } {
    const f = saveFarm.value;
    return f ? { anchorFarm: f } : {};
  }

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
  const wanted = computed(
    () => open.value && i.building.value && i.hasSave.value && i.followed.value && (!plan.value || replanning.value)
  );
  watch(wanted, w => (buildUpWanted.value = w), { immediate: true });
  // Leaving My runs: nothing wants it any more.
  onScopeDispose(() => (buildUpWanted.value = false));

  // ------------------------------------------------------------------ the list
  /**
   * The day it is in the zone, with the first moment seen in it. The list reads `now` only for the day (today's day
   * opens, a year on other years' titles), so a clock tick inside the day changes nothing here: the same object comes
   * back and the list is not worked out again (build-up perf, 30 Oct 2026).
   */
  let dayRep = { ymd: '', at: 0 };
  const today = computed(() => {
    const n = i.now.value;
    const ymd = calendarOf(n * 1000, i.zone.value)?.ymd ?? String(Math.floor(n / 86400));
    if (ymd !== dayRep.ymd) dayRep = { ymd, at: dayOf(n) };
    return dayRep;
  });
  /** The hours as a key, so an equal window handed again does not rebuild the list. */
  const hoursKey = computed(() => JSON.stringify(i.hours.value ?? null));
  const result = computed<TrackerResult | null>(() => {
    const a = plan.value;
    if (!a) return null;
    return markRaw(
      buildUpTracker({
        actions: a.plan.actions,
        zone: i.zone.value,
        hours: JSON.parse(hoursKey.value) as Availability | null,
        siloSeconds: a.plan.siloSeconds,
        startSilos: a.plan.start?.siloCount ?? null,
        startEgg: a.plan.start?.egg ?? null,
        now: today.value.at,
      })
    );
  });

  // ------------------------------------------------------------------ ticks (Phase 2: from the save, the player's override)
  const tickVersion = ref(0);
  /** The player's own ticks (`on`) and unticks (`off`) for this ascension. */
  const overrides = computed(() => {
    void tickVersion.value;
    const acct = i.account.value;
    const k = ascKey.value;
    return acct && k !== null ? { on: readTicks(acct, k), off: readUnticks(acct, k) } : { on: new Set<string>(), off: new Set<string>() };
  });
  /**
   * The save to tick from, and the anchor save's farm. A plan kept before Phase 2 has no anchor farm: on the anchor
   * save itself that save's farm is it; on another save a plan that starts afresh can't tell a save from before its
   * prestige, so nothing is automatic there (the checkbox only) until a re-plan.
   */
  const tickFrom = computed(() => {
    const a = plan.value;
    const save = saveFarm.value;
    if (!a) return { save: null, anchorFarm: null };
    const anchorFarm = a.anchorFarm ?? (i.saveSeconds.value === a.saveSeconds ? save : null);
    const startsAfresh = a.plan.variantKey !== 'buildup' && a.plan.variantKey !== 'continue';
    return { save: !anchorFarm && startsAfresh ? null : save, anchorFarm };
  });
  /** What the save says, line by line. */
  const bought = computed<BoughtResult | null>(() => {
    const r = result.value;
    const a = plan.value;
    if (!r || !a) return null;
    const { save, anchorFarm } = tickFrom.value;
    return boughtFromSave({ lines: r.lines, save, start: a.plan.start, startEgg: a.plan.start?.egg, anchorFarm });
  });
  /** The save's tick per tickable line: true / false, null when the save can't tell. */
  const auto = computed(() => {
    const m = new Map<string, boolean | null>();
    for (const l of result.value?.lines ?? []) if (l.tickable) m.set(l.key, bought.value?.lines.get(l.key)?.auto ?? null);
    return m;
  });
  const effective = computed(() => effectiveTicks(auto.value, overrides.value.on, overrides.value.off));
  /** The ticks shown. */
  const ticks = computed(() => effective.value.ticked);
  /** Per line with an override or a tick: 'you' or 'save'. */
  const tickSource = computed(() => effective.value.source);
  function saveOverrides(on: Set<string>, off: Set<string>): void {
    const acct = i.account.value;
    const k = ascKey.value;
    if (!acct || k === null) return;
    writeTicks(acct, k, on);
    writeUnticks(acct, k, off);
    tickVersion.value++;
  }
  /** The player's checkbox: an override, unless it says what the save says (then the save's again). */
  function toggleTick(key: string, isOn: boolean): void {
    const a = auto.value.get(key) ?? null;
    const on = new Set(overrides.value.on);
    const off = new Set(overrides.value.off);
    on.delete(key);
    off.delete(key);
    if (isOn !== (a === true)) (isOn ? on : off).add(key);
    saveOverrides(on, off);
  }
  /** Back to what the save says. */
  function clearTick(key: string): void {
    const on = new Set(overrides.value.on);
    const off = new Set(overrides.value.off);
    on.delete(key);
    off.delete(key);
    saveOverrides(on, off);
  }
  const summary = computed(() => (result.value ? trackerSummary(result.value, ticks.value) : null));

  // ------------------------------------------------------------------ re-plan
  const offer = computed(() => {
    const r = result.value;
    const a = plan.value;
    const { save, anchorFarm } = tickFrom.value;
    if (!r || !a || !save) return null;
    return replanOffer({
      lines: r.lines,
      save,
      start: a.plan.start,
      startEgg: a.plan.start?.egg,
      saveSeconds: i.saveSeconds.value,
      anchorSeconds: a.saveSeconds,
      anchorFarm,
    });
  });
  /** The button shows (or is working, or has failed: the old plan stays). */
  const replanShown = computed(() => !!offer.value?.show || replanning.value || !!replanError.value);
  /** Overrides the player has: the button says those that still match are kept. */
  const hasOverrides = computed(() => overrides.value.on.size + overrides.value.off.size > 0);
  /** "Re-plan from this save": asks for this save's plan; the old one stays until it comes. */
  function replan(): void {
    if (replanning.value || !plan.value) return;
    replanError.value = '';
    replanning.value = true;
    // Already here for this save (and not the kept one): taken at once.
    if (i.fresh.value && i.fresh.value !== plan.value.plan) return adoptReplan(i.fresh.value);
    failIfSimFailed();
  }
  function failIfSimFailed(): void {
    const s = i.sim.value;
    if (replanning.value && s?.status === 'failed') {
      replanning.value = false;
      replanError.value = s.reason || 'unknown reason';
    }
  }
  watch(i.sim, failIfSimFailed);
  // A newer save may be re-planned again (the failure was this save's); the next account or ascension starts clean.
  watch([i.saveSeconds, i.account, ascKey], () => {
    replanError.value = '';
    replanning.value = false;
  });
  /** The new plan: kept in place of the old one, anchored on this save, with the overrides of lines still in it. */
  function adoptReplan(p: BuildUpPlan | null): void {
    const acct = i.account.value;
    const k = ascKey.value;
    const old = plan.value;
    if (!p || !acct || k === null || (old && p === old.plan)) return;
    const a: AnchoredPlan = { ascensionStart: k, saveSeconds: i.saveSeconds.value, plan: p, ...anchorFarmNow() };
    const keys = buildUpTracker({ actions: p.actions, zone: i.zone.value, hours: i.hours.value, siloSeconds: p.siloSeconds, startSilos: p.start?.siloCount ?? null, startEgg: p.start?.egg ?? null, now: dayOf(i.now.value) }).lines
      .filter(l => l.tickable)
      .map(l => l.key);
    const kept = carryTicks(overrides.value, keys);
    if (writeAnchoredPlan(acct, a)) dropSimPlanCopy();
    else dropAnchoredPlan(acct);
    anchored.value = keep(a);
    saveOverrides(kept.on, kept.off);
    replanning.value = false;
    replanError.value = '';
  }
  /** Off-plan buys in words for the strip ('Comfortable Nests 51'): research by name, the rest by kind. */
  const offPlanWords = computed(() => (offer.value?.offPlan ?? []).map(offPlanWord));

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
    tickSource,
    toggleTick,
    clearTick,
    bought,
    summary,
    offer,
    offPlanWords,
    replan,
    replanning,
    replanError,
    replanShown,
    hasOverrides,
    siloWarnings,
    failReason: computed(() => (i.sim.value?.status === 'failed' ? (i.sim.value.reason ?? '') : '')),
  };
}

/** useCurrentSim's kept copy of the raw plan, once the tracker keeps its own. Never throws. */
function dropSimPlanCopy(): void {
  try {
    localStorage.removeItem(BUILDUP_PLAN_KEY);
  } catch {
    /* nothing kept */
  }
}

/** `now` to the minute, so the list is not rebuilt every second. */
function dayOf(now: number): number {
  return Math.floor(now / 60) * 60;
}

/** One off-plan buy in words (DRAFT): 'Comfortable Nests 51', 'a better hab in slot 1', 'silo #5'. */
function offPlanWord(o: OffPlanItem): string {
  const [a, b, c] = o.what.split(' ');
  switch (o.kind) {
    case 'research':
      return `${(o.id && getResearchById(o.id)?.name) || a} ${b}`;
    case 'hab':
      return `hab slot ${Number(a) + 1}`;
    case 'vehicle':
      return `vehicle slot ${Number(a) + 1}`;
    case 'trainCar':
      return `train cars in slot ${Number(a) + 1} (${c})`;
    case 'silo':
      return `silo #${a}`;
  }
}
