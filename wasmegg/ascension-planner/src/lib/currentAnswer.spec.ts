/**
 * Fix 22: one rule for "the" answer of the loaded save, shared by My runs' Right now card and its tiles. The beta
 * case: two Check exactly runs of one save, 11:51 pm with any hour (7 ascensions, Sep 17 2028) and 11:59 pm with
 * 7 am to 1 am (6 ascensions, Sep 22 2028), the hours changed in between. Pure.
 */
import { describe, expect, it } from 'vitest';
import {
  compareAnswers,
  currentSetup,
  otherSetupLabel,
  pickAnswer,
  pickCardPlan,
  pricedWithWords,
  rowSetup,
  setupCheck,
  todayIn,
  type CardCandidate,
  type PricedSetup,
  type Rankable,
} from './currentAnswer';
import { buildTile, secondaryLabel, type TileInput } from './savedTiles';
import type { NowPlan } from './nowPlan';
import type { CheckEntry } from '@/search/checkHistory';

const ZONE = 'America/Denver';
const SAVE = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Oct 15, 2:40 pm Denver
const NOW_MS = Date.UTC(2026, 9, 16, 15, 0);
const TODAY = todayIn(NOW_MS, ZONE);
const AT_1151 = Date.UTC(2026, 9, 16, 5, 51); // Oct 15, 11:51 pm Denver
const AT_1159 = Date.UTC(2026, 9, 16, 5, 59);
const SEP17 = Date.UTC(2028, 8, 17, 18) / 1000;
const SEP22 = Date.UTC(2028, 8, 22, 18) / 1000;

const ANY: PricedSetup = { availability: null, timeOff: [] };
const MINE: PricedSetup = { availability: { days: [], fromHour: 7, toHour: 1, timezone: ZONE }, timeOff: [] };
const NINE: PricedSetup = { availability: { days: [], fromHour: 9, toHour: 1, timezone: ZONE }, timeOff: [] };

const snap = (at: number, chain: number[], end: number): NowPlan => ({
  goal: 'fastest',
  deadline: null,
  chain,
  end,
  endTE: 490,
  legs: null,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: at,
  planStart: SAVE,
  spareHours: null,
  runnerUpHours: 30,
  meta: { account: 'acct', goal: 'target 490', backupTime: SAVE },
  whatIf: null,
});
/** 11:51 pm, any hour: 7 ascensions, sooner. */
const A = snap(AT_1151, [160, 180, 197, 230, 280, 350, 490], SEP17);
/** 11:59 pm, 7 am to 1 am: 6 ascensions, later. */
const B = snap(AT_1159, [175, 197, 240, 300, 380, 490], SEP22);

const entry = (p: NowPlan, setup: PricedSetup | undefined): CheckEntry => ({
  at: p.calculatedAt,
  backupTime: SAVE,
  te: 191,
  mode: 'fastest',
  target: 490,
  instant: { chain: p.chain, end: p.end, endTE: 490 },
  exact: { chain: p.chain, end: p.end, endTE: 490 },
  shared: false,
  sig: String(p.calculatedAt),
  ...(setup ? { setup } : {}),
});

/** The tile's input: `own` is the snapshot under this save's key (priced with the setup now). */
function tileInput(now: PricedSetup, own: NowPlan, other: NowPlan, otherRecorded: PricedSetup | null): TileInput {
  return {
    goal: 'fastest',
    target: 490,
    deadline: null,
    nowMs: NOW_MS,
    save: { seconds: SAVE, te: 191 },
    snapshot: own,
    otherSnapshots: [{ plan: other, recorded: otherRecorded }],
    lastChecked: null,
    history: [entry(own, now), entry(other, otherRecorded ?? undefined)],
    board: [],
    saved: [],
    setupNow: { setup: now, today: TODAY },
  };
}
function cardPick(now: PricedSetup, own: NowPlan, other: NowPlan, otherRecorded: PricedSetup | null) {
  const list: CardCandidate[] = [
    { plan: own, goalIndex: 0, ownKey: true, check: currentSetup(now) },
    { plan: other, goalIndex: 0, ownKey: false, check: setupCheck(otherRecorded, now, TODAY) },
  ];
  return pickCardPlan(list, SAVE)!;
}

