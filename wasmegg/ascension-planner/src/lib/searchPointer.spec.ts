/**
 * The pointer on the instant card (lib/searchPointer.ts; wireframes/price-route-v2, Jordan 23 Oct 2026): the
 * level's own name, the TE by a date or the finish date on Fastest, and the one line under the instant answer.
 */
import { describe, expect, it } from 'vitest';
import { foundLevel, INSTANT_ONE_LINE, pointerOf, POINTER_LINK } from './searchPointer';

const show = (u: number) => (u === 1833095400 ? 'Feb 8, 2028 at 9:10 am' : String(u));

describe('foundLevel', () => {
  it('names the result by the search that found it', () => {
    expect(foundLevel({ custom: false, effort: 'quick' })).toBe('Fast');
    expect(foundLevel({ custom: false, effort: undefined })).toBe('Fast');
    expect(foundLevel({ custom: false, effort: 'normal' })).toBe('Exact');
    expect(foundLevel({ custom: false, effort: 'thorough' })).toBe('Exact');
    expect(foundLevel({ custom: true, effort: 'quick' })).toBe('Custom');
  });
});

describe('pointerOf', () => {
  it('By a date: the TE, with the level named', () => {
    const p = pointerOf('date', { level: 'Fast', chain: [227, 257, 285, 312], end: 1, endTE: 312.4 }, show);
    expect(p?.text).toBe('Fast found 312 TE on your account.');
    expect(p?.value).toBe('312 TE');
  });
  it('Fastest: the finish date', () => {
    const p = pointerOf('fastest', { level: 'Fast', chain: [247, 490], end: 1833095400, endTE: 490 }, show);
    expect(p?.text).toBe('Fast found Feb 8, 2028 at 9:10 am on your account.');
  });
  it('Exact and Custom say their own name', () => {
    expect(pointerOf('date', { level: 'Exact', chain: [312], end: 1, endTE: 312 }, show)?.text).toMatch(/^Exact found/);
    expect(pointerOf('date', { level: 'Custom', chain: [312], end: 1, endTE: 312 }, show)?.text).toMatch(/^Custom found/);
  });
  it('nothing without a result', () => {
    expect(pointerOf('date', null, show)).toBeNull();
    expect(pointerOf('date', { level: 'Fast', chain: [], end: 1, endTE: 1 }, show)).toBeNull();
  });
  it('the link and the one line, word for word', () => {
    expect(POINTER_LINK).toBe('See it ↓');
    expect(INSTANT_ONE_LINE).toBe(
      'These are instant answers, worked out ahead of time. For an answer priced on your account (your hours, your current ascension, your gear), run Fast, Exact or Custom below.'
    );
  });
});

describe('firstAscensionFromLiveLeg (hook for First ascension and One more TE on the instant card, not wired)', () => {
  it('passes a live first leg on as RouteExtras props, with its shifts; nothing without one', async () => {
    const { firstAscensionFromLiveLeg } = await import('./searchPointer');
    expect(firstAscensionFromLiveLeg(null)).toBeNull();
    expect(firstAscensionFromLiveLeg({ chain: [197, 313], legs: [], reachAt: 5 })).toBeNull();
    const leg = { key: 'continue', endTE: 197, durationSeconds: 10, maxELR: 0, endTime: 2_000_000_000, tier13Unlocked: false, shifts: [{ at: 1_900_000_000, egg: 'humility', fromEgg: 'integrity', te: 40 }] };
    const r = firstAscensionFromLiveLeg({ chain: [197, 313], legs: [leg as never], reachAt: 2_100_000_000 });
    expect(r?.props.chain).toEqual([197, 313]);
    expect(r?.shifts).toEqual([{ at: 1_900_000_000, egg: 'humility' }]);
    const fs = await import('node:fs');
    const path = await import('node:path');
    const route = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
    expect(route.match(/HOOK: First ascension/g)?.length).toBeGreaterThanOrEqual(1);
    expect(route).toContain('`firstAscensionFromLiveLeg`');
  });
});
