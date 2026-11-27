/**
 * WHEN THE EXCEL DOWNLOAD IS OFFERED (spec-xlsx, 29 Oct 2026). Small and dependency-free, so the result cards
 * can decide without loading the writer (utils/xlsxWriter.ts, imported only on click).
 *
 * The .xlsx is the top-routes CSV (store `exportCsvChunks`, `deadlineCsvChunksNow`) laid out for Excel. A run
 * over the cap has a table no spreadsheet opens comfortably (Excel stops at 1,048,576 rows, and a long run's
 * CSV is a hundred megabytes or more), so its card offers the CSV only.
 */

/** Data rows (one per leg, plus summary lines) the .xlsx is offered for. */
export const XLSX_ROW_CAP = 200_000;

/**
 * The same, in a browser that cannot deflate (no CompressionStream('deflate-raw'): Safari before 16.4,
 * Firefox before 113). The writer then stores the sheet uncompressed and holds it whole until the save,
 * a few hundred bytes a row, so the cap is lower there.
 */
export const XLSX_ROW_CAP_STORED = 50_000;

/** Whether this browser deflates (CompressionStream with 'deflate-raw'). */
export function canDeflateRaw(): boolean {
  try {
    if (typeof CompressionStream === 'undefined') return false;
    new CompressionStream('deflate-raw' as CompressionFormat);
    return true;
  } catch {
    return false;
  }
}

/** The cap that applies in this browser. */
export function xlsxRowCap(deflate = canDeflateRaw()): number {
  return deflate ? XLSX_ROW_CAP : XLSX_ROW_CAP_STORED;
}

/** Rows a Fastest CSV writes for these routes: one per leg, or one for a route with no leg detail. */
export function fastestTableRows(legCounts: Iterable<number>): number {
  let n = 0;
  for (const legs of legCounts) n += Math.max(1, legs);
  return n;
}

/**
 * Rows a By a date CSV writes (search/csv.ts `deadlineCsvChunks`): one per leg for the top `legRoutes` kept
 * routes (one for a route without legs), then, with the list of every route priced, one summary line each
 * (`pricedCount`; the kept routes past the leg cap are not written again). Without that list, every kept
 * route has its rows.
 */
export function deadlineTableRows(legCounts: readonly number[], legRoutes: number, pricedCount: number | null): number {
  const shown = pricedCount !== null ? Math.min(legCounts.length, legRoutes) : legCounts.length;
  let n = 0;
  for (let i = 0; i < shown; i++) n += i < legRoutes ? Math.max(1, legCounts[i]) : 1;
  return n + (pricedCount ?? 0);
}
