import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PREFER_OFF } from '@/search/preferFewer';
import {
  BASELINE_KEY,
  MAX_BASELINES,
  baselineDiff,
  baselineLine,
  baselineOfSnapshot,
  compareLines,
  findBaseline,
  readBaselines,
  readRowBaseline,
  recordBaseline,
  rowBackupTime,
  rowBaselineOf,
  rowFoundLevel,
  rowGoalWords,
  rowRun,
  type BaselineEntry,
} from './instantBaseline';
import type { BoardRow } from './leaderboardRank';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const D = 86400;
const SAVE = Date.UTC(2026, 9, 19, 2, 0) / 1000;
const entry = (o: Partial<BaselineEntry> = {}): BaselineEntry => ({
  account: 'acct-hash',
  goal: 'target 490',
  backupTime: SAVE,
  at: SAVE * 1000 + 60_000,
  chain: [197, 246, 298, 352, 418, 490],
  end: Date.UTC(2028, 1, 9, 22, 0) / 1000,
  endTE: 490,
  ...o,
});

describe('the baseline log (this browser)', () => {
  it('logs one per account, goal and save (a newer one replaces), at most MAX_BASELINES', () => {
    const st = mem();
    expect(recordBaseline(entry(), st)).toBe(true);
    expect(recordBaseline(entry({ at: entry().at + 1, endTE: 491 }), st)).toBe(true);
    expect(readBaselines(st)).toHaveLength(1);
    expect(readBaselines(st)[0].endTE).toBe(491);
    for (let i = 0; i < MAX_BASELINES + 5; i++) recordBaseline(entry({ backupTime: SAVE + i * 3600, at: i }), st);
    expect(readBaselines(st)).toHaveLength(MAX_BASELINES);
    expect(st.getItem(BASELINE_KEY)).not.toMatch(/EI\d{16}/);
  });

  it('a run finds the baseline of its own account, goal and save (within 10 minutes)', () => {
    const list = [entry(), entry({ goal: 'date 1815753600', endTE: 313 }), entry({ account: 'other' })];
    expect(findBaseline(list, { account: 'acct-hash', goal: 'target 490', backupTime: SAVE + 300 })?.endTE).toBe(490);
    expect(findBaseline(list, { account: 'acct-hash', goal: 'target 490', backupTime: SAVE + 3600 })).toBeNull();
    expect(findBaseline(list, { account: 'acct-hash', goal: 'date 1815753600', backupTime: SAVE })?.endTE).toBe(313);
    expect(findBaseline(list, { account: null, goal: 'target 490', backupTime: SAVE })).toBeNull();
  });

  it("a snapshot's instant answer: Fastest its best, By a date its byDate; nothing without meta", () => {
    const meta = { account: 'acct-hash', goal: 'target 490', backupTime: SAVE };
    const best = { chain: [197, 490], end: SAVE + 400 * D, legs: [{ endTE: 197 }, { endTE: 490 }] };
    expect(baselineOfSnapshot({ at: 5, meta, result: { best } })).toMatchObject({ chain: [197, 490], end: SAVE + 400 * D, endTE: 490 });
    const dmeta = { ...meta, goal: 'date 1815753600' };
    const byDate = { chain: [197, 313], end: SAVE + 260 * D, legs: [{ to: 197 }, { endTE: 313.4 }] };
    expect(baselineOfSnapshot({ at: 5, meta: dmeta, result: { best, byDate } })?.endTE).toBe(313.4);
    expect(baselineOfSnapshot({ at: 5, result: { best } })).toBeNull();
    expect(rowBaselineOf(entry({ endTE: 313.4 }))).toEqual({ chain: entry().chain, end: entry().end, endTE: 313, at: entry().at });
  });

  it('carries the route the green box shows (Prefer fewer, 26 Oct 2026): within 12 h, same TE; Off the best', () => {
    const meta = { account: 'acct-hash', goal: 'target 490', backupTime: SAVE };
    const r = (chain: number[], end: number) => ({ chain, end, legs: chain.map(to => ({ endTE: to })) });
    const best = r([197, 300, 490], SAVE + 400 * D);
    const two = r([300, 490], SAVE + 400 * D + 10 * 3600);
    const s = { at: 5, meta, result: { best, byAscensions: [null, null, two, best] } };
    expect(baselineOfSnapshot(s, { kind: 'time', seconds: 12 * 3600 })?.chain).toEqual([300, 490]);
    expect(baselineOfSnapshot(s, PREFER_OFF)?.chain).toEqual([197, 300, 490]);
    // No storage in this test: the default margin (within 12 h).
    expect(baselineOfSnapshot(s)?.chain).toEqual([300, 490]);
    const deadline = SAVE + 300 * D;
    const dmeta = { ...meta, goal: `date ${deadline}` };
    const top = r([197, 250, 313], SAVE + 260 * D);
    const fewer = r([250, 313], SAVE + 280 * D);
    const late = r([313], deadline + 1);
    const d = { at: 5, meta: dmeta, result: { byDate: top, byDateByAscensions: [null, late, fewer, top] } };
    expect(baselineOfSnapshot(d, { kind: 'te', te: 0 })).toMatchObject({ chain: [250, 313], endTE: 313 });
    expect(baselineOfSnapshot(d, PREFER_OFF)?.chain).toEqual([197, 250, 313]);
  });

  it('what is SENT with a board row stays the best (fastest / highest TE), even with a 12 h margin in effect', () => {
    const meta = { account: 'acct-hash', goal: 'target 490', backupTime: SAVE };
    const r = (chain: number[], end: number) => ({ chain, end, legs: chain.map(to => ({ endTE: to })) });
    const best = r([197, 300, 490], SAVE + 400 * D);
    const two = r([300, 490], SAVE + 400 * D + 10 * 3600);
    const shown = baselineOfSnapshot({ at: 5, meta, result: { best, byAscensions: [null, null, two, best] } }, {
      kind: 'time',
      seconds: 12 * 3600,
    })!;
    // Shown: the box's pick. Sent: the fastest.
    expect(shown.chain).toEqual([300, 490]);
    expect(shown.sent).toEqual({ chain: [197, 300, 490], end: SAVE + 400 * D, endTE: 490 });
    expect(rowBaselineOf(shown)).toEqual({ chain: [197, 300, 490], end: SAVE + 400 * D, endTE: 490, at: 5 });
    // Logged and read back: the sent route survives the log; with the best in the box nothing extra is kept.
    const st = mem();
    expect(recordBaseline(shown, st)).toBe(true);
    const back = findBaseline(readBaselines(st), { account: 'acct-hash', goal: 'target 490', backupTime: SAVE })!;
    expect(back.chain).toEqual([300, 490]);
    expect(rowBaselineOf(back).chain).toEqual([197, 300, 490]);
    const off = baselineOfSnapshot({ at: 5, meta, result: { best, byAscensions: [null, null, two, best] } }, PREFER_OFF)!;
    expect(off.sent).toBeUndefined();
    expect(rowBaselineOf(off).chain).toEqual([197, 300, 490]);
    // By a date, same TE: sent is the highest-TE route.
    const deadline = SAVE + 300 * D;
    const top = r([197, 250, 313], SAVE + 260 * D);
    const fewer = r([250, 313], SAVE + 280 * D);
    const d = baselineOfSnapshot(
      { at: 5, meta: { ...meta, goal: `date ${deadline}` }, result: { byDate: top, byDateByAscensions: [null, null, fewer, top] } },
      { kind: 'te', te: 0 }
    )!;
    expect(d.chain).toEqual([250, 313]);
    expect(rowBaselineOf(d).chain).toEqual([197, 250, 313]);
  });
});

