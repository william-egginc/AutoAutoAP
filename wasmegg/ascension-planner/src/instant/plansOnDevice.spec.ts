import { describe, expect, it } from 'vitest';
import { hashID } from '@/lib/storage/db';
import {
  addPlan,
  againStart,
  clearPlans,
  entryFromRow,
  parsePlans,
  plansKey,
  readPlans,
  recordPlan,
  routeText,
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
const entry = (chain: number[], goal = 'Race to 490', at = 1): PlanEntry => ({
  chain,
  goal,
  simulatedAt: at,
  start: 1_800_000_000,
  a1: '2-sale',
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
    recordPlan(s, hash, entry([300, 490], 'Race to 490', 1));
    recordPlan(s, hash, entry([490], 'Race to 490', 2));
    recordPlan(s, hash, entry([300, 490], 'Egg Day 2027', 3));
    const list = recordPlan(s, hash, entry([300, 490], 'Race to 490', 4));
    expect(list.map(e => `${e.goal}:${routeText(e.chain)}`)).toEqual([
      'Race to 490:300 → 490',
      'Egg Day 2027:300 → 490',
      'Race to 490:490',
    ]);
    expect(readPlans(s, hash)).toEqual(list);
    let many: PlanEntry[] = [];
    for (let i = 0; i < 60; i++) many = addPlan(many, entry([200 + i, 490], 'Race to 490', i));
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
    expect(entryFromRow(row, 'Race to 490', false, '2-sale', 5)).toEqual({
      chain: [300, 470],
      goal: 'Race to 490',
      simulatedAt: 5,
      start: T,
      a1: '2-sale',
      finishAt: T + 10 * 86400,
      days: 10,
    });
    const dated = entryFromRow(row, 'Egg Day 2027', true, '2-sale', 5);
    expect(dated.te).toBe(470);
    expect(dated.finishAt).toBe(T + 9 * 86400);
    expect(dated.days).toBeUndefined();
  });

  it('Simulate again starts at the saved start if still ahead, else now', () => {
    expect(againStart(entry([490]), 1_700_000_000)).toBe(1_800_000_000);
    expect(againStart(entry([490]), 1_900_000_000.5)).toBe(1_900_000_001);
  });
});
