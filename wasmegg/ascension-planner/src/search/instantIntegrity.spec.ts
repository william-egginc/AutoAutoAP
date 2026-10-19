import { describe, expect, it } from 'vitest';
import { holdsRoutes, instantIntegrity, openingRoundsNote } from './instantIntegrity';
import { renderHtml, textOf } from '@/test/renderComponent';
import InstantIntegrity from '@/components/auto/InstantIntegrity.vue';
import type { CteParts } from './rules';

const cte: CteParts = { total: 180.4, te: 120, gear: 70.4, colleggtibles: -6, lab: 0, permit: 0 };

describe('instantIntegrity', () => {
  it('a healthy account, or one not measured: nothing, routes shown', () => {
    expect(instantIntegrity(null, false, null, false)).toEqual({ kind: 'none' });
    expect(instantIntegrity(600, false, null, false)).toEqual({ kind: 'none' });
    expect(instantIntegrity(3600, false, null, false)).toEqual({ kind: 'none' });
    expect(holdsRoutes({ kind: 'none' })).toBe(false);
  });

  it('while the check runs: routes held back', () => {
    const s = instantIntegrity(null, true, null, false);
    expect(s.kind).toBe('checking');
    expect(holdsRoutes(s)).toBe(true);
  });

  it('over an hour: routes shown, with the wait their times include', () => {
    const s = instantIntegrity(5 * 3600, false, null, false);
    expect(s.kind).toBe('warn');
    expect(holdsRoutes(s)).toBe(false);
    if (s.kind !== 'warn') return;
    expect(s.text).toContain('Times on your account include an Integrity wait of 5.0 hours');
    expect(s.text).toContain('Check exactly includes it');
    const own = instantIntegrity(5 * 3600, false, null, true);
    expect(own.kind === 'warn' && own.text).not.toContain('Check exactly includes it');
  });

  it('over a week: no routes, the Clothed TE against ~225 and what adds up to the gap', () => {
    const s = instantIntegrity(480 * 86400, false, cte, false);
    expect(s.kind).toBe('blocked');
    expect(holdsRoutes(s)).toBe(true);
    if (s.kind !== 'blocked') return;
    expect(s.text).toContain('for 480 days');
    expect(s.text).toContain('Nobody really waits that long, so the instant answer shows no routes');
    expect(s.text).toContain('Your Clothed TE is about 180.4');
    expect(s.text).toContain("Accounts get through at about 225, so you're about 45 short.");
    expect(s.text).toContain('Any mix of these that adds up to about 45 does it');
    expect(s.text).toContain("Please come back once you're closer.");
  });

  it('blocked past the usual line, or without the parts: says so', () => {
    const past = instantIntegrity(30 * 86400, false, { ...cte, total: 230 }, false);
    expect(past.kind === 'blocked' && past.text).toContain('Please share this on Discord');
    const none = instantIntegrity(30 * 86400, false, null, false);
    expect(none.kind === 'blocked' && none.text).toContain('Clothed TE of about 225');
  });
});

describe('InstantIntegrity.vue', () => {
  it('blocked: the heading, the wait in bold, the advice', async () => {
    const html = await renderHtml(InstantIntegrity, { state: instantIntegrity(480 * 86400, false, cte, false) });
    expect(textOf(html)).toMatch(/^This account can't be planned yet A fresh ascension/);
    expect(html).toContain('<b class="font-black">480 days</b>');
    expect(html).toContain('<b class="font-black">Nobody really waits that long</b>');
    expect(textOf(html)).toContain('Any mix of these that adds up to about 45 does it');
  });

  it('warn: an amber note; checking: one grey line; none: nothing', async () => {
    const warn = textOf(await renderHtml(InstantIntegrity, { state: instantIntegrity(2 * 3600, false, null, false) }));
    expect(warn).toMatch(/^This account stalls\. Times on your account include an Integrity wait of 2\.0 hours/);
    const checking = textOf(await renderHtml(InstantIntegrity, { state: { kind: 'checking' } }));
    expect(checking).toBe('Checking whether this account can build…');
    expect(textOf(await renderHtml(InstantIntegrity, { state: { kind: 'none' } }))).toBe('');
  });
});

describe("the instant answer's opening-rounds label", () => {
  it('says nothing when one round maxes the habs, or when not measured', () => {
    expect(openingRoundsNote(null)).toBe('');
    expect(openingRoundsNote({ rounds: 1, openingSeconds: 3600 })).toBe('');
  });

  it('names the rounds and how long the opening takes', () => {
    const note = openingRoundsNote({ rounds: 3, openingSeconds: 15 * 3600 });
    expect(note).toContain('3 times');
    expect(note).toContain('15.0 hours');
    expect(note).toContain('Every date here includes them');
  });
});
