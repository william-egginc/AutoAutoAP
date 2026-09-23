/**
 * @module explorer/palette
 * @description One colour sequence for the whole explorer, so an account is the same colour in
 * every chart on the page.
 *
 * Assigned by position in a stable, sorted list rather than hashed from the account key: a hash
 * gives a colour that survives reordering, which sounds better until two accounts collide and the
 * page shows one line in two places. Ten distinguishable hues, then it wraps and the legend is
 * doing the work.
 */
export const SERIES_PALETTE = [
  '#4f46e5',
  '#e11d48',
  '#059669',
  '#d97706',
  '#0891b2',
  '#7c3aed',
  '#db2777',
  '#65a30d',
  '#0284c7',
  '#b45309',
];

export function colorAt(index: number): string {
  return SERIES_PALETTE[((index % SERIES_PALETTE.length) + SERIES_PALETTE.length) % SERIES_PALETTE.length];
}

/** Axis furniture, matching the planner's own charts so the two pages look like one project. */
export const AXIS_LABEL = { color: '#94a3b8', fontSize: 10 } as const;
export const SPLIT_LINE = { lineStyle: { color: '#eef2f7' } } as const;
