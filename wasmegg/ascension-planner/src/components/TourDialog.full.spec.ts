/**
 * The full tour in the tour's dialog (spec-fulltour, 14 Nov 2026): the same box, its own words and pictures, no Remind me
 * later, and "More: Full tour" on the first tour's last card only.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import TourDialog from './TourDialog.vue';
import { TOUR_SLIDES } from '@/lib/tourSlides';
import { FULL_TOUR_SLIDES } from '@/lib/fullTourSlides';
import { FULL_TOUR_ALT, FULL_TOUR_CLOSING, FULL_TOUR_FROM_FIRST, FULL_TOUR_STEPS_WORDS } from '@/lib/fullTourWords';
import { FIRST_TOUR_REMIND, FIRST_TOUR_SKIP } from '@/lib/firstTourWords';

const N = FULL_TOUR_SLIDES.length;
const full = (index: number) => ({
  phase: 'slides',
  mode: 'full',
  remind: false,
  index,
  total: N,
  slide: FULL_TOUR_SLIDES[index],
  words: { title: FULL_TOUR_STEPS_WORDS[FULL_TOUR_SLIDES[index].id].title, body: FULL_TOUR_STEPS_WORDS[FULL_TOUR_SLIDES[index].id].body, alt: FULL_TOUR_ALT[FULL_TOUR_SLIDES[index].id] },
});
const dialog = readFileSync(new URL('./TourDialog.vue', import.meta.url), 'utf8');

describe('TourDialog in full mode', () => {
  it('its own title, body and alt text; the step line counts the full list', async () => {
    const html = await renderHtml(TourDialog, full(2));
    const t = textOf(html);
    expect(t).toContain(FULL_TOUR_STEPS_WORDS.tabChain.title);
    expect(t).toContain(FULL_TOUR_STEPS_WORDS.tabChain.body);
    expect(t).toContain(`Step 3 of ${N}`);
    expect(html).toContain(`alt="${FULL_TOUR_ALT.tabChain.replace(/'/g, '&#39;')}"`);
  });
  it('no Remind me later; Skip tour stays', async () => {
    const t = textOf(await renderHtml(TourDialog, full(0)));
    expect(t).not.toContain(FIRST_TOUR_REMIND);
    expect(t).toContain(FIRST_TOUR_SKIP);
  });
  it('the last card says Done and the closing line, and no "More: Full tour" (it is the full tour)', async () => {
    const t = textOf(await renderHtml(TourDialog, full(N - 1)));
    expect(t).toContain(FULL_TOUR_CLOSING);
    expect(t).not.toContain(FULL_TOUR_FROM_FIRST);
  });
});

describe('the first tour\'s last card: More: Full tour', () => {
  const last = { phase: 'slides', mode: 'first', remind: false, index: 11, total: 12, slide: TOUR_SLIDES[11] };
  it('a button there, not on the cards before it', async () => {
    expect(textOf(await renderHtml(TourDialog, last))).toContain(FULL_TOUR_FROM_FIRST);
    expect(textOf(await renderHtml(TourDialog, { ...last, index: 10, slide: TOUR_SLIDES[10] }))).not.toContain(FULL_TOUR_FROM_FIRST);
    expect(dialog).toContain('data-testid="tour-full"');
    expect(dialog).toMatch(/data-testid="tour-full"[\s\S]{0,80}@click="emit\('full'\)"/);
  });
});
