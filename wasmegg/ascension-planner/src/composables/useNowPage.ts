/**
 * Everything My runs' "Right now" page shows, read from what is already here (spec myruns-now v3; build plan
 * aaap-tools/specialists/ui-nowpage-build.md). NOTHING is worked out again: no instant answer, no Check exactly,
 * no search, no worker. The reads:
 *
 *   the loaded save            initialState (raw backup, farm, TE, eggs), its time
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
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { calculateClothedTEForSet } from '@/lib/artifacts/virtue';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { BoardRow } from '@/lib/leaderboardRank';
import { hoursDiffer, simulatorAge } from '@/lib/myRunsDashboard';
import { useMinuteClock } from './useMinuteClock';
import { saveStrip } from '@/lib/saveFreshness';
import { virtueEggOf } from '@/lib/virtueEggs';
import {
  SAVE_EGG_ORDER,
  ascensionAt,
  onTrack,
  planEvents,
  planFromSnapshot,
  shiftsAfter,
  tableEvents,
  type NowPlan,
  type SnapLike,
} from '@/lib/nowPlan';
import { buildTile, type SavedDateAnswer, type Tile } from '@/lib/savedTiles';
import { eggLines, farmFacts } from '@/lib/farmFacts';
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

  const raw = computed(() => (initial.hasData ? initial.rawBackup : null));
  const hasSave = computed(() => !!raw.value);
  const saveSeconds = computed(() => (raw.value ? initial.lastBackupTime || 0 : 0));
  const onVirtue = computed(() => saveOnVirtue(raw.value));
  const account = computed(() => accountOf(raw.value));
  const currentEgg = computed(() => (onVirtue.value ? virtueEggOf(initial.currentFarmState?.eggType) : null));
  const teByEgg = computed(() =>
    SAVE_EGG_ORDER.map(e =>
      Math.max(initial.initialTeEarned?.[e] ?? 0, countTEThresholdsPassed(initial.initialEggsDelivered?.[e] ?? 0))
    )
  );
  const teSoFar = computed(() => (raw.value ? store.backupTE : 0));
  const strip = computed(() => saveStrip(saveSeconds.value, now.value, zone.value));

  // ------------------------------------------------------------------------------------- the keys

  const eggDayYear = nextEggDayYear();
  const eggDayAt = eggDaySeconds(eggDayYear);

  const keyFor = (deadline: number | null, finalTE: number) => (raw.value ? instantKeyFromStores(deadline, finalTE) : null);

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

  const cardPlan = computed<CardPlan | null>(() => {
    if (!raw.value) return null;
    // 1. This save and setup, by goal.
    for (const { g, key } of keys.value) {
      const p = planOf(g, snapOf(instantSnapKey(key)));
      if (p) return { plan: p, goal: g, state: 'this-save' };
    }
    const acct = account.value;
    if (!acct) return null;
    const entries = [...index.value].reverse(); // newest first
    const goalWords = (g: Goal) => instantGoal(g.deadline, g.deadline ? store.finalTE : g.target);
    // 2. This save, another setup (the setup changed since).
    for (const { g } of keys.value)
      for (const e of entries) {
        const m = e.meta;
        if (!m || m.account !== acct || m.goal !== goalWords(g) || Math.abs(m.backupTime - saveSeconds.value) > 60) continue;
        const p = planOf(g, snapOf(e.key));
        if (p) return { plan: p, goal: g, state: 'setup-changed' };
      }
    // 3. An earlier save's plan, the newest.
    for (const { g } of keys.value)
      for (const e of entries) {
        const m = e.meta;
        if (!m || m.account !== acct || m.goal !== goalWords(g) || m.backupTime >= saveSeconds.value - 60) continue;
        const p = planOf(g, snapOf(e.key));
        if (p) return { plan: p, goal: g, state: 'older-save' };
      }
    return null;
  });

  const events = computed(() => (cardPlan.value ? planEvents(cardPlan.value.plan, now.value) : []));
  const shownEvents = computed(() => tableEvents(events.value));
  const ascNow = computed(() => (cardPlan.value ? ascensionAt(cardPlan.value.plan, now.value) : 0));
  const track = computed(() =>
    cardPlan.value ? onTrack(cardPlan.value.plan, { seconds: saveSeconds.value, teByEgg: teByEgg.value }) : null
  );

  // -------------------------------------------------------------------------------------- the gear

  /** The save's three sets, worked out once per save (store `readInventory`: pure, a few ms). */
  const inventory = shallowRef<{ equipped: EquippedArtifact[] | null; earnings: EquippedArtifact[] | null; production: EquippedArtifact[] | null } | null>(null);
  watch(
    raw,
    r => {
      if (!r) {
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
    if (!set || !raw.value) return null;
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
    raw.value
      ? farmFacts({
          farm: onVirtue.value ? initial.currentFarmState : null,
          epic: initial.epicResearchLevels,
          colleggtibles: initial.colleggtibleModifiers,
          equipped: inventory.value?.equipped ?? initial.artifactLoadout,
        })
      : null
  );
  const eggs = computed(() =>
    raw.value
      ? eggLines(initial.initialEggsDelivered ?? {}, initial.initialTeEarned ?? {}, currentEgg.value, facts.value?.elr ?? null)
      : []
  );
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
      const partition = await store.accountPartition().catch(() => '');
      if (raw.value !== r) return;
      history.value = partition ? await loadHistory(partition) : [];
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
      route: a.result.routes[0]
        ? { chain: [...a.result.routes[0].chain], reachAt: a.result.routes[0].reachAt, spare: a.result.routes[0].spare, legs: a.result.routes[0].legs }
        : null,
    }))
  );
  function tileFor(g: Goal): Tile {
    const k = keys.value.find(x => x.g.goal === g.goal && x.g.target === g.target && x.g.deadline === g.deadline)?.key ?? null;
    const setup = { availability: store.availability, timeOff: store.timeOff };
    const nowMs = now.value * 1000;
    return buildTile({
      goal: g.goal,
      target: g.target,
      deadline: g.deadline,
      nowMs,
      save: raw.value ? { seconds: saveSeconds.value, te: store.backupTE } : null,
      snapshot: planOf(g, snapOf(instantSnapKey(k))),
      lastChecked: lastCheckedOf(k && k.startsWith(ANSWER_PREFIX) ? k : null),
      history: history.value,
      board: o.myRows.value,
      saved: savedDate.value,
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
