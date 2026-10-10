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
 */
import { ref } from 'vue';
import { downloadCsv as saveCsvFile, downloadParts } from '@/utils/export';
import type { useChainSearchStore } from '@/stores/chainSearch';

type Store = Pick<
  ReturnType<typeof useChainSearchStore>,
  'csvFilename' | 'exportCsvChunks' | 'buildRunDiagnostics' | 'deadlineCsvChunksNow'
>;

const downloadError = ref('');

/** Run one download, and put any failure on the page. */
export function tryDownload(what: string, fn: () => void): void {
  downloadError.value = '';
  try {
    fn();
  } catch (e) {
    console.error(`${what} download failed`, e);
    downloadError.value = `The ${what} download failed: ${e instanceof Error ? e.message : String(e)}. Please send a screenshot of this message with your report.`;
  }
}

/** `2026-10-08-14-03`, for file names. */
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export function useRunDownloads(store: Store) {
  return {
    downloadError,
    /** Smart search's or the Full sweep's chains, one row per leg. Safe mid-run. */
    downloadCsv: () => tryDownload('CSV', () => saveCsvFile(store.csvFilename(), store.exportCsvChunks())),
    /** What the run was given (backup age, TE, research, loadout); no save data and no player ID. */
    downloadDiagnostics: () =>
      tryDownload('diagnostics', () =>
        downloadParts(`chain-search-diagnostics-${stamp()}.json`, [store.buildRunDiagnostics()], 'application/json')
      ),
    /** By a date's answer: legs for its top routes, then a summary line for every route priced.
     *  Streamed a chunk at a time, like the chain CSV. */
    downloadByDateCsv: () =>
      tryDownload('CSV', () => saveCsvFile(`deadline-search-${stamp()}.csv`, store.deadlineCsvChunksNow())),
  };
}
