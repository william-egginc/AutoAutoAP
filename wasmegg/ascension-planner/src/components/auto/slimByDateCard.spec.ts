/**
 * The slim By a date result card (UX fluff review 2, 5 Nov 2026, part A items D2 to D12; mock
 * wireframes/fluff2-bydate-v1): one meta line in place of the ran line, the card's "Priced with" and the footer's
 * "Priced from … Priced with …"; the TE per egg table and the "Laying on…" line in one "Next TE" fold; no Simulate note;
 * CSV and Excel under Download ▾; one named Save in the card (Saved answers keeps the list); "Try waiting" with its
 * paragraph behind the button. New wording is DRAFT for Words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ByDateRouteCard from './ByDateRouteCard.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const DEADLINE = 1_815_660_000;
const route = { chain: [218, 247, 278, 311], reachAt: DEADLINE - 3600, ascendAt: DEADLINE - 3600, spare: 3600, legs: [] };
const card = (over: Record<string, unknown> = {}) =>
  renderHtml(ByDateRouteCard, { route, deadline: DEADLINE, zone: 'UTC', simulate: true, canCsv: true, canShare: true, canSave: true, ...over });

describe("By a date's card (ByDateRouteCard.vue)", () => {
  it('one meta line, no ran line or Priced with (D2, D7)', async () => {
    const html = await card({ meta: 'Custom, Nov 3 at 12:24 pm, on your save of Nov 3 at 11:19 am (197 TE) · any hour' });
    expect(html).toContain('data-testid="run-meta"');
    expect(textOf(html)).toContain('on your save of Nov 3 at 11:19 am (197 TE) · any hour');
    const src = read('ByDateRouteCard.vue');
    expect(src).not.toMatch(/data-testid="ran-line"|data-testid="priced-with"/);
  });
  it('no Simulate note; its words are the button\'s tip (D10; a Tip in place of the title, Allan 9 Nov 2026)', async () => {
    const html = await card();
    expect(html).not.toContain('simulate-plan-note');
    expect(html).toMatch(/<button[^>]*aria-describedby="tip-[^"]+"[^>]*data-testid="by-date-simulate"/);
    expect(read('ByDateRouteCard.vue')).toContain(':text="TIP_SIMULATE"');
  });
  it('Share ↓, then CSV and Excel under Download ▾, then one Save with a name (D9, D11)', async () => {
    const t = textOf(await card({ xlsx: true }));
    expect(t).toMatch(/Share ↓ Download ▾ Download CSV \(detail for top routes\) Download for Excel \(\.xlsx\) Save answer/);
    expect(await card()).toMatch(/<input[^>]*aria-label="Name for this answer"/);
    expect((t.match(/Save answer/g) ?? []).length).toBe(1);
  });
  it('the TE per egg table and the Laying on line sit in one Next TE fold (D5, D6)', () => {
    const src = read('ByDateRouteCard.vue');
    expect(src).toMatch(/:aria-expanded="eggsOpen"\s+:aria-controls="eggsId"/);
    expect(src).toContain('Next TE: {{ VIRTUE_EGG_NAMES[nextAfterDeadline.egg] }}, {{ when(nextAfterDeadline.at) }}, after the date');
    expect(src).not.toContain('Laying on after the last stop');
  });
});

describe('under the card (DeadlinePanel.vue, SavedAnswers.vue, WaitBeforePrestige.vue)', () => {
  const panel = read('DeadlinePanel.vue');
  it('no footer repeating the date, save and hours (D12)', () => {
    expect(panel).not.toContain('A route that reaches one more TE');
    expect(panel).not.toMatch(/Priced from \{\{ inPlannerZone\(result\.planStart\) \}\}/);
  });
  it('Saved answers: the list only, no second Save (D11)', () => {
    expect(read('SavedAnswers.vue')).not.toContain("'Save this answer'");
    expect(panel).toMatch(/<ByDateRouteCard[\s\S]*?:meta="resultMeta"/);
  });
  it('Try waiting: the paragraph is behind the button on By a date (D4)', () => {
    expect(panel).toMatch(/<WaitBeforePrestige[^>]*\bcompact\b/);
    expect(read('WaitBeforePrestige.vue')).toContain("compact ? 'Try waiting ›'");
  });
  it('the Took line drops "(Custom, in your own boxes)" (D10d)', () => {
    expect(panel).toContain("summary.line.replace(' (Custom, in your own boxes)', '')");
  });
});
