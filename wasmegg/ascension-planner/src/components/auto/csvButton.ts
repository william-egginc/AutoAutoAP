/**
 * The result card's CSV button (RouteResultCard.vue, ByDateRouteCard.vue), named for what the file holds
 * (Jordan, 28 Oct 2026; was "CSV ↓"). The file (store `streamFullCsv`) always has a line for every route the
 * run priced; each ascension's detail is there for the top routes, or for every route when the run kept them
 * all on this computer (store `csvHasEveryRoute`). Drafts for Words.
 */
export const CSV_TOP_ROUTES = 'Download CSV (detail for top routes) ↓';
export const CSV_EVERY_ROUTE = 'Download CSV (detail for every route) ↓';

export function csvButton(every: boolean): { text: string; title: string } {
  return every
    ? { text: CSV_EVERY_ROUTE, title: "Every route priced, each with its ascensions' detail" }
    : { text: CSV_TOP_ROUTES, title: "Every route priced, with each ascension's detail for the top routes" };
}

/**
 * The Excel download beside it (spec-xlsx, 29 Oct 2026): the same table as an .xlsx with each column wide enough
 * (a CSV can't say, so Excel showed ######## in the time columns) and the header row frozen. Offered when the table
 * is of top-routes size (store `xlsxOffered`, utils/xlsxRows.ts). Drafts for Words.
 */
export const XLSX_BUTTON = 'Download for Excel (.xlsx) ↓';

export function xlsxButton(): { text: string; title: string } {
  return {
    text: XLSX_BUTTON,
    title:
      "The same table as the CSV, as an Excel file: every column wide enough, the header row kept in view",
  };
}
