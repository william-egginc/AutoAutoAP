/**
 * My runs' Build-up tracker (Phase 1, 30 Oct 2026; outline ~/code/aaap-tools/wireframes/buildup-tracker-v1.md): what
 * the fold shows and when the simulation is asked for the build-up list.
 *
 *   - THE PLAN. The followed route's current ascension simulated by useCurrentSim with `wantBuildUp` on (helper A's
 *     opt-in; off by default). It is asked for ONLY while the player is in a build-up, never during
 *     a search (useCurrentSim waits for one), and only when no plan is kept for this ascension yet (open or closed:
 *     the closed fold's hint is the plan's, spec-buildup-storage): `buildUpWanted`
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
import { buildUpLog, perfStep } from '@/lib/buildUpDebug';
import {
  anchoredPlanCurrent,
  buildUpTracker,
  dropAnchoredPlan,
  planBuys,
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
/**
 * The trackers on screen that want it (spec-buildstop, 30 Oct 2026): a tracker left behind (My runs mounted again)
 * that lets go after the new one said it wants the plan must not turn the switch off under it.
 */
const wanting = new Set<object>();

/** What the fold shows. */
export type TrackerState =
  | 'hidden' // not on virtue: no fold (as Right now)
  | 'noSave'
  | 'noRoute'
  | 'notBuilding'
  | 'working'
  | 'failed'
  | 'ready'
  | 'checking'; // a plan is kept and a newer save is still coming in: nothing settled to tick from yet

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
  /** The simulation's run going and whether its worker has said anything (useCurrentSim `worker`); null when no run
   *  is going. Absent: the stall counts only the waits below, never a run going. */
  simWorker?: Ref<{ since: number; heard: boolean } | null>;
  /** A search is really running in this tab (the store's `isRunning || deadlineRunning`; never `resultSending`, which
   *  has its own 10-minute cap). 'waiting' with no reason while this is false waits for nothing: the stall counts it.
   *  Absent: such a wait is taken as a search's, as before. */
  searchRunning?: Ref<boolean>;
  /** Phase 2: the loaded save as the tracker ticks from it (useNowPage `buildUpSave`); null without one. */
  saveFarm?: Ref<SaveFarm | null>;
  /** A save is still coming in (being read, or the stores not holding it yet): the card says so ('checking') rather
   *  than ticks from no save read as settled (spec-anchornewer, 6 Nov 2026). Absent: never. */
  saveLoading?: Ref<boolean>;
  /** A1 CHOICE (spec-a1choice, useNowPage `a1Finish`): Right now follows finishing without buying while a build-up
   *  exists, picked by the player ('picked') or as the sooner ('default'); null or absent: not. */
  finishChosen?: Ref<'picked' | 'default' | null>;
}

/**
 * NEVER "WORKING IT OUT" FOR GOOD (spec-buildup-stuck, 6 Nov 2026: Safari's tracker said it at 10:05 am and still at
 * 12:39 pm). A run going is bounded by useCurrentSim's own `runMs`; this bounds the rest: the plan wanted and nothing
 * going for it (no simulation state, 'done' without a plan, or the page's inputs never ready) this long reads as
 * failed, with Try again. A search running ('waiting' with no reason) is not counted: it ends by itself. Unless no
 * search is really running in this tab (`searchRunning` false, spec-stuck3): then that wait counts too.
 *
 * A SILENT WORKER (spec-stuck2, 7 Nov 2026, QA t115: every message to the worker swallowed, "working it out…" until the
 * 6-minute run bound, the stall never shown): a run going whose worker has not said a word this long (`simWorker`, from
 * the run's start) reads as failed too. A worker that answered (loaded and simulating, or sending progress) is not
 * counted: one route is one chain, which sends nothing until it ends, so its silence is left to `runMs`.
 */
