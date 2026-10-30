/**
 * The build-up tracker's list (lib/buildUpTracker.ts) against the format oracle (notes/jordan-a2-buildup-2026-10-29.md
 * section D). Fixed clock, placeholder plan (buildUpTracker.fixture.ts), no wall-clock waits. The buys differ from
 * the oracle's (it re-timed a library plan); where the fixture makes the same buys at the same times, the lines must
 * be the oracle's lines exactly (its bold marks stripped).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  buildUpTracker,
  buildPart,
  gapWords,
  lineText,
  rangeWords,
  readTicks,
  ticksKey,
  trackerSummary,
  writeTicks,
  clock12,
  type TrackerResult,
} from './buildUpTracker';
import { fixtureActions, fixturePlan, HOURS, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpAction } from '@/search/buildUpActions';

const NOW = mt(10, 30, 12, 10);

function run(over: Partial<Parameters<typeof buildUpTracker>[0]> = {}): TrackerResult {
  const p = fixturePlan();
  return buildUpTracker({
    actions: p.actions,
    zone: ZONE,
    hours: HOURS,
    siloSeconds: p.siloSeconds,
    startSilos: p.start?.siloCount,
    startEgg: p.start?.egg,
    now: NOW,
    ...over,
  });
}
const texts = (r: TrackerResult) => r.lines.map(lineText);
const oracle = (s: string) => s.replace(/\*\*/g, '');

