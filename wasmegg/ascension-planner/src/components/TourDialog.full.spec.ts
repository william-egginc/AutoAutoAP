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
  const last = { phase: 'slides', mode: 'first', remind: false, index: 6, total: 7, slide: TOUR_SLIDES[6] };
  it('a button there, not on the cards before it', async () => {
    expect(textOf(await renderHtml(TourDialog, last))).toContain(FULL_TOUR_FROM_FIRST);
    expect(textOf(await renderHtml(TourDialog, { ...last, index: 5, slide: TOUR_SLIDES[5] }))).not.toContain(FULL_TOUR_FROM_FIRST);
    expect(dialog).toContain('data-testid="tour-full"');
    expect(dialog).toMatch(/data-testid="tour-full"[\s\S]{0,80}@click="emit\('full'\)"/);
  });
});

describe('opening the full tour puts focus on slide 1\'s heading (17 Nov 2026, QA in Safari: it stayed on BODY until Next)', () => {
  const modal = readFileSync(new URL('./TourModal.vue', import.meta.url), 'utf8');
  const at = modal.indexOf('tour.state.wantFocus, tour.state.index');
  const watcher = modal.slice(at, modal.indexOf('// After it closes', at));
  it('the full slides come in by a dynamic import, so the heading is not there yet: the focus step waits for them', () => {
    expect(watcher).toContain("tour.state.mode === 'full'");
    expect(watcher).toContain('await loadFullSlides()');
    expect(watcher.indexOf('await loadFullSlides()')).toBeLessThan(watcher.indexOf('focusTitle()'));
  });
  it('and waits for the heading to render after that', () => {
    expect(watcher.indexOf('await loadFullSlides()')).toBeLessThan(watcher.lastIndexOf('await nextTick()'));
  });
  it('the heading is there for the dialog to focus (tabindex -1, a ref)', () => {
    expect(dialog).toMatch(/ref="titleEl"[^>]*tabindex="-1"|tabindex="-1"[^>]*ref="titleEl"/);
  });
});

describe('the dots and Back / Next fit at any width (17 Nov 2026, Jordan: Next spilled over in the full tour at about 1000 px)', () => {
  it('up to 24 slides: the dots', async () => {
    const html = await renderHtml(TourDialog, { ...full(1), total: 22 });
    expect(html).not.toContain('data-testid="tour-progress"');
    expect(html.match(/block h-2 rounded-full/g)).toHaveLength(22);
  });
  it('more than 24 (the full tour has 42): one thin progress bar, not a dot a slide', async () => {
    const html = await renderHtml(TourDialog, { ...full(1), total: 42 });
    expect(html).toContain('data-testid="tour-progress"');
    expect(html).not.toMatch(/block h-2 rounded-full/);
    expect(html).toMatch(/data-testid="tour-progress"[\s\S]{0,300}width:\s*4\.7/);
  });
  it('the row can shrink, and Back / Next never do', () => {
    const tpl = dialog.slice(0, dialog.indexOf('<script'));
    const row = tpl.slice(tpl.indexOf('mt-2 flex min-w-0 items-center justify-between'), tpl.indexOf('data-testid="tour-back"'));
    expect(row).toContain('min-w-0');
    expect(tpl).toMatch(/ml-auto flex shrink-0 gap-2/);
  });
});
