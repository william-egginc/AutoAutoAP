import { describe, expect, it } from 'vitest';
import { hashID } from '@/lib/storage/db';
import {
  addPlan,
  againStart,
  clearPlans,
  deletePlan,
  entryFromRow,
  migratePlan,
  olderThanSave,
  planId,
  savedLine,
  savedTitle,
  parsePlans,
  plansKey,
  readPlans,
  recordPlan,
  routeText,
  updatePlan,
  PLANS_CAP,
  type PlanEntry,
  type PlanStorage,
} from './plansOnDevice';
import type { AnswerRow } from './instantAnswer';

const ID = 'EI1234567890123456';

function memory(): PlanStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k),
  };
}
const entry = (chain: number[], goal = 'Reach 490 TE', at = 1): PlanEntry => ({
  chain,
  goal,
  dated: false,
  savedAt: at,
  start: 1_800_000_000,
  a1: '2-sale',
  ascensions: [],
  simVersion: '2026-10-19-joo717',
  gear: 'maxed gear',
  finishAt: 1_801_000_000,
  days: 12.5,
});

describe('plans on this device', () => {
  it('keys the list by the hashed ID only, never a raw one', async () => {
    const hash = await hashID(ID);
    expect(plansKey(hash)).toBe(`aap-joo-plans:${hash}`);
    expect(plansKey(ID)).toBeNull();
    expect(plansKey('anonymous')).toBeNull();
    expect(plansKey('')).toBeNull();
    const s = memory();
    recordPlan(s, hash, entry([300, 490]));
    expect([...s.data.keys()]).toEqual([`aap-joo-plans:${hash}`]);
    expect([...s.data.keys(), ...s.data.values()].join('')).not.toContain(ID);
    // A raw ID as the "hash": nothing written.
    const t = memory();
    recordPlan(t, ID, entry([300, 490]));
    expect(t.data.size).toBe(0);
  });

  it('records newest first, one per route and goal, at most 50', async () => {
    const hash = await hashID(ID);
    const s = memory();
    recordPlan(s, hash, entry([300, 490], 'Reach 490 TE', 1));
    recordPlan(s, hash, entry([490], 'Reach 490 TE', 2));
    recordPlan(s, hash, entry([300, 490], 'Egg Day 2027', 3));
    const list = recordPlan(s, hash, entry([300, 490], 'Reach 490 TE', 4));
    expect(list.map(e => `${e.goal}:${routeText(e.chain)}`)).toEqual([
      'Reach 490 TE:300 → 490',
      'Egg Day 2027:300 → 490',
      'Reach 490 TE:490',
    ]);
    expect(readPlans(s, hash)).toEqual(list);
    let many: PlanEntry[] = [];
    for (let i = 0; i < 60; i++) many = addPlan(many, entry([200 + i, 490], 'Reach 490 TE', i));
    expect(many).toHaveLength(PLANS_CAP);
    expect(many[0].chain[0]).toBe(259);
  });

  it('accounts are kept apart, and Clear empties only its own', async () => {
    const a = await hashID(ID);
    const b = await hashID('EI0000000000000000');
    const s = memory();
    recordPlan(s, a, entry([300, 490]));
    recordPlan(s, b, entry([490]));
    clearPlans(s, a);
    expect(readPlans(s, a)).toEqual([]);
    expect(readPlans(s, b)).toHaveLength(1);
  });

  it('survives broken storage: bad JSON, bad entries, throwing storage, none', async () => {
    const hash = await hashID(ID);
    expect(parsePlans('{not json')).toEqual([]);
    expect(parsePlans(JSON.stringify([entry([490]), { chain: 'x' }, null]))).toHaveLength(1);
    const broken: PlanStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(readPlans(broken, hash)).toEqual([]);
    expect(recordPlan(broken, hash, entry([490]))).toHaveLength(1);
    expect(() => clearPlans(broken, hash)).not.toThrow();
    expect(readPlans(null, hash)).toEqual([]);
  });

  it('takes the finish (race) or the TE and last ascension (by a date) from the row', () => {
    const T = 1_800_000_000;
    const row: AnswerRow = {
      ascensions: 2,
      endTE: 470,
      best: true,
      route: {
        chain: [300, 470],
        legs: [
          { from: 250, to: 300, endTE: 300, start: T, end: T + 86400, sales: 2, tier13: false, label: '2-sale' },
          {
            from: 300,
            to: 470,
            endTE: 470,
            start: T + 86400,
            end: T + 9 * 86400,
            sales: 2,
            tier13: false,
            label: '2-sale',
          },
        ],
        end: T + 10 * 86400,
        seconds: 10 * 86400,
      },
    } as AnswerRow;
    const meta = { a1: '2-sale', simVersion: '2026-10-19-joo717', gear: 'maxed gear', saveTime: T - 600, now: 5 };
    expect(entryFromRow(row, { ...meta, goal: 'Reach 490 TE', dated: false })).toEqual({
      chain: [300, 470],
      goal: 'Reach 490 TE',
      dated: false,
      savedAt: 5,
      start: T,
      a1: '2-sale',
      ascensions: [
        { to: 300, start: T, end: T + 86400, kind: 'estimate' },
        { to: 470, start: T + 86400, end: T + 9 * 86400, kind: 'estimate' },
      ],
      simVersion: '2026-10-19-joo717',
      gear: 'maxed gear',
      saveTime: T - 600,
      finishAt: T + 10 * 86400,
      days: 10,
    });
    const dated = entryFromRow(row, { ...meta, goal: 'Egg Day 2027', dated: true, deadline: T + 20 * 86400 });
    expect(dated.te).toBe(470);
    expect(dated.deadline).toBe(T + 20 * 86400);
    expect(dated.finishAt).toBe(T + 9 * 86400);
    expect(dated.days).toBeUndefined();
    expect(dated.ascensions.every(a => a.kind === 'estimate')).toBe(true);
  });

  it('Open in the planner starts at the saved start if still ahead, else now', () => {
    expect(againStart(entry([490]), 1_700_000_000)).toBe(1_800_000_000);
    expect(againStart(entry([490]), 1_900_000_000.5)).toBe(1_900_000_001);
  });

  it('reads the older Simulate-this-plan entries in the new shape (migration)', async () => {
    const hash = await hashID(ID);
    const s = memory();
    const old = [
      { chain: [300, 490], goal: 'Race to 490', simulatedAt: 7, start: 1_800_000_000, a1: '2-sale', finishAt: 1_801_000_000, days: 12.5 },
      { chain: [350, 470], goal: 'Egg Day 2027', simulatedAt: 6, start: 1_800_000_000, a1: 'continue', finishAt: 1_802_000_000, te: 470 },
    ];
    s.setItem(`aap-joo-plans:${hash}`, JSON.stringify(old));
    const list = readPlans(s, hash);
    expect(list).toEqual([
      {
        chain: [300, 490],
        goal: 'Reach 490 TE',
        dated: false,
        savedAt: 7,
        start: 1_800_000_000,
        a1: '2-sale',
        ascensions: [],
        simVersion: '',
        gear: '',
        finishAt: 1_801_000_000,
        days: 12.5,
      },
      {
        chain: [350, 470],
        goal: 'Egg Day 2027',
        dated: true,
        savedAt: 6,
        start: 1_800_000_000,
        a1: 'continue',
        ascensions: [],
        simVersion: '',
        gear: '',
        finishAt: 1_802_000_000,
        te: 470,
      },
    ]);
    // A new save of the same route + goal replaces the migrated one.
    const next = recordPlan(s, hash, entry([300, 490], 'Reach 490 TE', 9));
    expect(next.map(planId)).toEqual(['Reach 490 TE|300 490', 'Egg Day 2027|350 470']);
    expect(migratePlan({ chain: [490], goal: 'x', start: 1, a1: '' })).toBeNull();
    expect(migratePlan({ ...entry([490]), ascensions: [{ to: 490, start: 1, end: 2, kind: 'guess' }] })?.ascensions).toEqual([]);
  });

  it('an exact check updates its entry in place (kind exact, shifts, next) and the shifts survive a reload', async () => {
    const hash = await hashID(ID);
    const s = memory();
    recordPlan(s, hash, entry([300, 490]));
    recordPlan(s, hash, entry([490]));
    const exact: PlanEntry = {
      ...entry([300, 490]),
      ascensions: [
        { to: 300, start: 10, end: 20, kind: 'exact', shifts: [{ egg: 'Kindness', at: 15 }, { egg: 7 as never, at: 1 }] },
        { to: 490, start: 20, end: 30, kind: 'estimate', shifts: [{ egg: 'Humility', at: 25 }] },
      ],
      next: { egg: 'Kindness', at: 15 },
    };
    const kept = updatePlan(s, hash, exact);
    // In place: the order is unchanged.
    expect(kept.map(planId)).toEqual(['Reach 490 TE|490', 'Reach 490 TE|300 490']);
    const back = readPlans(s, hash)[1];
    expect(back.ascensions[0]).toEqual({ to: 300, start: 10, end: 20, kind: 'exact', shifts: [{ egg: 'Kindness', at: 15 }] });
    // Shifts are kept on exact ascensions only.
    expect(back.ascensions[1]).toEqual({ to: 490, start: 20, end: 30, kind: 'estimate' });
    expect(back.next).toEqual({ egg: 'Kindness', at: 15 });
    // An entry deleted meanwhile is not brought back.
    deletePlan(s, hash, planId(exact));
    expect(updatePlan(s, hash, exact).map(planId)).toEqual(['Reach 490 TE|490']);
  });

  it('Delete drops one entry by route + goal', async () => {
    const hash = await hashID(ID);
    const s = memory();
    recordPlan(s, hash, entry([300, 490]));
    recordPlan(s, hash, entry([490]));
    expect(deletePlan(s, hash, 'Reach 490 TE|300 490').map(planId)).toEqual(['Reach 490 TE|490']);
    expect(readPlans(s, hash).map(planId)).toEqual(['Reach 490 TE|490']);
  });

  it('the saved line: 12-hour times, "from your save of", older-save wording, next shift only when exact', () => {
    const tz = 'America/Los_Angeles';
    const now = Date.parse('2026-10-19T16:47:00Z') / 1000; // Oct 19, 9:47 am Pacific
    const saved = now - 13 * 3600; // Oct 18, 8:47 pm
    const p: PlanEntry = { ...entry([300, 490], 'Reach 490 TE', saved * 1000), saveTime: saved - 12 * 60 };
    expect(savedLine(p, p.saveTime, now, tz)).toBe('Saved Oct 18 at 8:47 pm (13 hours ago), from your save of Oct 18 at 8:35 pm');
    // The loaded save is newer.
    const old: PlanEntry = { ...p, savedAt: (now - 9 * 86400) * 1000, saveTime: now - 9 * 86400 - 60 };
    expect(savedLine(old, now - 3600, now, tz)).toBe('Saved Oct 10 at 9:47 am (9 days ago): older than your current save');
    // A next shift without an exact check is not said.
    const next = { egg: 'Kindness', at: now + 4 * 86400 };
    expect(savedLine({ ...p, next }, p.saveTime, now, tz)).not.toContain('next:');
    const exact: PlanEntry = { ...p, next, ascensions: [{ to: 300, start: now, end: now + 86400, kind: 'exact' }] };
    expect(savedLine(exact, p.saveTime, now, tz)).toBe(
      'Saved Oct 18 at 8:47 pm (13 hours ago), from your save of Oct 18 at 8:35 pm · next: shift to Kindness Oct 23 at 9:47 am (in 4 days)'
    );
    expect(olderThanSave({ savedAt: 1000 * 1000 }, 2000)).toBe(true);
    expect(olderThanSave({ savedAt: 1000 * 1000, saveTime: 3000 }, 2000)).toBe(false);
    expect(olderThanSave({ savedAt: 1 }, undefined)).toBe(false);
  });

  it('the saved title: goal and TE by a date, goal and finish day for the race', () => {
    const tz = 'America/Los_Angeles';
    expect(savedTitle({ ...entry([160, 247], 'Egg Day 2027'), dated: true, te: 247 }, tz)).toBe('Egg Day 2027 · 247 TE');
    expect(savedTitle({ ...entry([300, 490]), finishAt: Date.parse('2029-02-18T20:44:00Z') / 1000 }, tz)).toBe(
      'Reach 490 TE · Feb 18, 2029'
    );
  });
});