describe('the words (wireframe B1)', () => {
  const base = { end: Date.UTC(2028, 1, 9, 22, 0) / 1000, endTE: 490 };
  it('Fastest: sooner, later, the same', () => {
    expect(baselineDiff({ goal: 'fastest', end: base.end - 1.2 * D, endTE: 490 }, base)).toEqual({ words: '1.2 days sooner', tone: 'better' });
    expect(baselineDiff({ goal: 'fastest', end: base.end + 22 * 60, endTE: 490 }, base)).toEqual({ words: '22 min later', tone: 'worse' });
    expect(baselineDiff({ goal: 'fastest', end: base.end + 20, endTE: 490 }, base).words).toBe('same finish');
    expect(baselineLine({ goal: 'fastest', end: base.end - 1.5 * D, endTE: 490 }, base, 'Exact', 'their')).toEqual({
      lead: 'vs their instant answer:',
      words: '1.5 days sooner',
      tail: '(Exact)',
      tone: 'better',
    });
  });
  it('By a date: the TE first, then the spare', () => {
    const b = { end: 1000 * D, endTE: 313 };
    expect(baselineDiff({ goal: 'date', end: 1000 * D - 0.28 * D, endTE: 312 }, b).words).toBe('−1 TE (313 → 312), 0.28 days more spare');
    expect(baselineDiff({ goal: 'date', end: 1000 * D, endTE: 314 }, { ...b, endTE: 313 }).words).toBe('+1 TE (313 → 314)');
    expect(baselineDiff({ goal: 'date', end: 1000 * D - 40 * 60, endTE: 313 }, b)).toEqual({ words: 'same TE, 40 min more spare', tone: 'better' });
  });
});