describe('the priced-with check', () => {
  it('hours, time off, not recorded', () => {
    expect(setupCheck(ANY, MINE, TODAY)).toMatchObject({ fit: 'other', hours: true, timeOff: false });
    expect(setupCheck(MINE, MINE, TODAY).fit).toBe('current');
    expect(setupCheck(null, MINE, TODAY).fit).toBe('unknown');
    const off = { ...MINE, timeOff: [{ from: '2026-10-20', to: '2026-10-22' }] };
    expect(setupCheck(off, MINE, TODAY)).toMatchObject({ fit: 'other', hours: false, timeOff: true });
    // Time off already over doesn't count.
    expect(setupCheck({ ...MINE, timeOff: [{ from: '2026-10-01', to: '2026-10-02' }] }, MINE, TODAY).fit).toBe('current');
  });

  it('labels: the hours it WAS priced with, or "with other hours" when not recorded', () => {
    expect(otherSetupLabel(setupCheck(ANY, MINE, TODAY))).toBe('with any hour (before your hours changed)');
    expect(otherSetupLabel(setupCheck(NINE, MINE, TODAY))).toBe('with 9 am–1 am (before your hours changed)');
    expect(otherSetupLabel(setupCheck(null, MINE, TODAY))).toBe('with other hours');
    expect(otherSetupLabel(setupCheck(MINE, { ...MINE, timeOff: [{ from: '2026-10-20', to: '2026-10-22' }] }, TODAY))).toBe(
      'with no time off (before your time off changed)'
    );
    expect(otherSetupLabel(currentSetup(MINE))).toBe('');
    expect(pricedWithWords(currentSetup(MINE))).toBe('priced with your hours 7 am to 1 am, no time off');
    expect(pricedWithWords(setupCheck(null, MINE, TODAY))).toBe('priced with other hours');
  });

  it("a board row's window read back (none recorded: unknown)", () => {
    expect(rowSetup({})).toBeNull();
    expect(rowSetup({ window: null })).toEqual({ availability: null, timeOff: [] });
    const r = rowSetup({ window: `every day 07:00-01:00 ${ZONE}` });
    expect(setupCheck(r, MINE, TODAY).fit).toBe('current');
    expect(setupCheck(r, ANY, TODAY).fit).toBe('other');
  });
});

describe('the ranking', () => {
  const base: Rankable = { currentSave: true, fit: 'current', how: 'check', end: SEP22, endTE: 490, spareHours: null, calculatedAt: AT_1159 };
  it('current save, then the current setup even when the other finishes sooner, then the goal', () => {
    const sooner = { ...base, fit: 'other' as const, end: SEP17 };
    expect([sooner, base].sort(compareAnswers('fastest'))[0]).toBe(base);
    const older = { ...base, currentSave: false, end: SEP17 - 86400 * 30 };
    expect([older, base].sort(compareAnswers('fastest'))[0]).toBe(base);
    // The same setup: the sooner finish wins.
    const soonerSame = { ...base, end: SEP17 };
    expect([base, soonerSame].sort(compareAnswers('fastest'))[0]).toBe(soonerSame);
    // A tie: the plan Right now can show leads.
    const plan = { ...base, plan: true, calculatedAt: AT_1159 - 1 };
    expect([base, plan].sort(compareAnswers('fastest'))[0]).toBe(plan);
  });
  it('the secondary: a better answer priced with other hours, only when it beats the lead', () => {
    const sooner = { ...base, fit: 'unknown' as const, end: SEP17 };
    expect(pickAnswer([base, sooner], 'fastest')).toEqual({ lead: base, secondary: sooner });
    const later = { ...base, fit: 'other' as const, end: SEP22 + 86400 };
    expect(pickAnswer([base, later], 'fastest')).toEqual({ lead: base, secondary: null });
  });
});

