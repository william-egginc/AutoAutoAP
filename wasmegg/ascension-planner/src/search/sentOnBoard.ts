/**
 * A result this browser already put on the Leaderboard, known before Send is pressed (Jordan, 27 Oct 2026: By
 * a date's share box offered "Send 313 TE by this date" for a run already there, and only the press said
 * "Already on the Leaderboard (sent at 10:48 AM), nothing new stored").
 *
 * The collector calls a send an exact copy when the same sender (owner code) already has a row with the same
 * fingerprint and the same search (collector/worker.js "duplicates", `fingerprint` and `searchSig`). GET /mine
 * returns exactly that sender's rows, with what both compare, so the app asks the same question of them. A row
 * read without a field the search needs (an older row) does not match: the box offers Send as before.
 */
import { contentFingerprint, type BoardRow } from '@/lib/leaderboardRank';
import { alreadyOnBoardText, type Submission } from './submission';

/** `spaceKey` in collector/worker.js. */
function spaceKey(sp: BoardRow['space'] | Submission['space'] | null | undefined): string {
  if (!sp || typeof sp !== 'object') return '';
  const where =
    sp.mode === 'range' && sp.range
      ? `r${sp.range.lo}-${sp.range.hi}/${sp.range.step}`
      : `b${(sp.bands || []).map(b => (b || []).join('.')).join('_')}`;
  return `${where}|g${sp.minGap}|a${sp.minAscensions}-${sp.maxAscensions}|n${sp.chains}`;
}

type Searched = Pick<BoardRow, 'effort' | 'chainsPriced' | 'space' | 'provisional' | 'level' | 'atOnce' | 'lightFrom'>;

/** `searchSig` in collector/worker.js: the same search, as a string. */
function searchSig(r: Searched): string {
  const sp = r.space && typeof r.space === 'object' ? r.space : null;
  return JSON.stringify([
    r.effort || '',
    spaceKey(sp),
    r.chainsPriced ?? null,
    sp ? (sp.chainsPriced ?? null) : null,
    sp ? !!sp.stoppedEarly : null,
    ...(r.provisional === true ? ['provisional'] : []),
    ...(r.level === 'light' ? ['light', r.atOnce ?? null, r.lightFrom ?? null] : []),
  ]);
}

/**
 * The row of `rows` (the account's board rows) that this send would only copy: sent with this browser's code
 * (`yours`), the same result (fingerprint, and the same date for a By a date answer) and the same search. Null
 * when there is none, or nothing to compare (no payload, or the rows were not read).
 */
export function sentRowFor(payload: Submission | null, rows: readonly BoardRow[] | null | undefined): BoardRow | null {
  if (!payload || !rows?.length || payload.provisional) return null;
  const sent = payload as unknown as BoardRow;
  const fp = contentFingerprint(sent);
  const sig = searchSig(sent);
  return (
    rows.find(
      r =>
        r.yours === true &&
        !r.provisional &&
        (r.deadline ?? null) === (payload.deadline ?? null) &&
        contentFingerprint(r) === fp &&
        searchSig(r) === sig
    ) ?? null
  );
}

/** "Already on the Leaderboard (sent at 10:48 AM)", the press's own words, for a row found on load. */
export function onBoardLine(row: BoardRow, now = Date.now()): string {
  return alreadyOnBoardText(row.receivedAt || row.submittedAt, now);
}
