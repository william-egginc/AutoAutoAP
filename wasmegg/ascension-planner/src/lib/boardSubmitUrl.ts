/**
 * WHERE A RUN'S RESULT IS SENT, when that is not where everything else goes (Jordan, 4 Nov 2026). egg-beta runs a
 * newer simulator than the live site, and its Run results were landing on the LIVE Leaderboard. A build with
 * `VITE_BOARD_SUBMIT_URL` (a collector's base URL, or its `/submit`) sends the board's SENDS there: the result, a
 * progress send / Send best so far, and what follows a sent row (its CSV, CSV deltas, the full CSV, Put my name on it).
 * Everything else stays on `VITE_SUBMIT_URL`: reading the board, My runs, Follow / prefs / answers saved online, the
 * build count, the phone watch link, the instant record and the explorer.
 *
 * Unset (every build but egg-beta): the send URL IS the submit URL, so nothing changes.
 *
 * Not a result-code input (lib/resultCodeHash.ts): only the chain-search store and components import it.
 */

/** `https://x.dev`, `https://x.dev/` or `https://x.dev/submit` as the `/submit` endpoint; '' for blank. */
export function asSubmitEndpoint(url: string | null | undefined): string {
  const u = (url ?? '').trim().replace(/\/+$/, '');
  if (!u) return '';
  return /\/submit$/.test(u) ? u : `${u}/submit`;
}

/** The `/submit` a board send posts to: the board setting when there is one, else `submitUrl` unchanged. */
export function boardSubmitUrlOf(board: string | null | undefined, submitUrl: string): string {
  return asSubmitEndpoint(board) || submitUrl;
}

/** The build's own board setting, trimmed ('' when unset). */
export function buildBoardSetting(): string {
  return ((import.meta.env.VITE_BOARD_SUBMIT_URL as string | undefined) ?? '').trim();
}

/** Shown near Before you send only when the build sends results to their own board (DRAFT wording, 4 Nov 2026). */
export const TEST_BOARD_NOTE = 'egg-beta sends to a test board while it runs a newer simulator.';
