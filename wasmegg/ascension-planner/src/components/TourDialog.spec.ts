/**
 * spec-firsttour2 (9 Nov 2026): the tour v2's modal. TourDialog.vue is what it shows (the welcome box with three buttons,
 * then the slideshow of pictures); TourModal.vue makes it a real modal on the page (teleported, the app behind inert,
 * focus trapped, Esc = Skip, a backdrop that does nothing, waiting behind every other modal or banner). Replaces v1's
 * FirstTourCard.spec.ts (the card beside a ring: gone with v1's card).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import TourDialog from './TourDialog.vue';
import { TOUR_SLIDES } from '@/lib/tourSlides';
import {
  FIRST_TOUR_ALT,
  FIRST_TOUR_DONE,
  FIRST_TOUR_NEXT,
  FIRST_TOUR_REMIND,
  FIRST_TOUR_SKIP,
  FIRST_TOUR_STEPS,
  FIRST_TOUR_WELCOME,
} from '@/lib/firstTourWords';

const welcome = { phase: 'welcome', remind: true, index: 0, total: 6 } as const;
const slide = (index: number, extra: Record<string, unknown> = {}) => ({ phase: 'slides', remind: true, index, total: 6, slide: TOUR_SLIDES[index], ...extra });
const modal = readFileSync(new URL('./TourModal.vue', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('./TourDialog.vue', import.meta.url), 'utf8');

describe('TourDialog: the welcome box', () => {
  it('a modal dialog named by its heading, described by its sentence', async () => {
    const html = await renderHtml(TourDialog, welcome);
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    expect(html).toMatch(/aria-labelledby="tour-title"/);
    expect(html).toMatch(/aria-describedby="tour-body"/);
    expect(textOf(html)).toContain(`${FIRST_TOUR_WELCOME.title} ${FIRST_TOUR_WELCOME.body}`);
  });

  it('three buttons: Take the tour, Skip, Load my save; Remind me later ticked', async () => {
    const html = await renderHtml(TourDialog, welcome);
    for (const [tid, words] of [
      ['tour-take', FIRST_TOUR_WELCOME.take],
      ['tour-welcome-skip', FIRST_TOUR_WELCOME.skip],
      ['tour-load', FIRST_TOUR_WELCOME.load],
    ])
      expect(html).toMatch(new RegExp(`data-testid="${tid}"[^>]*>\\s*${words}`));
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(textOf(html)).toContain(FIRST_TOUR_REMIND);
  });

  it('no picture is asked for until the tour is taken', async () => {
    const html = await renderHtml(TourDialog, welcome);
    expect(html).not.toMatch(/<img|<picture|<source/);
  });
});

describe('TourDialog: the slideshow', () => {
  it('each slide: one <picture>, the phone set below 640 px, lazy, sized, with its alt text; the caption says it all', async () => {
    for (let i = 0; i < 6; i++) {
      const html = await renderHtml(TourDialog, slide(i));
      const s = TOUR_SLIDES[i];
      expect(html.match(/<picture/g)?.length).toBe(1);
      expect(html).toContain(`<source media="(max-width: 639px)" srcset="${s.phone.src}" width="390" height="440"`);
      expect(html).toMatch(new RegExp(`<img[^>]*src="${s.desk.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      expect(html).toMatch(/<img[^>]*loading="lazy"/);
      expect(html).toMatch(/<img[^>]*decoding="async"/);
      expect(html).toMatch(/<img[^>]*width="720"[^>]*height="406"/);
      expect(html).toContain(`alt="${FIRST_TOUR_ALT[s.id].replace(/'/g, '&#39;')}"`);
      expect(textOf(html)).toContain(`Step ${i + 1} of 6 ${FIRST_TOUR_STEPS[s.id].title}`);
      expect(textOf(html)).toContain(FIRST_TOUR_SKIP);
    }
  });

  it('Next until the last, Done there; Back from slide 2; replay shows the box unticked', async () => {
    expect(textOf(await renderHtml(TourDialog, slide(0)))).not.toMatch(/\bBack\b/);
    expect(textOf(await renderHtml(TourDialog, slide(1)))).toMatch(/\bBack\b/);
    expect(textOf(await renderHtml(TourDialog, slide(4)))).toContain(FIRST_TOUR_NEXT);
    expect(textOf(await renderHtml(TourDialog, slide(5)))).toContain(FIRST_TOUR_DONE);
    expect(await renderHtml(TourDialog, slide(2, { remind: false }))).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });

  it('a save file with no player ID: Step 4 of 4 is the last, its button Done', async () => {
    const t = textOf(await renderHtml(TourDialog, slide(3, { total: 4 })));
    expect(t).toContain('Step 4 of 4');
    expect(t).toContain(FIRST_TOUR_DONE);
    expect(t).not.toContain(FIRST_TOUR_NEXT);
  });

  it('44 px targets and the type scale only', () => {
    const tpl = dialog.slice(0, dialog.indexOf('<script'));
    expect(tpl.match(/min-h-\[44px\]|min-h-\[52px\]/g)!.length).toBeGreaterThanOrEqual(7);
    expect(tpl).not.toMatch(/text-\[\d|uppercase|font-medium|font-semibold|font-mono|text-(xs|sm|base|lg|xl)\b/);
    expect(tpl).toContain('tabular-nums');
  });
});

describe('TourModal: a real modal on the page', () => {
  const tpl = modal.slice(0, modal.indexOf('<script'));
  it('teleported out of #app; the app behind is inert while it shows and not after', () => {
    expect(tpl).toContain('<Teleport to="body">');
    expect(modal).toContain("app.inert = on;");
    expect(modal).toMatch(/watch\(\s*shown,/);
  });

  it('the backdrop does nothing when tapped', () => {
    const at = tpl.indexOf('data-testid="tour-backdrop"');
    const tag = tpl.slice(tpl.lastIndexOf('<div', at), tpl.indexOf('>', at));
    expect(tag).not.toMatch(/@click|@pointer|@mousedown/);
  });

  it('focus trapped: Tab and Shift+Tab wrap inside the box', () => {
    expect(modal).toContain("if (e.key === 'Tab') trapTab(e);");
    expect(modal).toMatch(/function trapTab\(e: KeyboardEvent\): void \{[\s\S]*e\.shiftKey[\s\S]*last\.focus\(\)[\s\S]*first\.focus\(\)/);
  });

  it('Esc = Skip and the arrows go to the controller, only while it shows', () => {
    expect(modal).toContain('tour.key(e.key, wait.value)');
  });

  it('never two modals: another aria-modal dialog (not this one) makes it wait', () => {
    expect(modal).toContain('[aria-modal="true"]:not([data-testid="tour-dialog"])');
  });

  it('after it closes: the ID box, the save-file button, or where focus was', () => {
    expect(modal).toContain("document.getElementById('playerId')");
    expect(modal).toContain('[data-testid="no-account-save-file"] button');
  });
});
