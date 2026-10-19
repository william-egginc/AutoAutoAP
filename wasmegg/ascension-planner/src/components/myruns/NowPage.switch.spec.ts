/**
 * My runs after SWITCHING accounts (fix 21). On beta, Kelli -> main: the card said "Integrity · 159 TE so far" and
 * both tiles "How sure: Low · Your TE has moved since" over a save at 191 (35+38+39+39+40, as Your eggs said). The
 * switch (`submitPlayerId`) loads the save 'default'-style: `initialTeEarned` is the CLAIMED TE (pending Truth Eggs
 * not rolled up) and the farm is caught up to now; the page read those store fields. Now every TE, egg and time on
 * the page is the save's own (`rawBackup` wins), and the stores are only trusted for the instant answer's key once
 * they are set up from this save.
 *
 * Two synthetic saves, ids EI0000000000000000 (A, Curiosity, nothing pending) and EI1234567890123456 (B, Integrity,
 * 159 claimed of 190: 31 pending). No id is ever printed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useInitialStateStore } from '@/stores/initialState';
import { useChainSearchStore } from '@/stores/chainSearch';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { saveTEOf } from '@/lib/saveFreshness';
import { accountOf } from '@/search/runSaves';
import { writeSnapshot } from '@/search/instantSnapshot';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { LegSummary } from '@/search/types';

const H = 3600;
const A_ID = 'EI0000000000000000';
const B_ID = 'EI1234567890123456';

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** A save `hoursAgo` old: A's as the fixture has it; B on Integrity with 31 Truth Eggs pending. */
function save(id: string, hoursAgo: number) {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - hoursAgo * H;
  b.eiUserId = id;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  if (id === B_ID) {
    b.farms[0].eggType = 51;
    b.virtue.eovEarned = [32, 32, 32, 32, 31]; // claimed 159; each egg is past its 38th threshold: 190
  }
  resolveColleggtibleContracts(b);
  return markRaw(b);
}
const secondsOf = (b: ReturnType<typeof save>) => b.settings.lastBackupTime as number;

/** The Egg Day run of a save on the board: Exhaustive, from that save, started at its own TE. */
function eggDayRow(b: ReturnType<typeof save>, te: number): BoardRow {
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  return {
    id: `row${te}aaaaa`,
    chain: [200, 230],
    finalTE: 230,
    durationDays: 10,
    deadline: eggDayAt,
    deadlineAscendAt: eggDayAt - 20 * H,
    startUtc: new Date((secondsOf(b) + H) * 1000).toISOString(),
    backupAgeHours: 1,
    backupTE: te,
    receivedAt: new Date().toISOString(),
    level: 'exhaustive',
    yours: true,
  };
}

/** A Fastest plan worked out from B's save of a day before (each egg at 32/31 then), Curiosity climbing to 70. */
function olderPlanFor(b: ReturnType<typeof save>): void {
  const S = secondsOf(b) - 24 * H;
  const leg = {
    key: 'continue',
    endTE: 230,
    durationSeconds: 48 * H,
    maxELR: 0,
    startTime: S,
    endTime: S + 48 * H,
    tier13Unlocked: false,
    shifts: [{ at: S + 24 * H, egg: 'integrity', fromEgg: 'curiosity', te: 70 }],
    endEgg: { egg: 'integrity', te: 40 },
  } as unknown as LegSummary;
  writeSnapshot('aap-instant-answer:olderplan|0', {
    at: Date.now() - 60_000,
    header: {},
    result: { best: null, byAscensions: [null, { chain: [230], end: S + 48 * H, legs: [] }] },
    exact: { '230': { end: S + 48 * H, endTE: 230, legs: [leg] } },
    answerStart: S,
    meta: { account: accountOf(b), goal: 'target 490', backupTime: S, teByEgg: [32, 32, 32, 32, 31] },
  } as never);
}

