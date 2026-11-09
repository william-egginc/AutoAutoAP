/**
 * spec-firsttour (8 Nov 2026): the tour's card (FirstTourCard.vue) and its wiring (FirstTour.vue). A NON-MODAL dialog
 * named by its title: the page under it stays usable (every step asks the player to use it), nothing is made inert.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import FirstTourCard from './FirstTourCard.vue';
import { FIRST_TOUR_BACK, FIRST_TOUR_DONE, FIRST_TOUR_NEXT, FIRST_TOUR_REMIND, FIRST_TOUR_SKIP } from '@/lib/firstTourWords';

const base = { label: 'Step 2 of 6', title: 'Pick a goal', body: 'Body words here.', first: false, last: false, remind: true };
const tour = readFileSync(new URL('./FirstTour.vue', import.meta.url), 'utf8');
const card = readFileSync(new URL('./FirstTourCard.vue', import.meta.url), 'utf8');

describe('FirstTourCard', () => {
  it('is a non-modal dialog named by its title and described by its body', async () => {
    const html = await renderHtml(FirstTourCard, base);
    expect(html).toMatch(/role="dialog"/);
    expect(html).not.toMatch(/aria-modal/);
    expect(html).toMatch(/aria-labelledby="first-tour-title"/);
    expect(html).toMatch(/aria-describedby="first-tour-body"/);
    expect(html).toMatch(/<h2[^>]*id="first-tour-title"[^>]*tabindex="-1"|<h2[^>]*tabindex="-1"[^>]*id="first-tour-title"/);
    expect(textOf(html)).toContain('Step 2 of 6 Pick a goal Body words here.');
  });

  it('Remind me later is ticked when asked (a first run) and unticked on a replay', async () => {
    expect(await renderHtml(FirstTourCard, base)).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(await renderHtml(FirstTourCard, { ...base, remind: false })).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(textOf(await renderHtml(FirstTourCard, base))).toContain(FIRST_TOUR_REMIND);
  });

  it('Back from step 2 on, Next, Done on the last, Skip tour on every step', async () => {
    const first = textOf(await renderHtml(FirstTourCard, { ...base, first: true }));
    expect(first).not.toContain(FIRST_TOUR_BACK);
    expect(first).toContain(FIRST_TOUR_NEXT);
    expect(first).toContain(FIRST_TOUR_SKIP);
    const last = textOf(await renderHtml(FirstTourCard, { ...base, last: true, closing: 'Closing.' }));
    expect(last).toContain(FIRST_TOUR_BACK);
    expect(last).toContain(FIRST_TOUR_DONE);
    expect(last).not.toContain(FIRST_TOUR_NEXT);
    expect(last).toContain('Closing.');
  });

  it('44 px targets and the type scale only', () => {
    const tpl = card.slice(0, card.indexOf('<script'));
    expect(tpl.match(/<button/g)?.length).toBe(3);
    expect(tpl.match(/min-h-\[44px\]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(tpl).not.toMatch(/text-\[\d|uppercase|font-medium|font-semibold|font-mono|text-(xs|sm|base|lg|xl)\b/);
    expect(tpl).toContain('tabular-nums');
  });
});

describe('FirstTour.vue wiring', () => {
  const tpl = tour.slice(0, tour.indexOf('<script'));
  it('the ring is aria-hidden and never takes a pointer; nothing on the page is made inert or hidden', () => {
    expect(tpl).toMatch(/data-testid="first-tour-ring"[\s\S]{0,200}aria-hidden="true"|aria-hidden="true"[\s\S]{0,200}data-testid="first-tour-ring"/);
    expect(tpl).toContain('pointer-events-none');
    expect(tour).not.toMatch(/:inert|\sinert[=\s>]|\.inert\b|setAttribute\(\s*['"](inert|aria-hidden)/);
  });

  it('announces each step in a polite live region and bridges Tab to the target', () => {
    expect(tpl).toMatch(/role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/);
    expect(tpl).toContain('data-testid="first-tour-bridge"');
  });

  it('Esc goes to the controller (Esc = Skip), only while the card shows', () => {
    expect(tour).toContain("tour.key(e.key, wait.value)");
  });
});
