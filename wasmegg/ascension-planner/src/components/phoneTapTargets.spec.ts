/**
 * Tap targets on a phone (Jordan's 390 px pass, 23 Oct 2026): below sm every link, button, select and summary row
 * named here is at least 44 px tall; from sm up each one is as it was (`sm:min-h-0`, `sm:pt-0`). Source wiring, by
 * test id or by the words the element holds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './auto/resultCardStyle';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const TAP = 'inline-flex items-center min-h-[44px] sm:min-h-0';
const SUMMARY = 'min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0';

/** The opening tag holding `marker` (an attribute in it). */
function tagWith(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const open = src.lastIndexOf('<', at);
  return src.slice(open, src.indexOf('>', at) + 1);
}
describe('the instant card on a phone', () => {
  const src = read('auto/InstantRoute.vue');
  it('Simulate this plan (both boxes and the counts rows) is 44 px tall', () => {
    const tags = [...src.matchAll(/<button[^>]*>\s*Simulate this plan\s*<\/button>/g)].map(m => m[0]);
    expect(tags).toHaveLength(4);
    for (const t of tags) expect(t).toContain(TAP);
  });
  it('Follow this route: the boxes use the 44 px primary button, the counts rows get 44 px too', () => {
    expect(src.match(/<FollowButton primary|<FollowButton v-if="boxFollowable" primary/g)).toHaveLength(2);
    expect(src.match(/<FollowButton v-if="(?:rowFollowable\(r\)|r\.chain\.length)" class="min-h-\[44px\] sm:min-h-0"/g)).toHaveLength(2);
    expect(read('FollowButton.vue')).toContain("primary ? 'min-h-[44px] sm:min-h-0");
  });
  it('the pointer link (See it ↓) and Show more ascension counts', () => {
    expect(tagWith(read('auto/InstantPointer.vue'), 'data-testid="instant-pointer-link"')).toContain(TAP);
    expect(tagWith(src, 'data-testid="instant-more-counts"')).toContain(TAP);
  });
  it('How this is worked out and What if you had maxed gear? summary rows', () => {
    expect(tagWith(src, 'data-testid="instant-how-summary"')).toContain(SUMMARY);
    expect(tagWith(read('auto/MaxedWhatIf.vue'), 'data-testid="instant-maxed-what-if-summary"')).toContain(SUMMARY);
  });
  it('the ascensions From … to … boxes and "Include N"', () => {
    expect(tagWith(src, 'data-testid="instant-min-ascensions"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(src, 'data-testid="instant-max-ascensions"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(src, 'data-testid="instant-range-widen"')).toContain('min-h-[44px] sm:min-h-0');
  });
  it('Hide: a 44 px invisible area round the pill on a phone only, the pill itself unmoved', () => {
    const t = tagWith(read('auto/CollapsibleSection.vue'), ':data-testid="`hide-${id}`"');
    expect(t).toContain('absolute -top-2.5 right-4');
    expect(t).toContain("before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] sm:before:hidden");
  });
});

describe('the Stronger check and the run controls on a phone', () => {
  it("the result cards' buttons (Build or Simulate this plan, Share, CSV, Save)", () => {
    for (const c of [PRIMARY_BUTTON, SECONDARY_BUTTON]) expect(c).toContain('inline-flex items-center justify-center min-h-[44px] sm:min-h-0');
  });
  it('the acknowledge link and the auto-send-every select', () => {
    expect(tagWith(read('auto/FindBar.vue'), 'data-testid="acknowledge-hint-link"')).toContain(TAP);
    expect(tagWith(read('auto/StepAwayOptions.vue'), 'data-testid="auto-send-every"')).toContain('min-h-[44px] sm:min-h-0');
  });
});

describe('Right now with no plan', () => {
  it('Work it out › (both lines) is 44 px tall', () => {
    const src = read('myruns/RightNowCard.vue');
    const tags = [...src.matchAll(/<button[^>]*data-testid="now-work-it-out"[^>]*>/g)].map(m => m[0]);
    expect(tags).toHaveLength(2);
    for (const t of tags) expect(t).toContain(TAP);
  });
});
