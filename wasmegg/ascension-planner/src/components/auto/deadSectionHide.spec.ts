/**
 * U2.1 of the code review (22 Nov 2026, dead-lib-5 + dead-ui-4): CollapsibleSection, the section-hide path and the one-line
 * summaries were dead since the simpler page (9 Nov 2026). They stay gone: nothing may bring the Hide button, its
 * injection key or the retired summary words back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = (f: string) => path.resolve(__dirname, f);

describe('the section-hide path is gone', () => {
  it('the files are deleted', () => {
    for (const f of ['CollapsibleSection.vue', 'CollapsibleSection.spec.ts', 'sectionHide.ts', '../../search/sectionSummary.ts', '../../search/sectionSummary.spec.ts'])
      expect(fs.existsSync(here(f)), f).toBe(false);
  });
  it('the instant card has no injected Hide', () => {
    const card = fs.readFileSync(here('InstantRoute.vue'), 'utf8');
    expect(card).not.toContain('SECTION_HIDE');
    expect(card).not.toContain('sectionHide');
    expect(card).not.toContain('data-testid="hide-instant"');
    // the time readout stays, for a card without a more-to slot
    expect(card).toContain('<span v-if="ms !== null && !moreTo" class="ml-auto');
  });
  it('the retired summary words are gone', () => {
    const wid = fs.readFileSync(here('../../search/autoWiden.ts'), 'utf8');
    expect(wid).not.toContain('NO_INSTANT_SUMMARY');
    expect(wid).not.toContain('UNLOADED_INSTANT_SUMMARY');
  });
});