const STALL = { ms: 3 * 60_000 };
/** Specs: another bound (null: back to the default). */
export function setTrackerStallMs(ms: number | null): void {
  STALL.ms = ms ?? 3 * 60_000;
}
export const TRACKER_STALL_REASON = 'nothing came back for it';

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
      const read = a ? perfStep('readAnchoredPlan', () => readAnchoredPlan(a)) : null;
      // A kept plan with no buys, or no usable ascension start, reads as none (spec-buildcache: an old, corrupt or empty
      // record must never read as "plan present"; spec-noemptybuild: nor one whose list buys nothing, a build-up kept
      // before search/leg.ts stopped offering those).
      // Release 7 (lib/resultCode.ts): nor one an older build worked out; it is planned again once, the ticks kept.
      const usable = read && Number.isFinite(read.ascensionStart) && planBuys(read.plan) ? read : null;
      const ok = usable && anchoredPlanCurrent(usable) ? usable : null;
      if (a && read && !ok) dropAnchoredPlan(a);
      buildUpLog(
        a
          ? ok
            ? `tracker plan read (${ok.plan.actions.length} actions)`
            : usable
              ? 'tracker plan from an older build: dropped, planned again'
              : read
                ? 'tracker plan read but buys nothing: dropped'
                : 'no tracker plan kept'
          : 'no account'
      );
      anchored.value = keep(ok);
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
      // A plan that buys nothing is no build-up (`freshBuysNothing`): never kept.
      if (!planBuys(p)) {
        buildUpLog('the simulated plan buys nothing: not kept, nothing to buy');
        return;
      }
      const a: AnchoredPlan = { ascensionStart: k, ...anchorOf(p), plan: p };
      // Kept here (compacted): useCurrentSim's own copy of the raw plan (lib/followSim.ts BUILDUP_PLAN_KEY, ~250 kB
      // on the synthetic save) is then not needed, and the plan is not asked for again in this ascension.
      const stored = perfStep('writeAnchoredPlan', () => writeAnchoredPlan(acct, a));
      if (stored) dropSimPlanCopy();
      buildUpLog(`tracker plan kept (${p.actions.length} actions, ${stored ? 'stored' : 'not stored'})`);
      anchored.value = keep(a);
    },
    { immediate: true }
  );
  /**
   * THE ANCHOR (spec-anchornewer, 6 Nov 2026): the save the plan was SIMULATED FROM, carried with it (BuildUpPlan
   * `from`, useCurrentSim), its time and its farm. Never the page's save at the moment the plan is kept: a newer save
   * loaded in between made the anchor farm newer than the plan's start (nothing ticked: 'beforePrestige') and its time
   * the save on screen's own (no Re-plan: the save was "not newer than the plan's"). A plan worked out before carries
   * none: the page's save then, as before.
   */
  function anchorOf(p: BuildUpPlan): { saveSeconds: number; anchorFarm?: SaveFarm } {
    if (p.from) return { saveSeconds: p.from.backupTime, ...(p.from.farm ? { anchorFarm: p.from.farm } : {}) };
    const f = saveFarm.value;
    return { saveSeconds: i.saveSeconds.value, ...(f ? { anchorFarm: f } : {}) };
  }

  /** This save's simulated ascension came back and buys nothing (continue, or nothing left to build): no build-up to
   *  track, so "nothing to buy" and nothing asked for (spec-noemptybuild). */
  const freshBuysNothing = computed(() => !!i.fresh.value && !planBuys(i.fresh.value));

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
    buildUpLog(`fold ${isOpen ? 'opened' : 'closed'} by the player`);
    if (acct && k !== null) writeFoldChoice(acct, k, isOpen);
    choiceVersion.value++;
  }

  // ------------------------------------------------------------------ asking for the plan
  /** A1 CHOICE: finishing without buying is followed: nothing to buy, no plan asked for, a kept plan left as it is
   *  (Keep building brings it back). */
  const finishChosen = computed(() => i.finishChosen?.value ?? null);
  /**
   * NOT ONLY WHILE OPEN (spec-buildup-storage, 6 Nov 2026: Safari's normal window said "working it out" for good while
   * a private window had the plan). The closed fold's hint is the plan's ("0 of 105 check-ins done · next ..."), so a
   * player's close (kept per account and ascension) must not stop the plan being asked for: with an older build's plan
   * dropped on load, nothing was ever asked and the stall bound, which counts only a wanted plan, never fired.
   */
  const wanted = computed(
    () =>
      !finishChosen.value &&
      i.building.value &&
      i.hasSave.value &&
      i.followed.value &&
      (!plan.value || replanning.value) &&
      !(freshBuysNothing.value && !replanning.value)
  );
  const me = {};
  watch(
    wanted,
    w => {
      buildUpLog(`tracker wants the plan: ${w ? 'yes' : 'no'}`);
      if (w) wanting.add(me);
      else wanting.delete(me);
      buildUpWanted.value = wanting.size > 0;
    },
    { immediate: true }
  );
  // Leaving My runs: this tracker wants it no more.
  onScopeDispose(() => {
    wanting.delete(me);
    buildUpWanted.value = wanting.size > 0;
  });

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
    const zone = i.zone.value;
    const hours = JSON.parse(hoursKey.value) as Availability | null;
    const now = today.value.at;
    return markRaw(
      perfStep('buildUpTracker', () =>
        buildUpTracker({
          actions: a.plan.actions,
          zone,
          hours,
          siloSeconds: a.plan.siloSeconds,
          startSilos: a.plan.start?.siloCount ?? null,
          startEgg: a.plan.start?.egg ?? null,
          saleCount: a.plan.saleCount ?? null,
          variantKey: a.plan.variantKey,
          now,
        })
      )
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
   * The save to tick from, and the anchor save's farm. The anchor farm is for a plan that STARTS AFRESH only (it tells
   * a save from before the prestige): a build-up plan is the same ascension, so a save holding its start is all it
   * needs, whatever the anchor (spec-anchornewer). A plan kept before Phase 2 has no anchor farm: on the anchor save
   * itself that save's farm is it; on another save a plan that starts afresh can't tell a save from before its
   * prestige, so nothing is automatic there (the checkbox only) until a re-plan.
   */
  const tickFrom = computed(() => {
    const a = plan.value;
    const save = saveFarm.value;
    if (!a) return { save: null, anchorFarm: null };
    const startsAfresh = a.plan.variantKey !== 'buildup' && a.plan.variantKey !== 'continue';
    if (!startsAfresh) return { save, anchorFarm: null };
    const anchorFarm = a.anchorFarm ?? (i.saveSeconds.value === a.saveSeconds ? save : null);
    return { save: anchorFarm ? save : null, anchorFarm };
  });
  /** What the save says, line by line. */
  const bought = computed<BoughtResult | null>(() => {
    const r = result.value;
    const a = plan.value;
    if (!r || !a) return null;
    const { save, anchorFarm } = tickFrom.value;
    return perfStep('boughtFromSave', () => boughtFromSave({ lines: r.lines, save, start: a.plan.start, startEgg: a.plan.start?.egg, anchorFarm }));
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
    const saveSeconds = i.saveSeconds.value;
    return perfStep('replanOffer', () =>
      replanOffer({
        lines: r.lines,
        save,
        start: a.plan.start,
        startEgg: a.plan.start?.egg,
        saveSeconds,
        anchorSeconds: a.saveSeconds,
        anchorFarm,
      })
    );
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
    // This save's plan buys nothing (the build is done): no build-up left, the kept plan goes (spec-noemptybuild).
    if (!planBuys(p)) {
      dropAnchoredPlan(acct);
      anchored.value = null;
      replanning.value = false;
      replanError.value = '';
      return;
    }
    const a: AnchoredPlan = { ascensionStart: k, ...anchorOf(p), plan: p };
    const zone = i.zone.value;
    const hours = i.hours.value;
    const now = dayOf(i.now.value);
    const keys = perfStep('buildUpTracker (re-plan keys)', () => buildUpTracker({ actions: p.actions, zone, hours, siloSeconds: p.siloSeconds, startSilos: p.start?.siloCount ?? null, startEgg: p.start?.egg ?? null, now })).lines
      .filter(l => l.tickable)
      .map(l => l.key);
    const kept = carryTicks(overrides.value, keys);
    if (perfStep('writeAnchoredPlan', () => writeAnchoredPlan(acct, a))) dropSimPlanCopy();
    else dropAnchoredPlan(acct);
    anchored.value = keep(a);
    saveOverrides(kept.on, kept.off);
    replanning.value = false;
    replanError.value = '';
  }
  /** Off-plan buys in words for the strip ('Comfortable Nests 51'): research by name, the rest by kind. */
  const offPlanWords = computed(() => (offer.value?.offPlan ?? []).map(offPlanWord));

  // ------------------------------------------------------------------ the stall bound
  const stalled = ref(false);
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  function clearStall(): void {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
    stalled.value = false;
  }
  /** Waiting for nothing that will come by itself: no state, done without the plan, or the page's inputs not ready. */
  const idleWaiting = computed(() => {
    if (!wanted.value || replanning.value) return false;
    const s = i.sim.value;
    if (!s) return true;
    if (s.status === 'done') return !i.fresh.value;
    // A search's wait ends with the search; one with no search running in this tab (spec-stuck3, 7 Nov 2026: Safari's
    // tracker waited for good on a fresh load with no search started) waits for nothing.
    return s.status === 'waiting' && (!!s.reason || (!!i.searchRunning && !i.searchRunning.value));
  });
  /** A run going whose worker has not said a word: since when (the run's start); null otherwise. */
  const silentSince = computed(() => {
    const w = i.simWorker?.value;
    return wanted.value && !replanning.value && w && !w.heard ? w.since : null;
  });
  /** A run going whose worker answered: it is simulating, bounded by useCurrentSim's `runMs`. */
  const workerAnswered = computed(() => !!i.simWorker?.value?.heard);
  // Started afresh whenever the simulation's state changes (a retry, a new run): only an unchanged wait counts. A
  // silent worker counts from its run's start, whatever changed meanwhile.
  watch(
    [idleWaiting, i.sim, silentSince, workerAnswered],
    ([idle, , quiet, answered]) => {
      clearStall();
      const left = quiet !== null ? quiet + STALL.ms - Date.now() : idle && !answered ? STALL.ms : null;
      if (left === null) return;
      stallTimer = setTimeout(() => {
        stallTimer = null;
        buildUpLog(`tracker stalled: ${TRACKER_STALL_REASON}${quiet !== null ? ' (the worker said nothing)' : ''}`);
        stalled.value = true;
      }, Math.max(0, left));
    },
    { immediate: true }
  );
  onScopeDispose(clearStall);
  /** Try again: the stall forgotten (the caller asks the simulation again). */
  function retry(): void {
    buildUpLog('tracker retry');
    clearStall();
  }

  /** A kept plan and a save still coming in: nothing to tick from that is settled yet (spec-anchornewer). */
  const checking = computed(() => !!plan.value && !!i.saveLoading?.value);
  const shown = computed<TrackerState>(() => {
    if (i.onVirtue.value === false) return 'hidden';
    if (checking.value) return 'checking';
    if (!i.hasSave.value) return 'noSave';
    if (!i.followed.value && !plan.value) return 'noRoute';
    if (finishChosen.value) return 'notBuilding';
    if (plan.value) return 'ready';
    if (!i.building.value || freshBuysNothing.value) return 'notBuilding';
    if (i.sim.value?.status === 'failed' || stalled.value) return 'failed';
    return 'working';
  });
  const state = shown;
  watch(shown, (s, was) => buildUpLog(`tracker ${was ?? 'start'} -> ${s}${s === 'failed' ? ` (${i.sim.value?.reason ?? ''})` : ''}`), { immediate: true });
  watch(open, o => buildUpLog(`fold ${o ? 'open' : 'closed'}`), { immediate: true });
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
    /** A1 CHOICE: why there is nothing to buy ('picked' / 'default'), for the tracker's own words; null otherwise. */
    finishChosen,
    failReason: computed(() => (i.sim.value?.status === 'failed' ? (i.sim.value.reason ?? '') : stalled.value ? TRACKER_STALL_REASON : '')),
    retry,
    /** The failure was a stop (its worker torn down) rather than the simulation's own: said so, with Try again. */
    failStopped: computed(() => i.sim.value?.status === 'failed' && /stopped|terminated|paused/i.test(i.sim.value.reason ?? '')),
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
