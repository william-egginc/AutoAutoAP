/**
 * The page's error line (the shots, 22 Oct 2026): "Couldn't load your save…" with Try again sat about 1,250 px
 * down on a phone, below the three big cards. It now sits right under the player ID box, outside the folding
 * header, and is scrolled into view when it appears (smoothly unless reduced motion is asked for).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const template = app.slice(0, app.indexOf('<script setup'));

describe('page error placement', () => {
  it('comes straight after the player ID box, before the tabs and every card', () => {
    const form = template.indexOf('<the-player-id-form');
    const err = template.indexOf('data-testid="page-error"');
    expect(form).toBeGreaterThan(0);
    expect(err).toBeGreaterThan(form);
    for (const later of ['<SiteTabs', 'data-testid="header-toggle"', 'Loading player data...', 'Action History'])
      expect(template.indexOf(later), later).toBeGreaterThan(err);
    // Outside the header's folding grid: shown even with the header collapsed.
    const between = template.slice(form, err);
    expect(between.match(/<\/div>/g)?.length).toBe(3);
    expect(template.match(/data-testid="page-error"/g)).toHaveLength(1);
    expect(template).toContain('data-testid="page-error-retry"');
  });

  it('is scrolled into view when it appears, respecting reduced motion', () => {
    expect(template).toContain('ref="pageErrorEl"');
    const w = app.slice(app.indexOf('watch(error, async e => {'));
    const body = w.slice(0, w.indexOf('\n});'));
    expect(body).toContain('await nextTick();');
    expect(body).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(body).toContain("scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })");
  });
});
