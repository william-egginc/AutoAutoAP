/**
 * The followed route's estimate shown last, kept in this browser (cached answers first, then recheck: Jordan, 27 Oct
 * 2026): a reload of My runs shows it at once, marked, while it is priced again. Per account hash, goal and route;
 * the newest HELD_MAX; never the player ID.
 */
import { describe, expect, it } from 'vitest';
import { HELD_ESTIMATE_KEY, HELD_MAX, keepHeld, readHeld } from './heldEstimate';

function mem() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}
const held = (goalKey: string, at: number, account = 'acct') => ({ account, goalKey, chain: [225, 300], at, plan: { chain: [225, 300] }, card: { price: 'estimate' } });

describe('the held estimate', () => {
  it('round-trips by account, goal and route; another account, goal or route: none', () => {
    const st = mem();
    expect(keepHeld(held('eggday-2027', 5), st)).toBe(true);
    expect(readHeld('acct', 'eggday-2027', [225, 300], st)?.at).toBe(5);
    expect(readHeld('other', 'eggday-2027', [225, 300], st)).toBeNull();
    expect(readHeld('acct', 'fastest-490', [225, 300], st)).toBeNull();
    expect(readHeld('acct', 'eggday-2027', [225, 301], st)).toBeNull();
  });

  it('one per account and goal (the newest), at most HELD_MAX in all', () => {
    const st = mem();
    keepHeld(held('g', 1), st);
    keepHeld(held('g', 2), st);
    expect(JSON.parse(st.map.get(HELD_ESTIMATE_KEY)!)).toHaveLength(1);
    for (let i = 0; i < HELD_MAX + 3; i++) keepHeld(held(`g${i}`, 10 + i), st);
    const list = JSON.parse(st.map.get(HELD_ESTIMATE_KEY)!) as { at: number }[];
    expect(list).toHaveLength(HELD_MAX);
    expect(Math.min(...list.map(h => h.at))).toBe(10 + 3);
  });

  it('never keeps anything holding a player ID; unreadable storage: none', () => {
    const st = mem();
    expect(keepHeld({ ...held('g', 1), plan: { note: 'EI1234567890123456' } }, st)).toBe(false);
    expect(st.map.get(HELD_ESTIMATE_KEY) ?? '').not.toMatch(/EI\d{16}/i);
    st.map.set(HELD_ESTIMATE_KEY, 'not json');
    expect(readHeld('acct', 'g', [225, 300], st)).toBeNull();
    expect(readHeld('acct', 'g', [225, 300], null)).toBeNull();
  });
});