describe('board rows', () => {
  const row = (o: Partial<BoardRow> = {}): BoardRow => ({
    chain: [197, 248, 301, 356, 421, 490],
    finalTE: 490,
    durationDays: 477.2,
    startUtc: '2026-10-20T04:00:00Z',
    endUtc: '2028-02-08T10:00:00Z',
    backupAgeHours: 26,
    level: 'normal',
    acct: 'a1',
    submittedAt: '2026-10-20T04:12:00Z',
    baseline: { chain: [197, 246, 298, 352, 418, 490], end: Date.UTC(2028, 1, 9, 22, 0) / 1000, endTE: 490, at: Date.UTC(2026, 9, 19, 2, 1) },
    ...o,
  });
  it("a row's level, goal, save time and run", () => {
    expect(rowFoundLevel({ level: 'quick' })).toBe('Fast');
    expect(rowFoundLevel({ level: 'thorough' })).toBe('Exact');
    expect(rowFoundLevel({ level: 'exhaustive' })).toBe('Custom');
    expect(rowFoundLevel({ effort: 'deadline', mode: 'advanced', deadline: 5 })).toBe('Custom');
    expect(rowFoundLevel({ level: 'light' })).toBeNull();
    expect(rowGoalWords({ finalTE: 490 })).toBe('target 490');
    expect(rowGoalWords({ finalTE: 313, deadline: 1815753600 })).toBe('date 1815753600');
    expect(rowBackupTime(row())).toBe(Date.parse('2026-10-20T04:00:00Z') / 1000 - 26 * 3600);
    expect(rowRun(row())).toEqual({ goal: 'fastest', end: Date.parse('2028-02-08T10:00:00Z') / 1000, endTE: 490 });
    expect(readRowBaseline({ chain: [], end: 1, endTE: 1 })).toBeNull();
  });

  it('B2: Instant answer, Fast, Exact (this run), Custom (not run); only rows of the same player, goal and baseline', () => {
    const exact = row();
    const fast = row({ level: 'quick', endUtc: '2028-02-08T17:10:00Z', submittedAt: '2026-10-19T05:00:00Z' });
    const slowerFast = row({ level: 'quick', endUtc: '2028-02-09T17:10:00Z' });
    const otherPlayer = row({ level: 'exhaustive', acct: 'b2', endUtc: '2028-02-01T00:00:00Z' });
    const otherBaseline = row({ level: 'exhaustive', baseline: { chain: [490], end: 1, endTE: 490 } });
    const lines = compareLines(exact, [exact, fast, slowerFast, otherPlayer, otherBaseline]);
    expect(lines.map(l => [l.label, l.thisRun, l.diff, l.end == null ? 'not run' : 'run'])).toEqual([
      ['Instant answer', false, '', 'run'],
      ['Fast', false, '1.2 days sooner', 'run'],
      ['Exact', true, '1.5 days sooner', 'run'],
      ['Custom', false, '', 'not run'],
    ]);
    // No baseline on the row: no list at all.
    expect(compareLines(row({ baseline: undefined }), [])).toEqual([]);
  });
});

describe('wiring', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  it('the send adds it only with the consent; InstantRoute logs each instant answer; the detail and lists show it', () => {
    const store = read('../stores/chainSearch.ts');
    expect(store).toContain("if (payload.baseline || !consentAgreed('shareBaseline')) return payload;");
    expect(store).toContain('if (!saved) payload = withBaseline(payload);');
    expect(read('../components/auto/InstantRoute.vue')).toContain('if (base) recordBaseline(base);');
    expect(read('../components/auto/LeaderboardRunDetail.vue')).toContain('compareLines(props.row, boardRows?.value ?? [])');
    expect(read('../components/auto/LeaderboardPanel.vue')).toContain('provide(\n  BOARD_ROWS,');
    for (const f of ['../components/auto/MyRunsList.vue', '../components/auto/SavedRuns.vue', '../components/auto/SavedAnswers.vue'])
      expect(read(f), f).toContain('<BaselineChip');
    expect(read('../components/MyRunsView.vue')).toContain("useConsent('shareBaseline')");
    // Setup › Sharing lists what each tick sends: the same box there.
    expect(read('../components/auto/YourSetup.vue')).toContain("useConsent('shareBaseline')");
  });
});