describe('My runs after switching accounts: every value follows the new save', () => {
  it('A loaded, then B: the card’s TE and egg, Your eggs, the strip and the tiles are B’s own', async () => {
    const a = save(A_ID, 5);
    const b = save(B_ID, 1);
    loadAndSyncBackup(A_ID, a, 'plan_next');
    rollUpPendingTE();
    const myRows = ref<BoardRow[] | null>([eggDayRow(a, 190)]);
    const { useNowPage } = await import('@/composables/useNowPage');
    const scope = effectScope();
    const page = scope.run(() => useNowPage({ myRows, boardRows: ref<BoardRow[] | null>([]) }))!;
    expect(page.hasSave.value).toBe(true);
    expect(page.currentEgg.value).toBe('curiosity');
    expect(page.saveSeconds.value).toBe(secondsOf(a));

    // 1. B's save fetched, the stores still A's (the moment before loadFromBackup): nothing of A's shows as B's.
    useInitialStateStore().rawBackup = b;
    expect(page.saveSeconds.value).toBe(secondsOf(b));
    expect(page.strip.value?.text).toMatch(/\(1 hour ago\)\.$/);
    expect(page.hasSave.value).toBe(false);
    expect(page.teSoFar.value).toBe(0);
    expect(page.currentEgg.value).toBeNull();

    // 2. The switch's own load ('default': the claimed TE in the stores, nothing rolled up).
    loadAndSyncBackup(B_ID, b, 'default');
    myRows.value = [eggDayRow(b, 190)];
    expect(useChainSearchStore().backupTE).toBe(159); // the stores' TE: what the card used to say
    expect(saveTEOf(b)).toBe(190);
    expect(page.hasSave.value).toBe(true);
    expect(page.teSoFar.value).toBe(190);
    expect(page.currentEgg.value).toBe('integrity');
    expect(page.eggs.value.map(e => e.te)).toEqual([38, 38, 38, 38, 38]);
    expect(page.eggs.value.find(e => e.current)?.egg).toBe('integrity');
    const tile = page.eggDayTile.value;
    expect(tile.answer?.fromTE).toBe(190);
    expect(tile.sure?.reason).not.toBe('your TE has moved since');
    expect(tile.sure?.level).toBe('high');
    scope.stop();
  });

  it('the stores say 159 (and another egg, other eggs delivered): the card, How sure and the on-track chip read the save', async () => {
    const b = save(B_ID, 1);
    olderPlanFor(b);
    loadAndSyncBackup(B_ID, b, 'plan_next');
    rollUpPendingTE();
    // A draft's leftovers over the save's fields (the TE of whenever a Manual plan was made, its farm).
    const initial = useInitialStateStore();
    initial.initialTeEarned = { curiosity: 32, integrity: 32, humility: 32, resilience: 32, kindness: 31 };
    initial.initialEggsDelivered = { curiosity: 1, integrity: 1, humility: 1, resilience: 1, kindness: 1 };
    initial.currentFarmState = { ...initial.currentFarmState!, eggType: 53, population: 1 };
    const { useNowPage } = await import('@/composables/useNowPage');
    const scope = effectScope();
    const page = scope.run(() =>
      useNowPage({ myRows: ref<BoardRow[] | null>([eggDayRow(b, 190)]), boardRows: ref<BoardRow[] | null>([]) })
    )!;
    expect(page.teSoFar.value).toBe(190);
    expect(page.currentEgg.value).toBe('integrity');
    expect(page.eggs.value.map(e => e.te)).toEqual([38, 38, 38, 38, 38]);
    expect(page.facts.value?.habFull).toBeGreaterThan(0.5); // the save's population, not the draft's 1 chicken
    expect(page.eggDayTile.value.sure?.reason).not.toBe('your TE has moved since');
    // The plan from the day-older save: compared at 190, it can tell (at 159 it was "outside" the plan's line).
    expect(page.cardPlan.value?.state).toBe('older-save');
    expect(page.track.value?.kind).toBe('behind');
    scope.stop();
  });

  it('renders B’s TE and egg after the switch, never the stores’ 159', async () => {
    const b = save(B_ID, 1);
    loadAndSyncBackup(B_ID, b, 'default');
    const { default: MyRunsView } = await import('../MyRunsView.vue');
    const html = await renderHtml(MyRunsView, { playerId: B_ID }, {}, [getActivePinia()!]);
    expect(html).not.toMatch(/EI\d{16}/);
    const t = textOf(html);
    expect(t).toContain('190 TE so far');
    expect(t).not.toContain('159 TE so far');
    expect(t).toContain('Integrity');
    expect(html).toContain('/64/egginc/egg_integrity.png');
  });
});

describe('the switch, in the source', () => {
  it('App sets the stores up from the save in hand on My runs when the switch left the TE claimed-only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    // The save prep lives in composables/useAutoSave.ts (shared with the Joo site's AppJoo.vue).
    const app = fs.readFileSync(path.resolve(__dirname, '../../composables/useAutoSave.ts'), 'utf8');
    expect(app).toContain('chainSearchStore.currentTE === saveTEOf(initialStateStore.rawBackup)');
    expect(app).toContain('void (inHand ? setUpFromSaveInHand() : prepareAutoPlanner());');
    expect(app).toContain('await initPlanFuture(playerId.value, raw);');
    expect(app).toContain("watch(playerId, () => (myRunsLoadFor = ''));");
  });

  it('My runs reads no TE, egg or farm field of the initial-state store', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../composables/useNowPage.ts'), 'utf8');
    for (const field of ['initialTeEarned', 'initialEggsDelivered', 'currentFarmState', 'backupTE', 'initial.lastBackupTime >'])
      expect(src.replace(/^\s*(\*|\/\/).*$/gm, '')).not.toContain(field);
    expect(src).toContain('te: saveTEOf(raw.value)');
  });
});
