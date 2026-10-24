/**
 * @module explorer/legend
 * @description What the explorer's HTML chart legends (ChartLegend.vue) are made of, and the one bit
 * of logic they share: turning an entry off and on.
 *
 * WHY HTML AND NOT ECHARTS' LEGEND. ECharts' scrolling legend pages its entries behind arrows, and
 * its plain legend wraps over the plot unless the grid leaves room for however many rows it takes,
 * which depends on the width. On a phone both hid accounts. An HTML legend under the chart wraps as
 * far as it needs to, whatever the width. Its entries still turn series off and on: each chart keeps
 * the set of hidden ids and leaves those series out of its option.
 */
import type { SeriesSymbol } from './palette';

export interface LegendEntry {
  /** What the chart hides when the entry is turned off: an account key, a run id, a series key. */
  id: string;
  label: string;
  /** Muted text after the label (`· start 132`). */
  note?: string;
  /** Hover text for the entry. */
  title?: string;
  /** Colour index (colour and shape, palette.ts), or `color` + `symbol` for a mark of its own. */
  index?: number;
  color?: string;
  symbol?: SeriesSymbol;
  hollow?: boolean;
  /** A line through the mark in this pattern, for a line series. */
  line?: 'solid' | 'dashed' | 'dotted' | 'dashdot' | null;
  /** Mark height in px (default 8). */
  size?: number;
}

/** The hidden set with `id` flipped. A new set every time, so a `ref` holding it notices. */
export function toggled(hidden: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** The hidden ids that are still entries: an id whose entry has gone (a filter changed) stops counting. */
export function hiddenAmong(hidden: ReadonlySet<string>, entries: readonly Pick<LegendEntry, 'id'>[]): Set<string> {
  return new Set(entries.filter(e => hidden.has(e.id)).map(e => e.id));
}
