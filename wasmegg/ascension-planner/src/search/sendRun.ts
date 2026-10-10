/**
 * Send the Full sweep result on screen to the board: one routine for every place that sends one.
 *
 * Was InsanePanel's own `submit`. The Science tab runs sweeps in place now (SweepRunner.vue, the
 * user, 30 Sept: "is it possible to just run the stuff there?"), and a second copy of these steps
 * is how the two would drift: the CSV left off one of them (which happened here once, so every row
 * read "No CSV was attached"), or the black-box marks that say where a page died mid-send.
 */
import type { useChainSearchStore } from '@/stores/chainSearch';
import { sentence } from '@/utils/errors';
import { afterPaint, type Submission } from './submission';

type ChainSearchStore = ReturnType<typeof useChainSearchStore>;

/**
 * The payload with the black box summary as its `diagnostics` field when the player ticked "Also send
 * diagnostics" (and exactly as it was otherwise). The collector keeps that field privately and never
 * serves it. Reads `store.diagnosticsLine()`, a JSON string, so the store needs no change.
 */
export function withPrivateDiagnostics(store: ChainSearchStore, payload: Submission, go: boolean): Submission {
  if (!go) return payload;
  try {
    const parsed = JSON.parse(store.diagnosticsLine());
    return parsed && typeof parsed === 'object' ? { ...payload, diagnostics: parsed } : payload;
  } catch {
    return payload;
  }
}

/**
 * Build the result (and, with `includeCsv`, the full table) and send it. `onStage` hears each step
 * for a status line. Never throws for a refused send: the answer is in `ok` and `text`.
 */
export async function sendRunResult(
  store: ChainSearchStore,
  nickname: string,
  includeCsv: boolean,
  onStage: (text: string) => void = () => {},
  /** "Also send diagnostics": a private field of the submission body (never in the CSV, which is public). */
  withDiagnostics = false
): Promise<{ ok: boolean; text: string }> {
  // Already sent (automatically or by hand): a second send is only a duplicate row.
  if (store.alreadySubmitted) return { ok: true, text: 'Already on the board: this result was sent from here before.' };
  onStage('Preparing your result...');
  try {
    // Let the status reach the screen before the table build blocks the page.
    await afterPaint();
    const payload = store.buildRunSubmission(nickname);
    if (!payload) return { ok: false, text: 'Nothing to submit yet.' };
    // Black box: a page that dies while building or sending the table says so on the next visit.
    store.blackBoxMark('submit', includeCsv ? 'building the CSV' : 'building the result');
    // Chunks, compressed as they are made (stores/chainSearch.ts `sendSubmission`): never one big string.
    const csv = includeCsv ? store.exportCsvChunks() : undefined;
    store.blackBoxMark('submit', csv ? 'sending (the CSV is built as it goes)' : 'sending');
    onStage('Sending...');
    const res = await store.sendSubmission(withPrivateDiagnostics(store, payload, withDiagnostics), csv);
    // A copy the collector already had stored nothing, so there is nothing to thank anyone for.
    const text = !res.ok
      ? `Not sent: ${res.message}`
      : res.duplicate === 'exact'
        ? res.message
        : `Thanks! ${sentence(res.message)}`;
    return { ok: res.ok, text };
  } finally {
    store.blackBoxEnd('submit');
  }
}
