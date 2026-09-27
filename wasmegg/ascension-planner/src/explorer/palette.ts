/**
 * @module explorer/palette
 * @description One colour sequence for the whole explorer, so an account is the same colour in
 * every chart on the page.
 *
 * EIGHT HUES, VALIDATED, NEVER CYCLED ALONE. The dataviz reference palette in its tested order: every
 * adjacent pair clears the colour-blind (ΔE >= 8) and normal-vision (>= 15) floors on this light
 * surface. The old ten hues were five families in two shades each and failed both (a crimson and a
 * pink ΔE 5.8 apart for deuteranopes, two blues 5.6 apart for everyone), and the page wraps past
 * ten accounts, so two accounts drew in the exact same colour. Past eight an account keeps a hue
 * but takes a different marker shape (`symbolAt`), so no two accounts look alike. Three of the
 * hues sit under 3:1 contrast on white; every chart that uses them names its series in a legend,
 * a table or the tooltip, never by colour alone.
 *
 * Assigned by position in a list sorted by something no filter changes (see ChainExplorer's
 * `accountColors`): a colour that moves when a checkbox is ticked teaches the reader the wrong
 * account.
 */
export const SERIES_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/** The second channel once the hues run out: accounts 9-16 are triangles, 17-24 diamonds, ... */
export const SERIES_SYMBOLS = ['circle', 'triangle', 'diamond', 'rect'] as const;
export type SeriesSymbol = (typeof SERIES_SYMBOLS)[number];

const wrap = (index: number, n: number) => ((Math.floor(index) % n) + n) % n;

export function colorAt(index: number): string {
  return SERIES_PALETTE[wrap(index, SERIES_PALETTE.length)];
}

/** The marker shape for an account's position: a circle for the first eight, then the next shape. */
export function symbolAt(index: number): SeriesSymbol {
  return SERIES_SYMBOLS[wrap(Math.floor(Math.max(0, index) / SERIES_PALETTE.length), SERIES_SYMBOLS.length)];
}

/** Axis furniture, matching the planner's own charts so the two pages look like one project. */
export const AXIS_LABEL = { color: '#94a3b8', fontSize: 10 } as const;
export const SPLIT_LINE = { lineStyle: { color: '#eef2f7' } } as const;

/** Spread into every tooltip: kept inside the chart and wrapped, so a long one fits a phone rather
 *  than running off the side of the screen. */
export const TOOLTIP_FIT = {
  confine: true,
  extraCssText: 'max-width: min(320px, 86vw); white-space: normal;',
} as const;
