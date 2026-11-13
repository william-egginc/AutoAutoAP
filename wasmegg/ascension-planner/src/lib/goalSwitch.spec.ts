/**
 * Chain Finder's goal switch, "Target TE | By a date" (spec-chainfinder, Jordan 12 Nov 2026: Joo's one page with a
 * switch, not two tabs). Each side is an address: picking it sets the hash exactly as the old goal tabs did, so links,
 * reloads and Fastest's Custom depth (#/auto/fastest/full) keep working. A radio group: one Tab stop, the arrows (and
 * Home / End) move the choice.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import { DEFAULT_ROUTE, hashFor, routeFromLocation, topTabOf } from './siteNav';
import { CHAIN_GOALS, goalAfterKey } from './goalSwitch';
import { CHAIN_FINDER_WORDS } from './chainFinderWords';
import GoalSwitch from '@/components/auto/GoalSwitch.vue';

describe('the two goals', () => {
  it('Target TE then By a date, Fastest and By a date underneath', () => {
    expect(CHAIN_GOALS).toEqual(['fastest', 'by-date']);
    expect(CHAIN_FINDER_WORDS.goals.fastest).toBe('Target TE');
    expect(CHAIN_FINDER_WORDS.goals['by-date']).toBe('By a date');
  });

  it("each side's address is the old goal tab's, and lands back on it (Chain Finder lit)", () => {
    const at = (auto: 'fastest' | 'by-date', depth: 'smart' | 'full' = 'smart') => hashFor({ ...DEFAULT_ROUTE, section: 'auto', auto, depth });
    expect(at('fastest')).toBe('#/auto/fastest');
    expect(at('fastest', 'full')).toBe('#/auto/fastest/full');
    expect(at('by-date')).toBe('#/auto/by-date');
    // By a date has no depth: the full depth never leaks into its address.
    expect(at('by-date', 'full')).toBe('#/auto/by-date');
    for (const h of ['#/auto/fastest', '#/auto/fastest/full', '#/auto/by-date']) {
      const r = routeFromLocation('', h)!;
      expect(hashFor(r)).toBe(h);
      expect(topTabOf(r)).toBe('chain');
    }
  });
});

describe('the keyboard (radio group)', () => {
  it('Right / Down go to the next goal, Left / Up to the previous, wrapping', () => {
    expect(goalAfterKey('fastest', 'ArrowRight')).toBe('by-date');
    expect(goalAfterKey('fastest', 'ArrowDown')).toBe('by-date');
    expect(goalAfterKey('by-date', 'ArrowRight')).toBe('fastest');
    expect(goalAfterKey('by-date', 'ArrowLeft')).toBe('fastest');
    expect(goalAfterKey('by-date', 'ArrowUp')).toBe('fastest');
    expect(goalAfterKey('fastest', 'ArrowLeft')).toBe('by-date');
  });
  it('Home is the first, End the last; other keys do nothing', () => {
    expect(goalAfterKey('by-date', 'Home')).toBe('fastest');
    expect(goalAfterKey('fastest', 'End')).toBe('by-date');
    for (const k of ['Tab', 'Enter', ' ', 'a', 'Escape']) expect(goalAfterKey('fastest', k)).toBeNull();
  });
});

describe('GoalSwitch.vue', () => {
  const render = (current: 'fastest' | 'by-date', running: 'fastest' | 'by-date' | null = null) =>
    renderHtml(GoalSwitch, { current, running });

  it('is a labelled radio group of two radios, the current one checked', async () => {
    const html = await render('by-date');
    expect(html).toMatch(/<div[^>]*role="radiogroup"[^>]*aria-label="Goal"/);
    const radios = html.match(/<button\b[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    for (const b of radios) expect(b).toContain('role="radio"');
    expect(radios[0]).toContain('aria-checked="false"');
    expect(radios[1]).toContain('aria-checked="true"');
    expect(textOf(html)).toBe('Target TE By a date');
  });

  it('one Tab stop: the checked radio is tabbable, the other is not', async () => {
    const radios = (await render('fastest')).match(/<button\b[^>]*>/g) ?? [];
    expect(radios[0]).toContain('tabindex="0"');
    expect(radios[1]).toContain('tabindex="-1"');
  });

  it('44 px tap targets on a phone, a visible focus ring', async () => {
    for (const b of (await render('fastest')).match(/<button\b[^>]*>/g) ?? []) {
      expect(b).toContain('min-h-[44px]');
      expect(b).toContain('focus-visible:ring-2');
    }
  });

  it("marks the side a search is running on (the old tabs' dot), with its words", async () => {
    const html = await render('fastest', 'by-date');
    const dot = html.match(/<span[^>]*title="A search is running here"[^>]*>/g) ?? [];
    expect(dot).toHaveLength(1);
    const parts = html.split('<button');
    expect(parts[1]).not.toContain('A search is running here');
    expect(parts[2]).toContain('A search is running here');
    expect((await render('fastest')).match(/A search is running here/g)).toBeNull();
  });
});
