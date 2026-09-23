/**
 * @module highlight
 * @description Reading a short list of checkpoint values out of a text box.
 *
 * `195, 196, 197` and `195-200` and `195 196 197` all mean the same thing to the person typing
 * them, and all three are what people actually type, so all three are accepted. Separate from
 * `parseBand` in exhaustive.ts on purpose: that one reads a SEARCH SPACE, where a bare `195-200`
 * has to default to a step of 5 because that is what a band means there. Here the same text means
 * "these six values", and silently dropping four of them because a band parser assumed a grid
 * would be a very quiet way to show the wrong chart.
 */

/**
 * How many values a highlight may name.
 *
 * Not arbitrary: past half a dozen the colours stop being distinguishable and the footer stops
 * fitting on a line, so the chart would be claiming to show a comparison it cannot actually be
 * read as. A range wider than this keeps its lowest values rather than refusing, because
 * `195-220` is usually somebody exploring rather than somebody being precise.
 */
export const MAX_HIGHLIGHT_VALUES = 6;

/**
 * Distinct values named by `text`, ascending, capped at `MAX_HIGHLIGHT_VALUES`.
 *
 * Returns an empty array for anything unreadable, which callers should treat as "no highlight"
 * rather than as an error: this runs on every keystroke, and half-typed input is the normal case,
 * not a mistake to complain about.
 */
export function parseHighlightValues(text: string, limit = MAX_HIGHLIGHT_VALUES): number[] {
  const out: number[] = [];
  const seen = new Set<number>();

  const push = (v: number): boolean => {
    if (!Number.isFinite(v)) return true;
    const n = Math.floor(v);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
    return out.length < limit;
  };

  for (const token of text.split(/[,;\s]+/)) {
    if (!token) continue;
    // En dash as well as hyphen: a value copied out of prose often carries one, and rejecting it
    // looks like the parser cannot read numbers.
    const range = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (hi < lo) continue;
      for (let v = lo; v <= hi; v++) if (!push(v)) return out.sort((a, b) => a - b);
      continue;
    }
    if (/^\d+$/.test(token) && !push(Number(token))) break;
  }

  return out.sort((a, b) => a - b);
}
