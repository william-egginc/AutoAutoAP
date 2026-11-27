/**
 * 17 Nov 2026 (QA, real Safari at 1280x573): the tour card was taller than the window; Next's bottom was cut off and Skip tour lay below the
 * fold. The card is never taller than the window (100dvh less the modal's padding: 1rem on a phone, 3rem from sm); the picture and the
 * words scroll inside it, and the step's Back / Next and the Skip row stay pinned under them. Measured in a built page (1280x573 and 390x667).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, 'TourDialog.vue'), 'utf8');
const tpl = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
const at = (s: string) => tpl.indexOf(s);
/** The slides' words (the welcome box has an element of the same id before them). */
const body = tpl.lastIndexOf('id="tour-body"');

describe('the tour card fits a short window', () => {
  it('the slides card is a column no taller than the window (modal padding 1rem on a phone, 3rem from sm)', () => {
    expect(tpl).toContain('flex max-h-[calc(100dvh-1rem)]');
    expect(tpl).toContain('sm:max-h-[calc(100dvh-3rem)]');
    expect(tpl).toContain('flex-col');
  });
  it('the picture and the words are in one scroll area that may shrink (min-h-0 flex-1 overflow-y-auto)', () => {
    const scroll = at('data-testid="tour-scroll"');
    expect(scroll).toBeGreaterThan(0);
    expect(tpl.slice(tpl.lastIndexOf('<div', scroll), scroll)).toMatch(/min-h-0 flex-1 overflow-y-auto/);
    expect(scroll).toBeLessThan(at('data-testid="tour-picture"'));
    expect(at('data-testid="tour-picture"')).toBeLessThan(body);
  });
  it('the picture shrinks to the height that is left (its shape kept, so the ring stays on its target), never under 16rem wide, and a new slide scrolls to the top', () => {
    expect(src).toMatch(/\.tour-pic \{\s*max-width: max\(16rem, calc\(\(100dvh - 21rem\) \* var\(--r-p\)\)\);/);
    expect(src).toMatch(/min-width: 640px\) \{\s*\.tour-pic \{\s*max-width: max\(16rem, calc\(\(100dvh - 21rem\) \* var\(--r-d\)\)\);/);
    expect(tpl).toContain("'--r-d': slide.desk.width / slide.desk.height");
    expect(src).toContain('scrollEl.value.scrollTop = 0');
  });
  it('Back / Next, the Remind me later row and Skip are outside it, in a footer that does not shrink', () => {
    const footer = at('data-testid="tour-footer"');
    expect(footer).toBeGreaterThan(body);
    expect(tpl.slice(tpl.lastIndexOf('<div', footer), footer)).toContain('shrink-0');
    for (const id of ['tour-back', 'tour-next', 'tour-skip', 'tour-progress']) expect(at(`data-testid="${id}"`)).toBeGreaterThan(footer);
  });
  it('the tags balance', () => {
    expect((tpl.match(/<div\b/g) ?? []).length).toBe((tpl.match(/<\/div>/g) ?? []).length);
  });
});
