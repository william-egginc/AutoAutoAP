/**
 * Everything My runs' "Right now" page shows, read from what is already here (spec myruns-now v3; build plan
 * aaap-tools/specialists/ui-nowpage-build.md). NOTHING is worked out again: no instant answer, no Check exactly,
 * no search, no worker. The reads:
 *
 *   the loaded save            the raw backup itself (its time, farm, TE, eggs: lib/saveFreshness.ts, lib/farmFacts.ts);
 *                              the stores only for the instant answer's key and the gear sets, once they hold it
 *   saved instant answers      localStorage `aap-instant-snap:<key>|0` (the whole answer, kept after Check exactly,
 *                              24 h at most) and its index (each answer's account, goal and save), parsed once per
 *                              key; `aap-instant-answer:<key>` (the last checked answer, no age limit)
 *   Check exactly's history    IndexedDB, per account
 *   saved answers              the store's list (By a date)
 *   board rows                 the ones My runs' board part already loaded (passed in)
 *
 * The one thing worked out here is the two artifact sets (earnings and production), from the save: pure and a few
 * milliseconds, the same calls the instant answer makes for its key every time it opens (store `readInventory`);
 * once per save. The farm's rates (lib/farmFacts.ts) are the planner's own formulas at the save's moment.
 *
 * The keys are the instant answer's own (search/instantSnapshot.ts `instantKey`), built from the same store
 * values InstantRoute.vue reads, so an answer worked out on Fastest or By a date is found here.
 */
import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import {
  ANSWER_PREFIX,
  instantGoal,
  instantKey,
  instantSnapKey,
  readSnapIndex,
  readSnapshot,
  snapshotUsable,
} from '@/search/instantSnapshot';
import { readFilters } from '@/search/instantFilters';
import { virtueInventory } from '@/search/csv';
import { accountOf } from '@/search/runSaves';
import { loadHistory, type CheckEntry } from '@/search/checkHistory';
import { GEAR_RULE } from '@/search/tableGear';
import { getSimulationContext } from '@/engine/adapter';
import { saveOnVirtue } from '@/lib/onVirtue';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { calculateClothedTEForSet } from '@/lib/artifacts/virtue';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { BoardRow } from '@/lib/leaderboardRank';
import { hoursDiffer, simulatorAge } from '@/lib/myRunsDashboard';
import { useMinuteClock } from './useMinuteClock';
import { backupSecondsOf, saveStrip, saveTEByEggOf, saveTEOf } from '@/lib/saveFreshness';
import { hashID } from '@/lib/storage/db';
import { virtueEggOf } from '@/lib/virtueEggs';
import {
  SAVE_EGG_ORDER,
  ascensionAt,
  mergeSimultaneousShifts,
  onTrack,
  planEvents,
  planFromSnapshot,
  shiftsAfter,
  tableEvents,
  type NowPlan,
  type SnapLike,
} from '@/lib/nowPlan';
import { buildTile, type SavedDateAnswer, type Tile } from '@/lib/savedTiles';
import {
  currentSetup,
  otherSetupLabel,
  pickCardPlan,
  pricedWithWords,
  setupCheck,
  todayIn,
  type CardCandidate,
  type PricedSetup,
} from '@/lib/currentAnswer';
import { eggLines, farmFacts, saveEggCountsOf, saveFarmOf } from '@/lib/farmFacts';
import { nextShiftCostAt, plannedShiftsCost } from '@/lib/shiftCost';
import { dateStanding, raceStanding, type Standing } from '@/lib/standing';

/** The race the Fastest tile is for first (the board's), then the player's own target. */
export const RACE_TARGET = 490;

type Goal = { goal: 'fastest'; target: number; deadline: null } | { goal: 'date'; target: number; deadline: number };

export interface CardPlan {
  plan: NowPlan;
  goal: Goal;
  /** 'this-save': worked out from the loaded save and setup. 'setup-changed': the same save, another setup.
   *  'older-save': worked out from an earlier save (its own time in `plan.meta.backupTime`). */
  state: 'this-save' | 'setup-changed' | 'older-save';
  /** "priced with your hours 7 am to 1 am, no time off" (lib/currentAnswer.ts `pricedWithWords`). */
  pricedWith?: string;
  /** A better plan of the same goal and save priced with other hours: its plan and label ("with any hour (before
   *  your hours changed)"); null when none. */
  secondary?: { plan: NowPlan; label: string } | null;
}

