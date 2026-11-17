/**
 * A short crossfade between tour slides (Jordan, 16 Nov 2026: "yes, short, off under prefers-reduced-motion"): the new
 * picture fades in over the one before, so a ring and arrow that move from one tab to the next read as moving. Off for a
 * reader who asked for less motion, off for the first slide, and never longer than a quarter of a second.
 * The pure choice is lib/tourFade.ts; the drawing is TourDialog.vue (pinned below, there is no DOM in these specs).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FADE_MS, shouldFade } from './tourFade';

const dialog = readFileSync(new URL('../components/TourDialog.vue', import.meta.url), 'utf8');
const overlay = readFileSync(new URL('../components/TourOverlay.vue', import.meta.url), 'utf8');

describe('the slide crossfade', () => {
  it('fades from a slide to a different one', () => {
    expect(shouldFade('tabManual', 'tabAuto', false)).toBe(true);
  });
  it('not for the first slide, not for the same slide again, not under prefers-reduced-motion', () => {
    expect(shouldFade(null, 'tabManual', false)).toBe(false);
    expect(shouldFade('tabAuto', 'tabAuto', false)).toBe(false);
    expect(shouldFade('tabManual', 'tabAuto', true)).toBe(false);
  });
  it('short: no more than 250 ms', () => {
    expect(FADE_MS).toBeGreaterThan(0);
    expect(FADE_MS).toBeLessThanOrEqual(250);
  });
  it('the dialog: the one before sits under the new picture, hidden from a screen reader, and the animation is off under reduced motion', () => {
    expect(dialog).toContain('shouldFade(');
    expect(dialog).toContain('data-testid="tour-picture-prev"');
    expect(dialog).toMatch(/data-testid="tour-picture-prev"[\s\S]{0,400}aria-hidden="true"|aria-hidden="true"[\s\S]{0,400}data-testid="tour-picture-prev"/);
    expect(dialog).toContain('@media (prefers-reduced-motion: reduce)');
    expect(dialog).toContain('tour-fade-in');
    expect(dialog).toContain('FADE_MS');
  });
  it('still exactly one live picture a slide (the one before is a copy for the fade, with empty alt text)', () => {
    expect(dialog).toMatch(/alt=""/);
  });
  it('Jordan, 16 Nov (~10:40 PM): NO fade between slides that share one page picture; the picture is keyed by its own files, so only a new picture fades', () => {
    // The pure rule is given the picture's identity (desk + phone files), not the slide's: two slides on one picture are "the same".
    expect(dialog).toMatch(/shouldFade\(\s*before\.desk\.src \+ before\.phone\.src/);
    expect(dialog).toMatch(/<picture :key="slide\.desk\.src \+ slide\.phone\.src"/);
    expect(shouldFade('a.webp b.webp', 'a.webp b.webp', false)).toBe(false);
    expect(shouldFade('a.webp b.webp', 'c.webp d.webp', false)).toBe(true);
  });
  it('the overlay SLIDES: its parts stay mounted and move by a CSS transition (left, top, size, turn, fade), none under prefers-reduced-motion', () => {
    for (const p of ['left 320ms', 'top 320ms', 'width 320ms', 'height 320ms', 'transform 320ms', 'opacity 200ms']) expect(overlay).toContain(p);
    expect(overlay).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tov-move \{\s*transition: none;/);
    // One ring, one arrow, one copy and one tab ring element, never v-for'd or v-if'd away, so they move instead of popping.
    expect(overlay.match(/data-testid="tour-ring"/g)).toHaveLength(1);
    expect(overlay.match(/data-testid="tour-arrow"/g)).toHaveLength(1);
    expect(overlay).not.toMatch(/v-for/);
  });
  it('the dialog draws the overlay for desk (from 640 px) and phone (below) from the slide, keyed by the picture so a new picture starts fresh', () => {
    expect(dialog).toMatch(/<TourOverlay class="hidden sm:block" :overlay="slide\.overlay\.desk"/);
    expect(dialog).toMatch(/<TourOverlay class="sm:hidden" :overlay="slide\.overlay\.phone"/);
    expect(dialog).toMatch(/v-if="slide\.overlay" :key=/);
  });
});
