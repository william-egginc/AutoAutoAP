/**
 * The heat map's frame (RunHeatMap.vue), sized from the width the picture is drawn at.
 *
 * The viewBox is as wide as the picture on screen, so one unit is one CSS pixel and the labels are LABEL_PX on
 * any screen. It was a fixed 600-unit box scaled to the card: 10-unit labels came out at about 6 px on a phone
 * and 15 px on a desktop (type review, 26 Oct 2026). The margins come from the label size, so the labels have
 * room at 358 px (a 390 px phone less the page's gutters) as at 1,000.
 */

/** Label size in px (the 'small' size of the type review's scale). */
export const LABEL_PX = 12;
/** The width drawn before the picture has been measured (and in a spec render). */
export const FALLBACK_WIDTH = 600;
/** Average digit width as a share of the font size, for the system sans with tabular figures (about 0.55 to 0.6). */
const DIGIT_EM = 0.6;
/** At most this many gaps between x labels (integerTicks' default `n`), so labels sit at least plotW / 4 apart. */
export const X_GAPS = 4;
export const Y_GAPS = 4;

export interface HeatLayout {
  W: number;
  H: number;
  L: number;
  R: number;
  T: number;
  B: number;
  plotW: number;
  plotH: number;
  fontSize: number;
  /** Where the rotated "days" title is centred across. */
  yTitleX: number;
  /** Baseline of the x tick labels and of the "last stop (TE)" title. */
  xLabelY: number;
  xTitleY: number;
}

/** Width in px of a label of `chars` characters at the label size. */
export function labelWidth(chars: number): number {
  return chars * DIGIT_EM * LABEL_PX;
}

/**
 * The frame for a picture `widthPx` wide whose longest y label (days, one decimal) is `yLabelChars` long.
 * Height keeps the old 600 × 260 shape, never under 220 px so a phone still gets a usable plot.
 */
export function heatLayout(widthPx: number, yLabelChars = 4): HeatLayout {
  const fs = LABEL_PX;
  const W = Math.max(240, Math.round(widthPx));
  const H = Math.max(220, Math.round((W * 260) / 600));
  // Left: the rotated title (one line), a gap, the y labels (right-aligned), 6 px to the axis.
  const yTitleX = Math.ceil(fs * 0.75);
  const L = Math.ceil(fs * 1.5 + 4 + labelWidth(yLabelChars) + 6);
  const R = Math.ceil(labelWidth(3) / 2); // half a "490" past the last x tick
  const T = Math.ceil(fs / 2 + 2); // the top y label's glyphs stay inside
  // Bottom: x labels one line under the axis, then the title one line further down.
  const xLabelY = fs + 4; // below the axis
  const B = xLabelY + fs + 8;
  return {
    W,
    H,
    L,
    R,
    T,
    B,
    plotW: W - L - R,
    plotH: H - T - B,
    fontSize: fs,
    yTitleX,
    xLabelY,
    xTitleY: H - 4,
  };
}