/**
 * The instant answer's key for a goal, from the same store values InstantRoute.vue's `cacheKey` reads (its
 * filters as remembered in this browser): null without a save. Needs an active Pinia.
 */
export function instantKeyFromStores(deadline: number | null, finalTE: number): string | null {
  const store = useChainSearchStore();
  const r = useInitialStateStore().rawBackup as { eiUserId?: string } | null;
  if (!r?.eiUserId) return null;
  try {
    const inputs = store.collectInputs();
    const inv = virtueInventory(r);
    const filters = readFilters();
    return instantKey({
      playerId: r.eiUserId,
      deadline,
      finalTE,
      currentTE: store.currentTE,
      eggsDelivered: inputs.baseState.eggsDelivered,
      artifacts: inv.artifacts,
      stones: inv.stones,
      epic: inputs.context.epicResearchLevels,
      availability: store.availability,
      timeOff: store.timeOff,
      milestones: store.milestones,
      firstAscension: inputs.firstAscension,
      useHours: store.scheduleEnabled && !!store.availability && filters.inHours,
      maxAscensions: filters.maxAscensions,
    });
  } catch {
    return null;
  }
}

export function useNowPage(o: { myRows: Ref<BoardRow[] | null>; boardRows: Ref<BoardRow[] | null> }) {
  const store = useChainSearchStore();
  const initial = useInitialStateStore();
  const planner = useAutoPlannerStore();
  const now = useMinuteClock();
  const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  // ------------------------------------------------------------------------------------------ the save

  /**
   * The save is `rawBackup`, and on this page it wins: every TE, egg, farm and time below is read from the save
   * itself, never from the initial-state store's TE, egg or farm fields. Those can be another state of it:
   *   - a page load restores the Manual planner's draft (hydrate: `lastBackupTime` 0, the TE and egg of whenever that
   *     plan was made) beside the save (fix 20);
   *   - an account switch (`submitPlayerId`) loads the save without rolling the pending Truth Eggs up, and moves the
   *     farm on to "now" (`catchUpFarmState`): on beta the main account's card said "159 TE so far" (the CLAIMED TE)
   *     and both tiles "Your TE has moved since" over a save at 191 (fix 21).
   * The page shows once the stores hold THIS save (same save time); App sets them up the Auto Planner's way on My
   * runs. What has to match another screen or the planner's setup (the instant answer's key, the gear sets) waits
   * for `storeReady`: the stores set up from this save with its pending TE rolled up, as Fastest and By a date have.
   */
  const raw = computed(() => (backupSecondsOf(initial.rawBackup) > 0 ? initial.rawBackup : null));
  const saveSeconds = computed(() => backupSecondsOf(raw.value));
  const storeHasSave = computed(() => !!raw.value && initial.hasData && initial.lastBackupTime === saveSeconds.value);
  const storeReady = computed(() => storeHasSave.value && Math.floor(store.currentTE) === saveTEOf(raw.value));
  const hasSave = computed(() => storeHasSave.value);
  /** A save is here but the stores don't hold it yet: the page waits for it (App loads it). */
  const saveWaiting = computed(() => !!raw.value && !storeHasSave.value);
  const onVirtue = computed(() => saveOnVirtue(raw.value));
  const account = computed(() => accountOf(raw.value));
  /** The save's virtue farm, as the save has it. */
  const farm = computed(() => saveFarmOf(raw.value));
  const currentEgg = computed(() => (hasSave.value && onVirtue.value ? virtueEggOf(farm.value?.eggType) : null));
  const teByEgg = computed(() => saveTEByEggOf(raw.value));
  const teSoFar = computed(() => (hasSave.value ? saveTEOf(raw.value) : 0));
  const strip = computed(() => saveStrip(saveSeconds.value, now.value, zone.value));

  // ------------------------------------------------------------------------------------- the keys

  const eggDayYear = nextEggDayYear();
  const eggDayAt = eggDaySeconds(eggDayYear);

  const keyFor = (deadline: number | null, finalTE: number) =>
    hasSave.value && storeReady.value ? instantKeyFromStores(deadline, finalTE) : null;

  const goals = computed<Goal[]>(() => {
    const list: Goal[] = [{ goal: 'fastest', target: RACE_TARGET, deadline: null }];
    if (store.finalTE !== RACE_TARGET) list.push({ goal: 'fastest', target: store.finalTE, deadline: null });
    list.push({ goal: 'date', target: store.finalTE, deadline: eggDayAt });
    return list;
  });
  /** Fastest's goal words use the target in the key (`target 490`); By a date's its deadline. */
  const keys = computed(() =>
    goals.value.map(g => ({ g, key: keyFor(g.deadline, g.deadline ? store.finalTE : g.target) }))
  );

  /** Parsed once per key (a snapshot can be 600 kB). */
  const parsed = new Map<string, SnapLike | null>();
  function snapOf(snapKey: string | null): SnapLike | null {
    if (!snapKey) return null;
    if (!parsed.has(snapKey)) {
      const s = readSnapshot<SnapLike & { v?: number; header?: unknown; ownChanged?: string; gearRule?: number }>(snapKey);
      parsed.set(snapKey, s && s.result && snapshotUsable(s, GEAR_RULE) ? s : null);
    }
    return parsed.get(snapKey) ?? null;
  }
  function lastCheckedOf(answerKey: string | null): { at: number; chain: number[]; end: number; endTE: number } | null {
    if (!answerKey || typeof localStorage === 'undefined') return null;
    try {
      const v = JSON.parse(localStorage.getItem(answerKey) ?? 'null');
      return v && Array.isArray(v.chain) && v.chain.length && typeof v.at === 'number' ? v : null;
    } catch {
      return null;
    }
  }

  /** The snapshot index (small), read again when the save or setup changes. */
  const index = computed(() => {
    void keys.value;
    return readSnapIndex();
  });

  function planOf(g: Goal, s: SnapLike | null): NowPlan | null {
    return planFromSnapshot(s, g.goal, g.deadline);
  }

  // ------------------------------------------------------------------------------- the card's plan

  /** Your setup now (the hours and time off every answer is compared with) and today in the planner's zone. */
  const setupNow = computed<{ setup: PricedSetup; today: string }>(() => ({
    setup: { availability: store.availability ?? null, timeOff: store.timeOff ?? [] },
    today: todayIn(now.value * 1000, zone.value),
  }));

  /**
   * Every kept snapshot Right now could show, each with how it was priced (lib/currentAnswer.ts): this save's own
   * key for each goal (priced with Your setup now: the key holds it), then the index's snapshots of this account and
   * goal under other keys (the same save with another setup, or an earlier save), with the setup each recorded.
   */
  const snapCandidates = computed<CardCandidate[]>(() => {
    if (!hasSave.value) return [];
    const out: CardCandidate[] = [];
    const seen = new Set<string>();
    const sn = setupNow.value;
    keys.value.forEach(({ g, key }, goalIndex) => {
      const snapKey = instantSnapKey(key);
      if (!snapKey) return;
      seen.add(snapKey);
      const p = planOf(g, snapOf(snapKey));
      if (p) out.push({ plan: p, goalIndex, ownKey: true, check: currentSetup(sn.setup) });
    });
    const acct = account.value;
    if (!acct) return out;
    const goalWords = (g: Goal) => instantGoal(g.deadline, g.deadline ? store.finalTE : g.target);
    for (const e of [...index.value].reverse()) {
      const m = e.meta;
      if (!m || m.account !== acct || seen.has(e.key)) continue;
      const goalIndex = keys.value.findIndex(({ g }) => goalWords(g) === m.goal);
      if (goalIndex < 0) continue;
      const p = planOf(keys.value[goalIndex].g, snapOf(e.key));
      if (!p) continue;
      seen.add(e.key);
      out.push({ plan: p, goalIndex, ownKey: false, check: setupCheck(m.setup ?? null, sn.setup, sn.today) });
    }
    return out;
  });

  /** Right now's plan: the same rule as the tiles (lib/currentAnswer.ts `pickCardPlan`). */
  const cardPlan = computed<CardPlan | null>(() => {
    const pick = pickCardPlan(snapCandidates.value, saveSeconds.value);
    if (!pick) return null;
    const c = pick.candidate;
    return {
      plan: c.plan,
      goal: keys.value[c.goalIndex].g,
      state: pick.state,
      pricedWith: pricedWithWords(c.check),
      secondary: pick.secondary ? { plan: pick.secondary.plan, label: otherSetupLabel(pick.secondary.check) } : null,
    };
  });

  /** Shifts at the same minute are one row (Joo's H1 step, then K3): nowPlan `mergeSimultaneousShifts`. The
   *  planned-shift total reads the legs, so it still counts both. */
  const events = computed(() =>
    cardPlan.value ? mergeSimultaneousShifts(planEvents(cardPlan.value.plan, now.value), zone.value) : []
  );
  const shownEvents = computed(() => tableEvents(events.value));
  const ascNow = computed(() => (cardPlan.value ? ascensionAt(cardPlan.value.plan, now.value) : 0));
  const track = computed(() =>
    cardPlan.value ? onTrack(cardPlan.value.plan, { seconds: saveSeconds.value, teByEgg: teByEgg.value }) : null
  );

  // -------------------------------------------------------------------------------------- the gear

  /** The save's three sets, worked out once per save (store `readInventory`: pure, a few ms). */
  const inventory = shallowRef<{ equipped: EquippedArtifact[] | null; earnings: EquippedArtifact[] | null; production: EquippedArtifact[] | null } | null>(null);
  watch(
    [raw, storeHasSave, storeReady],
    ([r, here]) => {
      if (!r || !here) {
        inventory.value = null;
        return;
      }
      try {
        const inv = store.readInventory();
        inventory.value = { equipped: inv.equippedNow, earnings: inv.earnings, production: inv.elr };
      } catch {
        inventory.value = null;
      }
    },
    { immediate: true }
  );
  function clothedOf(set: EquippedArtifact[] | null): number | null {
    if (!set || !hasSave.value) return null;
    try {
      const ctx = getSimulationContext();
      return calculateClothedTEForSet(set, {
        truthEggs: teByEgg.value.reduce((a, b) => a + b, 0),
        colleggtibleModifiers: ctx.colleggtibleModifiers,
        labUpgradeLevel: ctx.epicResearchLevels['cheaper_research'] ?? 0,
        permitLevel: (raw.value as { game?: { permitLevel?: number | null } }).game?.permitLevel ?? null,
      });
    } catch {
      return null;
    }
  }
  const gear = computed(() => {
    const inv = inventory.value;
    if (!inv) return null;
    return {
      ...inv,
      clothedEquipped: clothedOf(inv.equipped),
      clothedEarnings: clothedOf(inv.earnings),
      whatIf: cardPlan.value?.state === 'this-save' ? cardPlan.value.plan.whatIf : null,
    };
  });

  // -------------------------------------------------------------------------------- eggs and facts

  const facts = computed(() =>
    hasSave.value
      ? farmFacts({
          farm: onVirtue.value ? farm.value : null,
          epic: initial.epicResearchLevels,
          colleggtibles: initial.colleggtibleModifiers,
          equipped: inventory.value?.equipped ?? initial.artifactLoadout,
        })
      : null
  );
  const eggs = computed(() => {
    if (!hasSave.value) return [];
    const { delivered, earned } = saveEggCountsOf(raw.value);
    return eggLines(delivered, earned, currentEgg.value, facts.value?.elr ?? null);
  });
  const shiftsDone = computed(() => (raw.value as { virtue?: { shiftCount?: number | null } } | null)?.virtue?.shiftCount ?? 0);
  const soulEggs = computed(() => (raw.value as { game?: { soulEggsD?: number | null } } | null)?.game?.soulEggsD ?? 0);
  const nextShiftCost = computed(() => (raw.value ? nextShiftCostAt(soulEggs.value, shiftsDone.value) : null));
  /** The plan's shifts after the save and their cost at today's soul eggs; null: can't tell (no timeline). */
  const plannedShifts = computed(() => {
    const p = cardPlan.value?.plan;
    const n = p ? shiftsAfter(p, saveSeconds.value) : null;
    if (n == null) return null;
    return { count: n, cost: plannedShiftsCost(soulEggs.value, shiftsDone.value, n) };
  });

  // -------------------------------------------------------------------------------------- the tiles

  const history = ref<CheckEntry[]>([]);
  watch(
    raw,
    async r => {
      history.value = [];
      if (!r) return;
      // The save's own account, never the store's cached partition (it can still be the last account's after a
      // switch).
      const id = (r as { eiUserId?: string }).eiUserId ?? '';
      const partition = id ? await hashID(id).catch(() => '') : '';
      if (raw.value !== r) return;
      history.value = partition ? await loadHistory(partition).catch(() => []) : [];
    },
    { immediate: true }
  );
  const savedDate = computed<SavedDateAnswer[]>(() =>
    store.savedAnswers.map(a => ({
      savedAt: a.savedAt,
      deadline: a.result.deadline,
      te: a.result.te,
      saveSeconds: a.save?.backupAt || null,
      level: a.result.level,
      simple: a.result.simple,
      setup: a.result.settings
        ? { availability: a.result.settings.availability ?? null, timeOff: a.result.settings.timeOff ?? [] }
        : null,
      route: a.result.routes[0]
        ? { chain: [...a.result.routes[0].chain], reachAt: a.result.routes[0].reachAt, spare: a.result.routes[0].spare, legs: a.result.routes[0].legs }
        : null,
    }))
  );
  function tileFor(g: Goal): Tile {
    const gi = keys.value.findIndex(x => x.g.goal === g.goal && x.g.target === g.target && x.g.deadline === g.deadline);
    const k = keys.value[gi]?.key ?? null;
    const setup = { availability: store.availability, timeOff: store.timeOff };
    const nowMs = now.value * 1000;
    // Every kept snapshot of this goal under another key, with the setup it recorded (Right now ranks the same).
    const others = snapCandidates.value
      .filter(c => !c.ownKey && c.goalIndex === gi && c.plan.goal === g.goal)
      .map(c => ({ plan: c.plan, recorded: c.check.recorded }));
    return buildTile({
      goal: g.goal,
      target: g.target,
      deadline: g.deadline,
      nowMs,
      save: hasSave.value ? { seconds: saveSeconds.value, te: saveTEOf(raw.value) } : null,
      snapshot: planOf(g, snapOf(instantSnapKey(k))),
      lastChecked: lastCheckedOf(k && k.startsWith(ANSWER_PREFIX) ? k : null),
      history: history.value,
      board: o.myRows.value,
      saved: savedDate.value,
      setupNow: setupNow.value,
      otherSnapshots: others,
      hoursChanged: row => {
        const d = hoursDiffer(row, setup, nowMs, zone.value);
        return d.hours || d.timeOff;
      },
      olderSimulator: row => simulatorAge(row) === 'older',
    });
  }
  const fastestTile = computed<{ tile: Tile; target: number }>(() => {
    const first = tileFor({ goal: 'fastest', target: RACE_TARGET, deadline: null });
    if (first.answer || store.finalTE === RACE_TARGET) return { tile: first, target: RACE_TARGET };
    const own = tileFor({ goal: 'fastest', target: store.finalTE, deadline: null });
    return own.answer ? { tile: own, target: store.finalTE } : { tile: first, target: RACE_TARGET };
  });
  const eggDayTile = computed(() => tileFor({ goal: 'date', target: store.finalTE, deadline: eggDayAt }));

  const raceStand = computed<Standing | null>(() => {
    const a = fastestTile.value.tile.answer;
    return raceStanding(o.boardRows.value, o.myRows.value, fastestTile.value.target, now.value * 1000, a ? a.end * 1000 : null);
  });
  const eggDayStand = computed<Standing | null>(() => {
    const a = eggDayTile.value.answer;
    return dateStanding(
      o.boardRows.value,
      o.myRows.value,
      eggDayAt,
      now.value * 1000,
      a ? { te: a.endTE, spareSeconds: (a.spareHours ?? 0) * 3600 } : null
    );
  });

  return {
    now,
    zone,
    hasSave,
    saveWaiting,
    saveSeconds,
    onVirtue,
    currentEgg,
    teSoFar,
    strip,
    eggDayAt,
    eggDayYear,
    cardPlan,
    events,
    shownEvents,
    ascNow,
    track,
    gear,
    facts,
    eggs,
    shiftsDone,
    soulEggs,
    nextShiftCost,
    plannedShifts,
    fastestTile,
    eggDayTile,
    raceStand,
    eggDayStand,
  };
}