describe('Right now and the Fastest tile name the same plan (beta, 16 Oct)', () => {
  it('setup now 7 am to 1 am: both lead with 11:59 pm; 11:51 pm is secondary "with any hour (before your hours changed)"', () => {
    const card = cardPick(MINE, B, A, ANY);
    expect(card.candidate.plan).toBe(B);
    expect(card.state).toBe('this-save');
    expect(card.secondary?.plan).toBe(A);
    expect(otherSetupLabel(card.secondary!.check)).toBe('with any hour (before your hours changed)');
    const tile = buildTile(tileInput(MINE, B, A, ANY));
    expect(tile.answer?.chain).toEqual(B.chain);
    expect(tile.answer?.calculatedAt).toBe(B.calculatedAt);
    // The lead is the very snapshot Right now shows, not the history entry of the same check.
    expect(tile.answer?.source).toBe('snapshot');
    expect(tile.secondary?.chain).toEqual(A.chain);
    expect(secondaryLabel(tile.secondary!)).toBe('with any hour (before your hours changed)');
    // Priced with the current setup: How sure doesn't call it "before your hours changed".
    expect(tile.sure?.reason).not.toContain('hours changed');
  });

  it('setup now any hour: 11:51 pm leads both, no secondary (the other finishes later)', () => {
    const card = cardPick(ANY, A, B, MINE);
    expect(card.candidate.plan).toBe(A);
    expect(card.secondary).toBeNull();
    const tile = buildTile(tileInput(ANY, A, B, MINE));
    expect(tile.answer?.chain).toEqual(A.chain);
    expect(tile.secondary ?? null).toBeNull();
  });

  it('hours not recorded on the other answer: secondary "with other hours"', () => {
    const card = cardPick(MINE, B, A, null);
    expect(card.candidate.plan).toBe(B);
    expect(otherSetupLabel(card.secondary!.check)).toBe('with other hours');
    const tile = buildTile(tileInput(MINE, B, A, null));
    expect(tile.answer?.chain).toEqual(B.chain);
    expect(secondaryLabel(tile.secondary!)).toBe('with other hours');
  });

  it('only the other-hours plan kept: Right now shows it as "setup changed", and the tile leads with it too', () => {
    const list: CardCandidate[] = [{ plan: A, goalIndex: 0, ownKey: false, check: setupCheck(ANY, MINE, TODAY) }];
    const card = pickCardPlan(list, SAVE)!;
    expect(card.candidate.plan).toBe(A);
    expect(card.state).toBe('setup-changed');
    const tile = buildTile({ ...tileInput(MINE, B, A, ANY), snapshot: null, history: [entry(A, ANY)] });
    expect(tile.answer?.chain).toEqual(A.chain);
    expect(tile.sure?.reason).toBe('priced before your hours changed');
  });

  it('across goals the setup still comes first: a current-setup Egg Day plan leads an other-hours Fastest one', () => {
    const date: NowPlan = { ...B, goal: 'date', deadline: SEP22, spareHours: 10 };
    const list: CardCandidate[] = [
      { plan: A, goalIndex: 0, ownKey: false, check: setupCheck(ANY, MINE, TODAY) },
      { plan: date, goalIndex: 2, ownKey: true, check: currentSetup(MINE) },
    ];
    expect(pickCardPlan(list, SAVE)!.candidate.plan).toBe(date);
  });

  it('across goals in the same tier: the goal checked LAST leads, no longer the fixed Fastest > own target > Egg Day', () => {
    const date: NowPlan = { ...B, goal: 'date', deadline: SEP22, spareHours: 10, calculatedAt: AT_1159 + 60_000 };
    const list: CardCandidate[] = [
      { plan: B, goalIndex: 0, ownKey: true, check: currentSetup(MINE) },
      { plan: date, goalIndex: 2, ownKey: true, check: currentSetup(MINE) },
    ];
    expect(pickCardPlan(list, SAVE)!.candidate.plan).toBe(date);
    // Fastest checked after Egg Day: Fastest.
    const later = { ...B, calculatedAt: AT_1159 + 120_000 };
    expect(pickCardPlan([{ ...list[0], plan: later }, list[1]], SAVE)!.candidate.plan).toBe(later);
    // The same moment: the goal order breaks the tie.
    const same = { ...date, calculatedAt: B.calculatedAt };
    expect(pickCardPlan([list[0], { ...list[1], plan: same }], SAVE)!.candidate.plan).toBe(B);
  });
});

describe('the setup is recorded where answers are kept', () => {
  it('Check exactly history entries keep it; InstantRoute passes it, and its snapshot meta writes it', async () => {
    const { entryFromRecord } = await import('@/search/checkHistory');
    const rec = { mode: 'fastest', target: 490, currentTE: 191, instant: { chain: [490], end: 1 }, exact: null } as never;
    expect(entryFromRecord(rec, 's', 1, false, MINE).setup).toEqual(MINE);
    expect(entryFromRecord(rec, 's', 1).setup).toBeUndefined();
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
    expect(src).toContain('entryFromRecord(c.record, c.sig, Date.now(), false, exactSetup)');
    expect(src).toMatch(/setup: exactSetup \?\? \{/);
    // My runs builds both Right now and the tiles from the one selector.
    const page = fs.readFileSync(path.resolve(__dirname, '../composables/useNowPage.ts'), 'utf8');
    expect(page).toContain('plansByGoal(goalList.value, snapCandidates.value, goalAnswers.value, saveSeconds.value)');
    expect(page).toContain('otherSnapshots: others');
    expect(page).toContain('setupNow: setupNow.value');
  });
});
