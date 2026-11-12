/** M13 follow-up (12 Nov 2026): a saved date answer can go late once the save moves past its plan start; the tile says how
 *  late ("5d 20h after the date"), not its size as "spare" (lib/nowWords.ts `spareSide`, the same as the goal row). */
import { describe, expect, it } from 'vitest';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import SavedTile from './SavedTile.vue';
import { spareSide } from '@/lib/nowWords';

const NOW = Date.UTC(2026, 10, 12, 20) / 1000;
const tile = (spareHours: number | null) =>
  ({
    goal: 'date',
    answer: { chain: [222, 243, 313], end: NOW + 3600 * 24 * 200, endTE: 313, spareHours, calculatedAt: NOW * 1000, saveSeconds: NOW },
    olderSave: false,
    sure: null,
  }) as never;
const render = (spareHours: number | null) =>
  renderHtml(SavedTile, { tile: tile(spareHours), goal: 'date', title: 'Egg Day 2027', target: 490, now: NOW, zone: 'America/Denver', standing: '', standingLabel: '' });

describe('the saved date tile\'s spare', () => {
  it('helper: the side and the size', () => {
    expect(spareSide(65)).toEqual({ late: false, size: '2d 17h' });
    expect(spareSide(-140)).toEqual({ late: true, size: '5d 20h' });
  });
  it('late: "after the date", never "spare"', async () => {
    const t = textOf(await render(-140));
    expect(t).toContain('5d 20h after the date');
    expect(t).not.toMatch(/spare/);
  });
  it('in time: as before', async () => {
    expect(textOf(await render(65))).toContain('2d 17h spare');
  });
});
