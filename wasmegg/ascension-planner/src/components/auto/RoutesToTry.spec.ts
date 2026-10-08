import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import RoutesToTry from './RoutesToTry.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const view = { widthIx: 3, stepIx: 1, halfWidth: 10, step: 2 };
const byDate = {
  rows: [
    { asc: 4, text: '306-317:1; 352-372:2; 360-380:2' },
    { asc: 3, text: '306-317:1; 360-380:2' },
  ],
  sliders: [view, { ...view, halfWidth: 2, widthIx: 0, fromCard: true }],
  problems: ['', 'These bands make 2 ascensions, not 3.'],
  summaries: ['1,116 playable sets of early stops', '132 sets of early stops'],
  disabled: false,
  currentTE: 305,
  finalTE: 490,
  maxAsc: 8,
  minRows: 1,
  placeholder: '138-142:1; 160-200:10; 200-240:10',
  sliderLead: 'Suggest a space tries',
  linkable: true,
};

describe('RoutesToTry', () => {
  it("draws By a date's rows: number, Ascensions, Suggest a space, Remove, box, problem or summary, sliders, link", async () => {
    const html = await renderHtml(RoutesToTry, byDate);
    const t = textOf(html);
    expect(t).toMatch(
      /Chain 1 Ascensions Suggest a space Remove 1,116 playable sets of early stops Suggest a space tries ±10 TE around each stop every 2 TE \(the first stop: every TE\) move every chain's sliders together/
    );
    expect(t).toContain('Chain 2');
    // A row's problem shows in place of its summary, in red.
    expect(t).toContain('These bands make 2 ascensions, not 3.');
    expect(t).not.toContain('132 sets of early stops');
    expect(html).toContain('text-rose-600');
    // A Science card's own width.
    expect(t).toContain('±2 TE around each stop (from a Science card)');
    expect(html).toContain('max="8"');
    expect(html).toContain('value="306-317:1; 352-372:2; 360-380:2"');
    expect(t).toContain('+ Add another chain');
  });

  it('keeps the last row (By a date) or lets every row go (Full sweep)', async () => {
    const one = { ...byDate, rows: [byDate.rows[0]], sliders: [view], problems: [''], summaries: ['x'] };
    expect(textOf(await renderHtml(RoutesToTry, one))).not.toContain('Remove');
    expect(textOf(await renderHtml(RoutesToTry, { ...one, minRows: 0 }))).toContain('Remove');
  });

  it('offers the link only where the screen does, and only with two or more chains', async () => {
    expect(textOf(await renderHtml(RoutesToTry, { ...byDate, linkable: false }))).not.toContain('move every chain');
    const one = { ...byDate, rows: [byDate.rows[0]], sliders: [view], problems: [''], summaries: ['x'] };
    expect(textOf(await renderHtml(RoutesToTry, one))).not.toContain('move every chain');
  });

  it("draws the Full sweep's added chains from Chain 2, no lead words, and its own notes and footer", async () => {
    const html = await renderHtml(
      RoutesToTry,
      {
        rows: [
          { asc: 5, text: '200-210:5; 230-240:5; 260-280:10; 300-340:20' },
          { asc: 1, text: '' },
        ],
        sliders: [view, view],
        problems: ['', ''],
        summaries: ['36 chains · 3 x 3 x 3 x 3 values', 'Straight to 490: one route.'],
        disabled: true,
        currentTE: 190,
        finalTE: 490,
        maxAsc: 12,
        firstNumber: 2,
        placeholder: '185-200:5; 210-240:10',
        checkAscensions: true,
      },
      {
        'row-after': ({ k }: { k: number }) => (k === 0 ? h('span', 'Suggest would fill in 40 chains') : null),
        footer: () => h('span', 'One click runs all 3 chains'),
      }
    );
    const t = textOf(html);
    expect(t).toMatch(/^Chain 2 .*Chain 3 /);
    expect(t).not.toContain('Suggest a space tries');
    expect(t).toMatch(/every 2 TE \(the first stop: every TE\) Suggest would fill in 40 chains Chain 3/);
    // One ascension: no box and no sliders, just its summary.
    expect(t).toMatch(/Chain 3 Ascensions Suggest a space Remove Straight to 490: one route\. \+ Add another chain/);
    expect(t).toContain('One click runs all 3 chains');
    expect(html).toContain('max="12"');
    // Greyed out while a run is going.
    expect((html.match(/\sdisabled(\s|>|=")/g) ?? []).length).toBeGreaterThan(5);
  });
});
