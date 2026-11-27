/**
 * The no-held-buys pass (InstantRoute.vue `runAltPass`, Jordan 21 Nov 2026 option 1(a)) prices the first ascension
 * without held buys too (code review 22 Nov 2026, math-exact-4): `tailExtra` goes into the tail the first legs are
 * asked with and the tail handed back, not only into the later legs'.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./instantFirstLegs', async orig => ({
  ...(await orig<typeof import('./instantFirstLegs')>()),
  instantFirstLegsBase: vi.fn(async () => ({ startTE: 200, final: 210, delivered: [], cont: null })),
}));
import { instantFirstLegs } from './instantCompute';
import type { SearchInputs } from './types';

const hours = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Los_Angeles' };
const run = async (tailExtra?: object) => {
  const asked: Record<string, unknown>[] = [];
  const legs = await instantFirstLegs({
    pool: { firstLegs: async r => (asked.push(r as never), []) },
    url: '/precompute/table-v2.bin',
    header: { to: 400 },
    inputs: { planStart: 1800000000 } as SearchInputs,
    te: 200,
    final: 210,
    scale: 1,
    hours,
    deferShifts: true,
    buildUpTails: async () => [],
    liveFresh: async () => [],
    ...(tailExtra ? { tailExtra } : {}),
  });
  return { legs: legs!, asked: asked[0] };
};

describe('instantFirstLegs tailExtra', () => {
  it('without it: held buys as the tail has them (not turned off)', async () => {
    const { legs, asked } = await run();
    expect(legs.tail.heldBuys).not.toBe(false);
    expect(asked.heldBuys).not.toBe(false);
  });
  it('{ heldBuys: false }: the first legs are asked without held buys, and the tail handed back has it', async () => {
    const { legs, asked } = await run({ heldBuys: false });
    expect(asked.heldBuys).toBe(false);
    expect(legs.tail.heldBuys).toBe(false);
  });
});