describe('buildUpTracker: the oracle format (section D)', () => {
  const r = run();
  const all = texts(r);

  it.each([
    '8:47 am · buy Grav Plating 18, Autonomous Vehicles 2, Crystalline Shelling 59-67 · offline 14 min',
    '9:01 am · buy Crystalline Shelling 84, Telepathic Will 11',
    '9:01 am · **shift to Kindness** · offline 1 min',
    '9:02 am · **buy 14 Hyperloop Trains (slots 1-14), cars to 5** · offline 1 min',
    '9:03 am · **buy 2 Hyperloop Trains (slots 15-16), cars to 5** · offline 1 min',
    '9:04 am · **buy 1 Hyperloop Train (slot 17), cars to 5**',
    '9:04 am · **shift to Integrity** · offline 1 min',
    '9:05 am · **buy Planet Portal in hab slot 1**',
    '9:05 am · **buy Chicken Universe in hab slot 1** · offline 1 min',
    '9:06 am · **buy Chicken Universe in hab slot 2**',
    '9:06 am · **buy Chicken Universe in hab slot 4**',
    '9:06 am · **shift to Curiosity** · offline 1 min',
    '9:35 am · buy Atomic Purification 24',
    'wait for the sale: offline until Fri Oct 30 10:00 am (25 min)',
    '10:00 am · **research sale starts** (Manual Planner: sale on)',
    '10:30 am · buy Eggsistor Miniturization 27 · offline 1 h 33 min',
    '12:03 pm · buy Graviton Coupling 3',
    '12:03 pm · **shift to Kindness**',
    '12:03 pm · **train cars: all 17 trains to 8**',
    '12:03 pm · **shift to Resilience**',
    '12:03 pm · **buy silos #2-5** · offline 1 min',
    '12:04 pm · **buy silos #6-8** · offline 12 min',
    '12:16 pm · **buy silo #9**',
    '12:16 pm · **shift to Curiosity** · offline 1 min',
    '12:57 am · buy Timeline Diversion 41 · offline 6 h 3 min',
    '9:49 am · buy Timeline Diversion 42 · offline 22 h 57 min',
    '10:00 am · **research sale ends** (Manual Planner: sale off)',
    '7:46 am · **last Sunday check-in: collect, then go offline until Mon 10:01 am (26 h 15 min)**',
    '10:01 am · **back online inside the 2x event (nothing to buy)**',
    'wait for the sale: offline until Fri Nov 6 10:00 am (3 d 23 h 59 min) (open the farm once a day; nothing to buy)',
    '10:00 am · **shift to Humility**',
    '10:00 am · **set swap: equip the ELR set**',
  ])('has the oracle line %s', line => {
    expect(all).toContain(oracle(line));
  });

  it('merges research per check-in, tiers apart, plan order', () => {
    expect(all).toContain(
      '8:42 am · buy Comfortable Nests 1-50, Excitable Chickens 1-25, Internal Hatchery Expansion (tier 5) 1-15, Bigger Eggs 1, Internal Hatchery Expansion (tier 7) 1-5 · offline 5 min'
    );
  });

  it('bold lines: shifts, trains, cars, habs, silos, the set swap, the prestige, the silo trick; research is granular', () => {
    for (const l of r.lines) {
      if (['shift', 'trains', 'trainCars', 'hab', 'silo', 'setSwap', 'prestige', 'siloTrick', 'back'].includes(l.kind)) expect(l.bold, l.text).toBe(true);
      if (l.kind === 'research') expect(l.granular && !l.bold).toBe(true);
    }
  });

  it('check-ins are at least 1 minute apart, never before the planned time', () => {
    const at = r.checkIns.map(c => c.at);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(60);
    // Every planned buy is at or after its own time: the earliest check-in is the prestige.
    expect(at[0]).toBe(mt(10, 30, 8, 41));
  });

  it('each offline tail equals the next check-in time minus its own (as shown)', () => {
    const ci = r.lines.filter(l => l.checkIn >= 0);
    for (const l of ci) {
      if (!l.tail) continue;
      const next = r.checkIns[l.checkIn + 1];
      expect(l.tail).toBe(`offline ${gapWords(Math.floor(next.at / 60) * 60 - Math.floor(l.at / 60) * 60)}`);
    }
  });

  it('sale buys are fixed to the clock: the engine said 9:59:58, the line says 10:00 am', () => {
    expect(all).toContain('10:00 am · buy Eggsistor Miniturization 16-22, Neural Net Refinement 10-11 · offline 30 min');
  });

  it('nothing inside the night: a buy due at 3:10 am is at 7:00 am, still before the sale ends', () => {
    expect(all).toContain('7:00 am · buy Wormhole Dampening 12, Eggsistor Miniturization 40 · offline 2 h 49 min');
    for (const c of r.checkIns) {
      const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }).format(c.at * 1000));
      expect(h >= 1 && h < 7, clock12(c.at, ZONE)).toBe(false);
    }
  });

  it('the build-up stops at the first wait for TE', () => {
    expect(buildPart(fixtureActions()).some(a => a.id === 'wait_for_te')).toBe(false);
    expect(r.lines[r.lines.length - 1].text).toBe('set swap: equip the ELR set');
    expect(r.lines[r.lines.length - 1].tail).toBe('');
  });

  it('days in the zone with the clock change noted and the right check-in counts', () => {
    expect(r.days.map(d => d.title)).toEqual(['Fri Oct 30', 'Sat Oct 31', 'Sun Nov 1', 'Mon Nov 2', 'Fri Nov 6', 'Sat Nov 7', 'Sun Nov 8', 'Mon Nov 9', 'Fri Nov 13']);
    expect(r.days[2].clockNote).toBe('clocks go back 1 h at 2:00 am');
    expect(r.days.filter(d => d.clockNote).length).toBe(1);
    expect(r.days.reduce((n, d) => n + d.checkIns, 0)).toBe(r.checkIns.length);
  });

  it('today and the next day with check-ins start open, the others collapsed', () => {
    expect(r.days.filter(d => d.openByDefault).map(d => d.title)).toEqual(['Fri Oct 30', 'Sat Oct 31']);
    const later = run({ now: mt(11, 3, 12, 0) });
    expect(later.days.filter(d => d.openByDefault).map(d => d.title)).toEqual(['Fri Nov 6']);
  });
});

describe('buildUpTracker: set swaps only on Humility', () => {
  it('the starting set (equipped at the prestige, before any shift) is not a swap: said on the prestige line, no note', () => {
    const r = run();
    expect(lineText(r.lines[0])).toBe('8:41 am · prestige: start the ascension on Curiosity (earnings set on) · offline 1 min');
    expect(r.days[0].lines.filter(l => l.kind === 'note' && /8:41/.test(l.time))).toHaveLength(0);
  });
  it('drops a swap made off Humility during the build-up, with a note after the check-in\'s own lines', () => {
    const r = run();
    expect(r.droppedSwaps).toBe(1);
    const notes = r.lines.filter(l => l.kind === 'note');
    expect(notes.map(l => lineText(l))).toEqual(['12:03 pm · set swap left out: sets are swapped only on Humility (the plan had it on Resilience)']);
    expect(notes[0].tickable).toBe(false);
    // The offline tail stays on the check-in's last own line.
    expect(texts(r)).toContain('12:03 pm · buy silos #2-5 · offline 1 min');
  });
  it("H1's update + equip of the ELR set on Humility is one bold line", () => {
    const swaps = run().lines.filter(l => l.kind === 'setSwap');
    expect(swaps.map(l => lineText(l))).toEqual(['10:00 am · set swap: equip the ELR set']);
    expect(swaps[0].bold).toBe(true);
  });
});

