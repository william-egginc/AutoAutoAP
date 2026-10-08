import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { pinSliders, sweepSliderView, useDateRowSliders } from './useRowSliders';
import { DEFAULT_STEP_IX, DEFAULT_WIDTH_IX, SPACE_STEPS, SPACE_WIDTHS } from '@/search/deadlineSuggest';

type Row = { keptText?: string; asc: number; text: string; auto?: boolean; widthIx?: number; stepIx?: number; pm?: number; simple?: boolean };

function setup(rows: Row[]) {
  const r = ref<Row[]>(rows);
  const widthIx = ref(DEFAULT_WIDTH_IX);
  const stepIx = ref(DEFAULT_STEP_IX);
  const linked = ref(false);
  const refilled: number[] = [];
  const s = useDateRowSliders({
    rows: r,
    widthIx,
    stepIx,
    linked,
    refill: k => refilled.push(k),
    suggestedText: () => 'suggested',
  });
  return { r, widthIx, stepIx, linked, refilled, s };
}

describe('By a date row sliders', () => {
  it('moves only the chain moved, and refills only a box Suggest filled', () => {
    const t = setup([
      { asc: 4, text: 'a', auto: true },
      { asc: 3, text: 'b', auto: true },
    ]);
    t.s.setSlider(1, 'widthIx', 0);
    expect(t.r.value[1].widthIx).toBe(0);
    expect(t.r.value[0].widthIx).toBeUndefined();
    expect(t.widthIx.value).toBe(DEFAULT_WIDTH_IX);
    expect(t.refilled).toEqual([1]);
    expect(t.s.views.value.map(v => v.halfWidth)).toEqual([SPACE_WIDTHS[DEFAULT_WIDTH_IX], SPACE_WIDTHS[0]]);
  });

  it('notes a typed box a slider move kept, until it is edited or matches the sliders', () => {
    const t = setup([{ asc: 4, text: '141-176:1; 188-208:2', auto: false }]);
    expect(t.s.keptNotes.value).toEqual([false]);
    t.s.setSlider(0, 'widthIx', 1);
    expect(t.refilled).toEqual([]);
    expect(t.r.value[0].text).toBe('141-176:1; 188-208:2');
    expect(t.s.keptNotes.value).toEqual([true]);
    // Edited again: gone.
    t.r.value[0].text = '142-176:1; 188-208:2';
    expect(t.s.keptNotes.value).toEqual([false]);
    // Moved again: back, then Use the sliders' box (the row becomes auto) clears it.
    t.s.setSlider(0, 'stepIx', 0);
    expect(t.s.keptNotes.value).toEqual([true]);
    t.r.value[0].auto = true;
    t.r.value[0].text = 'suggested';
    expect(t.s.keptNotes.value).toEqual([false]);
    // A box that matches the sliders' own suggestion needs no note.
    const m = setup([{ asc: 4, text: 'suggested', auto: false }]);
    m.s.setSlider(0, 'widthIx', 1);
    expect(m.s.keptNotes.value).toEqual([false]);
  });

  it('moves every chain, and the fallback, when linked', () => {
    const t = setup([
      { asc: 4, text: 'a', auto: true },
      { asc: 3, text: 'typed', auto: false },
    ]);
    t.linked.value = true;
    t.s.setSlider(0, 'stepIx', 4);
    expect(t.r.value.map(r => r.stepIx)).toEqual([4, 4]);
    expect(t.stepIx.value).toBe(4);
    expect(t.refilled).toEqual([0]);
    expect(t.s.stepOf(t.r.value[1])).toBe(SPACE_STEPS[4]);
  });

  it("shows a Science card's own ± at the slider's start, until the width slider moves", () => {
    const t = setup([{ asc: 4, text: 'a', pm: 2, widthIx: 0, stepIx: 0 }]);
    expect(t.s.views.value[0]).toEqual({ widthIx: 0, stepIx: 0, halfWidth: 2, step: 1, fromCard: true, fromSimple: false });
    t.s.setSlider(0, 'widthIx', 2);
    expect(t.s.views.value[0]).toMatchObject({ widthIx: 2, halfWidth: SPACE_WIDTHS[2], fromCard: false });
  });

  it("labels a row Simple built as from Simple, with its own width, until the width slider moves", () => {
    const t = setup([{ asc: 4, text: 'a', pm: 2, simple: true, widthIx: 0, stepIx: 0 }]);
    expect(t.s.views.value[0]).toMatchObject({ halfWidth: 2, step: 1, fromCard: false, fromSimple: true });
    t.s.setSlider(0, 'widthIx', 2);
    expect(t.s.views.value[0]).toMatchObject({ halfWidth: SPACE_WIDTHS[2], fromCard: false, fromSimple: false });
  });
});

describe('Full sweep sliders', () => {
  it('shows where the budget-sized suggestion landed until moved, then the pinned positions', () => {
    const v = sweepSliderView({ kind: 'instant', halfWidth: 7, step: 3 }, { widthIx: null, stepIx: null });
    expect(v).toEqual({ widthIx: SPACE_WIDTHS.indexOf(8), stepIx: SPACE_STEPS.indexOf(3), halfWidth: 7, step: 3 });
    const pinned = sweepSliderView({ kind: 'measured' }, { widthIx: 1, stepIx: 0 });
    expect(pinned).toEqual({ widthIx: 1, stepIx: 0, halfWidth: SPACE_WIDTHS[1], step: SPACE_STEPS[0] });
  });

  it('pins both sliders when either moves', () => {
    const v = sweepSliderView(null, { widthIx: null, stepIx: null });
    expect(pinSliders(v, 'widthIx', 5)).toEqual({ widthIx: 5, stepIx: v.stepIx });
    expect(pinSliders(v, 'stepIx', 0)).toEqual({ widthIx: v.widthIx, stepIx: 0 });
  });
});
