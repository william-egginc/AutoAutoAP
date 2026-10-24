/**
 * Why an upload to the collector didn't land, in words for the run timeline, the black box and the
 * page's note (search/csvDelta.ts, search/progressSend.ts `uploadCsv`).
 */

/** What a fetch that threw means: a TypeError with no response is the browser refusing or failing to
 *  send (a CORS block looks exactly like being offline from the page; 12 Oct 2026, the collector's
 *  CORS list lacked x-delta-token and the CSV failed without a word). */
export const BLOCKED_WHY = "the browser refused or couldn't send the request: blocked by CORS, or offline";
export function fetchFailureWhy(e: unknown): string {
  if (e instanceof TypeError) return BLOCKED_WHY;
  if (e instanceof Error && e.name === 'AbortError') return 'the request was cut off';
  return `the request failed (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`;
}
