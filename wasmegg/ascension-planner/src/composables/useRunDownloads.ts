/**
 * The files a search hands the player: its CSV (one row per leg), the Full sweep's input diagnostics,
 * and By a date's CSV. One set of handlers for the three screens (CsvCard.vue and By a date's result
 * row), so every download reports a failure the same way.
 *
 * Said on the page, not just in the console: a throw inside a click handler is otherwise invisible,
 * the button "does nothing", which is how a date the CSV could not format was reported. One message
 * for the whole site (`downloadError`), since only one download happens at a time.
 *
 * The chain CSV is chunked (`exportCsvChunks`): a long run's table is tens of megabytes, and the
 * one-string version needs three copies of it alive at once (it was crashing the tab outright).
 *
 * EVERY ROUTE'S DETAIL (26 Oct 2026): with the run's leg spill on disk (lib/legSpillOpfs.ts) the CSV comes
 * from `streamFullCsv`, written into an OPFS file and saved from there, so even a gigabyte file never sits
 * in the page's memory. Without OPFS it is the file as before.
 */
import { plainError } from '@/lib/plainError';
import { ref } from 'vue';
import { downloadCsv as saveCsvFile, downloadParts } from '@/utils/export';
import { saveFullCsv } from '@/lib/legSpillOpfs';
import type { useChainSearchStore } from '@/stores/chainSearch';

type Store = Pick<
  ReturnType<typeof useChainSearchStore>,
  'csvFilename' | 'exportCsvChunks' | 'buildRunDiagnostics' | 'deadlineCsvChunksNow' | 'streamFullCsv'
>;

const downloadError = ref('');

/** Run one download, and put any failure on the page. */
export function tryDownload(what: string, fn: () => void): void {
  downloadError.value = '';
  try {
    fn();
  } catch (e) {
    console.error(`${what} download failed`, e);
    downloadError.value = `The ${what} download failed: ${plainError(e).replace(/\.$/, '')}. Please send a screenshot of this message with your report.`;
  }
}

/** The same, for a download that is written out first (the full CSV through OPFS). */
export async function tryDownloadAsync(what: string, fn: () => Promise<void>): Promise<void> {
  downloadError.value = '';
  try {
    await fn();
  } catch (e) {
    console.error(`${what} download failed`, e);
    downloadError.value = `The ${what} download failed: ${plainError(e).replace(/\.$/, '')}. Please send a screenshot of this message with your report.`;
  }
}

/** `2026-10-08-14-03`, for file names. */
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export function useRunDownloads(store: Store) {
  return {
    downloadError,
    /** Smart search's or the Full sweep's chains, one row per leg. Safe mid-run. */
    downloadCsv: () =>
      tryDownloadAsync('CSV', async () => {
        const name = store.csvFilename();
        if (!(await saveFullCsv(store.streamFullCsv('fastest'), name))) saveCsvFile(name, store.exportCsvChunks());
      }),
    /** What the run was given (backup age, TE, research, loadout); no save data and no player ID. */
    downloadDiagnostics: () =>
      tryDownload('diagnostics', () =>
        downloadParts(`chain-search-diagnostics-${stamp()}.json`, [store.buildRunDiagnostics()], 'application/json')
      ),
    /** By a date's answer: legs for its top routes, then a summary line for every route priced (and with
     *  the run's leg spill, every priced route's legs after them). Streamed a chunk at a time. */
    downloadByDateCsv: () =>
      tryDownloadAsync('CSV', async () => {
        const name = `deadline-search-${stamp()}.csv`;
        if (!(await saveFullCsv(store.streamFullCsv('deadline'), name))) saveCsvFile(name, store.deadlineCsvChunksNow());
      }),
  };
}
