/**
 * The Egg Day rule on My runs' summary (lib/eggDayRule.ts, Jordan 22 Oct 2026): the Egg Day and By a date cards
 * never head a run that lands after Egg Day starts (or after your date); with only such runs they say "No route
 * finishes before Egg Day starts. The nearest is N hours after.", the nearest marked. Next steps still ask for an
 * Egg Day run in time. The chart leaves late saved answers out, as it does late board runs.
 */
import { describe, expect, it } from 'vitest';
import { buildCards, buildSteps, type DashInput } from './myRunsDashboard';
import { buildScatter } from './routeScatter';
import { eggDaySeconds } from './eggDay';
import { SIM_VERSION } from '@/search/simVersion';
import type { BoardRow } from './leaderboardRank';

const H = 3600;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 19, 0);
const ZONE = 'America/Los_Angeles';
const EGG = eggDaySeconds(2027);
const NOV1 = Date.UTC(2026, 10, 1, 16) / 1000;

let n = 0;
function date(deadline: number, ascendAt: number, finalTE: number, over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: `d${++n}`,
    chain: [200, 240, finalTE],
    durationDays: 100,
    startUtc: '2026-10-14T16:00:00Z',
    timezone: ZONE,
    finalTE,
    currentTE: 180,
    backupTE: 180,
    effort: 'deadline',
    simVersion: SIM_VERSION,
    receivedAt: new Date(NOW - DAY).toISOString(),
    yours: true,
    deadline,
    deadlineAscendAt: ascendAt,
    ...over,
  } as BoardRow;
}
function input(rows: BoardRow[] | null, over: Partial<DashInput> = {}): DashInput {
  return {
    rows,
    now: NOW,
    eggDayAt: EGG,
    eggDayYear: 2027,
    zone: ZONE,
    teNow: 180,
    setup: { availability: null, timeOff: [], rememberedAt: null },
    local: { answers: [], runs: [], pending: [] },
    ...over,
  };
}
const card = (i: DashInput, id: string) => buildCards(i).find(c => c.id === id)!;

describe('the Egg Day card', () => {
  it('mixed: the run in time heads it, never the later one with more TE', () => {
    const c = card(input([date(EGG, EGG + 7 * H, 252), date(EGG, EGG - 30 * H, 250)]), 'eggday');
    expect(c.main).toBe('250 TE');
    expect(c.lines[0]).toBe('30.0 h spare');
  });

  it('exactly at the start counts', () => {
    expect(card(input([date(EGG, EGG, 251)]), 'eggday').main).toBe('251 TE');
  });

  it('only late runs: said plainly, the nearest shown and marked, Find it offered', () => {
    const c = card(input([date(EGG, EGG + 30 * H, 253), date(EGG, EGG + 7 * H, 252)]), 'eggday');
    expect(c.main).toBe('None in time');
    expect(c.lines).toEqual([
      'No route finishes before Egg Day starts. The nearest is 7 hours after.',
      '252 TE · 200 240 252 · after Egg Day starts',
    ]);
    expect(c.empty).toBe(true);
    expect(c.action?.label).toBe('Find it');
    expect(c.lines.join(' ')).not.toContain('misses the date');
  });

  it('a saved answer in time stands when the board only has late runs', () => {
    const c = card(
      input([date(EGG, EGG + 7 * H, 252)], {
        local: { answers: [{ savedAt: NOW, deadline: EGG, chain: [200, 248], spare: 5 * H }], runs: [], pending: [] },
      }),
      'eggday'
    );
    expect(c.main).toBe('248 TE');
    expect(c.lines).toContain('saved, not sent');
  });

  it('a late saved answer is never the card: it is only the nearest', () => {
    const c = card(input([], { local: { answers: [{ savedAt: NOW, deadline: EGG, chain: [200, 249], spare: -2 * H }], runs: [], pending: [] } }), 'eggday');
    expect(c.main).toBe('None in time');
    expect(c.lines[0]).toBe('No route finishes before Egg Day starts. The nearest is 2 hours after.');
  });
});

describe('the By a date card', () => {
  it('mixed: the run in time; only late: "No route finishes before your date"', () => {
    expect(card(input([date(NOV1, NOV1 + 3 * H, 230), date(NOV1, NOV1 - H, 226)]), 'date').main).toBe('226 TE');
    const c = card(input([date(NOV1, NOV1 + 3 * H, 230)]), 'date');
    expect(c.title).toBe('By Nov 1');
    expect(c.main).toBe('None in time');
    expect(c.lines).toEqual(['No route finishes before your date. The nearest is 3 hours after.', '230 TE · 200 240 230 · after your date']);
    expect(c.action?.to).toEqual({ to: 'by-date', deadline: NOV1, eggDay: false, tab: 'nearby' });
  });
});

describe('Next steps: a late Egg Day run doesn’t count', () => {
  it('only late runs: the step stays, saying so', () => {
    const s = buildSteps(input([date(EGG, EGG + 7 * H, 252)])).steps.find(x => x.id === 'eggday')!;
    expect(s.text).toBe('No Egg Day 2027 run finishes before Egg Day starts');
    expect(s.reason).toBe('No route finishes before Egg Day starts. The nearest is 7 hours after.');
    expect(s.button).toBe('Find my Egg Day answer');
  });

  it('a run in time: no step', () => {
    expect(buildSteps(input([date(EGG, EGG - H, 250), date(EGG, EGG + 7 * H, 252)])).steps.some(x => x.id === 'eggday')).toBe(false);
  });

  it('nothing at all: "No Egg Day 2027 run yet", as before', () => {
    expect(buildSteps(input([])).steps.find(x => x.id === 'eggday')?.text).toBe('No Egg Day 2027 run yet');
  });
});

describe('the chart', () => {
  it('a late saved answer is left out and counted as missed; one in time is drawn', () => {
    const answer = (id: string, ascendAt: number) => ({
      id,
      result: { deadline: EGG, level: 'quick', routes: [{ chain: [200, 250], ascendAt, spare: EGG - ascendAt }] },
    });
    const s = buildScatter({
      rows: [],
      savedAnswers: [answer('late', EGG + 2 * H), answer('ok', EGG - 2 * H)] as never,
      eggDayAt: EGG,
      eggDayYear: 2027,
      zone: ZONE,
    });
    expect(s.points.map(p => p.id)).toEqual(['answer-ok']);
    expect(s.missed).toBe(1);
  });
});