describe('buildUpTracker: the silo trick against the silo time S', () => {
  it('claims it when the stretch fits, with the spare', () => {
    const t = run().lines.filter(l => l.kind === 'siloTrick');
    expect(t).toHaveLength(2);
    expect(t[0].sub).toBe('27 h of silos, 45 min spare');
  });

  it('silos too short (S = 9 h): no trick, a warning, the plan as it is', () => {
    const r = run({ siloSeconds: 3600 });
    expect(r.lines.some(l => l.kind === 'siloTrick' || l.kind === 'back')).toBe(false);
    const w = r.lines.filter(l => l.kind === 'warning');
    expect(w.length).toBe(2);
    // 9 h back from Mon 10:01 am is inside the night: going offline at 12:59 am, the last awake minute, is 2 min too long.
    expect(w[0].text).toBe(
      'Your silos hold 9 h: going offline Mon Nov 2 12:59 am does not reach Mon Nov 2 10:01 am. No silo trick this week: check in as planned.'
    );
  });

  it('S unknown: a warning, no trick', () => {
    const r = run({ siloSeconds: null });
    expect(r.lines.some(l => l.kind === 'siloTrick')).toBe(false);
    expect(r.lines.filter(l => l.kind === 'warning')[0].text).toMatch(/silo time is not known/);
  });

  it('a check-in inside the stretch: no trick', () => {
    const extra: BuildUpAction = { t: mt(11, 1, 18, 0), kind: 'research', label: 'Eggsistor Miniturization', id: 'eggsistor', fromLevel: 40, level: 41 };
    const r = run({ actions: [...fixtureActions(), extra].sort((a, b) => a.t - b.t) });
    const sun = r.days.find(d => d.title === 'Sun Nov 1')!;
    expect(sun.lines.some(l => l.kind === 'siloTrick')).toBe(false);
    expect(sun.lines.some(l => l.kind === 'warning' && /check-in at Sun Nov 1 6:00 pm/.test(l.text))).toBe(true);
  });
});

describe('buildUpTracker: no hours, other zones', () => {
  it('without hours a night buy stays at its time', () => {
    const r = run({ hours: null });
    expect(texts(r)).toContain('3:10 am · buy Wormhole Dampening 12 · offline 2 h 10 min');
  });

  it('a player in another zone sees the same sale at their clock', () => {
    const r = run({ zone: 'Europe/London' });
    expect(texts(r)).toContain('wait for the sale: offline until Fri Oct 30 4:00 pm (25 min)');
  });
});

describe('words', () => {
  it('gapWords and rangeWords', () => {
    expect(gapWords(60)).toBe('1 min');
    expect(gapWords(3600)).toBe('1 h');
    expect(gapWords(93 * 60)).toBe('1 h 33 min');
    expect(gapWords((3 * 1440 + 23 * 60 + 59) * 60)).toBe('3 d 23 h 59 min');
    expect(rangeWords([3, 1, 2, 5])).toBe('1-3, 5');
  });
});

describe('ticks', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    });
  });
  it('are stored per account and ascension, and restored; the summary counts whole check-ins', () => {
    const r = run();
    const multi = r.checkIns.find(c => c.keys.length > 1)!;
    // The first check-in whole, and half of a two-line one: one check-in bought.
    const t = new Set([...r.checkIns[0].keys, multi.keys[0]]);
    writeTicks('acct', 1000, t);
    expect(localStorage.getItem(ticksKey('acct', 1000))).not.toBeNull();
    expect([...readTicks('acct', 1000)].sort()).toEqual([...t].sort());
    expect(readTicks('acct', 2000).size).toBe(0);
    const s = trackerSummary(r, readTicks('acct', 1000));
    expect(s.done).toBe(1);
    expect(s.next).toBe(r.checkIns[1]);
  });
  it('a broken record reads as none', () => {
    localStorage.setItem(ticksKey('acct', 1), '{nope');
    expect(readTicks('acct', 1).size).toBe(0);
  });
});
