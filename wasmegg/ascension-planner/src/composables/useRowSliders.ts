/**
 * Suggest a space's two sliders, per chain row (RoutesToTry.vue / SpaceSliders.vue): where each row's
 * sliders sit and what moving one does. The drawing is one component; the rules differ for a real
 * reason, so there are two sets here:
 *
 *  - By a date (`useDateRowSliders`): every chain has fixed default positions (±10, every 2 TE), a
 *    Science card may give a row its own ± (`pm`), and chains are independent unless "move every
 *    chain's sliders together" is ticked (batch 1's rules, search/deadlineSuggest.ts `moveSlider`).
 *    A moved row whose box Suggest a space filled is filled again.
 *  - The Full sweep (`sweepSliderView`, `pinSliders`): unmoved sliders mean "size the space to the
 *    chain budget" and show where that suggestion landed; moving either pins both. There is no link
 *    option there.
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import {
  moveSlider,
  nearestIx,
  NOMINAL_STEP_IX,
  NOMINAL_WIDTH_IX,
  SPACE_STEPS,
  SPACE_WIDTHS,
  type SliderRow,
  type SpaceSliderPos,
} from '@/search/deadlineSuggest';

/** Where one row's two sliders sit and what they say. */
export interface RowSliderView {
  widthIx: number;
  stepIx: number;
  /** The ± the width slider stands for (or a Science card's own). */
  halfWidth: number;
  step: number;
  /** The ± came from a Science card's request, not the slider. */
  fromCard?: boolean;
  /** The ± is the width Simple's boxes were built with (Open in Advanced). */
  fromSimple?: boolean;
}

export interface DateRowSliders<R> {
  rowWidthIx: (row: R) => number;
  rowStepIx: (row: R) => number;
  /** The ± a row's Suggest a space uses. */
  widthOf: (row: R) => number;
  /** The step between the TEs it tries after the first stop. */
  stepOf: (row: R) => number;
  views: ComputedRef<RowSliderView[]>;
  /** Move one row's slider, or every row's when linked, and re-fill the boxes Suggest filled. */
  setSlider: (k: number, key: 'widthIx' | 'stepIx', value: number) => void;
}

export function useDateRowSliders<R extends SliderRow & { auto?: boolean }>(opts: {
  rows: Ref<R[]>;
  /** What a row with no setting of its own reads (the last linked move). */
  widthIx: Ref<number>;
  stepIx: Ref<number>;
  linked: Ref<boolean>;
  /** Fill row `k`'s box again (Suggest a space), for a row whose box Suggest filled. */
  refill: (k: number) => void;
}): DateRowSliders<R> {
  const rowWidthIx = (row: R) => row.widthIx ?? opts.widthIx.value;
  const rowStepIx = (row: R) => row.stepIx ?? opts.stepIx.value;
  const widthOf = (row: R) => row.pm ?? SPACE_WIDTHS[rowWidthIx(row)] ?? SPACE_WIDTHS[3];
  const stepOf = (row: R) => SPACE_STEPS[rowStepIx(row)] ?? SPACE_STEPS[1];
  // A Science card's own ± shows the width slider at its narrowest, with "(from a Science card)".
  const views = computed(() =>
    opts.rows.value.map(row => ({
      widthIx: row.pm ? 0 : rowWidthIx(row),
      stepIx: rowStepIx(row),
      halfWidth: widthOf(row),
      step: stepOf(row),
      fromCard: !!row.pm && !row.simple,
      fromSimple: !!row.pm && !!row.simple,
    }))
  );
  function setSlider(k: number, key: 'widthIx' | 'stepIx', value: number): void {
    const linked = opts.linked.value;
    // The shared fallback (what a chain with no setting of its own reads) moves only when linked.
    if (linked) {
      if (key === 'widthIx') opts.widthIx.value = value;
      else opts.stepIx.value = value;
    }
    for (const i of moveSlider(opts.rows.value, k, key, value, linked)) if (opts.rows.value[i].auto) opts.refill(i);
  }
  return { rowWidthIx, rowStepIx, widthOf, stepOf, views, setSlider };
}

/**
 * The Full sweep: where a chain's sliders sit and what they say. The pinned positions once moved,
 * else where the default suggestion landed (nearest stop on each slider, its own ± and step in the
 * words); with no slider-sized suggestion, the nominal ±5 every 2 TE.
 */
export function sweepSliderView(
  sug: { kind: string; halfWidth?: number; step?: number } | null,
  sl: SpaceSliderPos
): RowSliderView {
  const auto = sug?.kind === 'instant' ? (sug as { halfWidth: number; step: number }) : null;
  const widthIx = sl.widthIx ?? (auto ? nearestIx(SPACE_WIDTHS, auto.halfWidth) : NOMINAL_WIDTH_IX);
  const stepIx = sl.stepIx ?? (auto ? nearestIx(SPACE_STEPS, auto.step) : NOMINAL_STEP_IX);
  return {
    widthIx,
    stepIx,
    halfWidth: auto ? auto.halfWidth : SPACE_WIDTHS[widthIx],
    step: auto ? auto.step : SPACE_STEPS[stepIx],
  };
}

/** The Full sweep's rule: moving either slider pins both, the other where it was showing. */
export function pinSliders(view: RowSliderView, key: 'widthIx' | 'stepIx', value: number): SpaceSliderPos {
  return {
    widthIx: key === 'widthIx' ? value : view.widthIx,
    stepIx: key === 'stepIx' ? value : view.stepIx,
  };
}
