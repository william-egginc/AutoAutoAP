/**
 * THE FULL CSV, FOR THE PLAYER TOO (Jordan, 28 Oct 2026). A run over 100,000 routes sends its full CSV (every
 * route's per-ascension detail, scrubbed of player IDs, gzipped) to the collector's private store (store
 * `sendFullCsv`), and "is kept privately for analysis" said only that. The .csv.gz it uploaded stays in this
 * browser's storage (lib/legSpillOpfs.ts `openBigCsvSink`) until the next one replaces it, so BigCsvStatus.vue
 * offers it as run-full.csv.gz under that line, and says in one line when it is gone.
 *
 * Wording is a draft for Words.
 */
import { ref } from 'vue';
import { bigCsvGzSize, saveBigCsvGz } from '@/lib/legSpillOpfs';
import { tryDownloadAsync } from './useRunDownloads';
import { thisDevice } from '@/search/device';

export const FULL_CSV_GZ_NAME = 'run-full.csv.gz';

/** The button, with the size the kept line gives (search/bigCsvUpload.ts `bigCsvMessage`). Draft. */
export function fullCsvGzButton(bytes: number): string {
  return `Download the full CSV (${(bytes / 1e6).toFixed(0)} MB, .csv.gz) ↓`;
}

/** In place of the button when the file is not here any more ("this phone" on a phone, search/device.ts). Draft. */
export function fullCsvGone(): string {
  return `The full CSV is no longer on ${thisDevice()}: this browser's site data was cleared, or a newer run's full CSV replaced it.`;
}

/** The kept file is here (true), gone (false), or not looked for yet (null). One for the page: one kept file. */
const onDisk = ref<boolean | null>(null);

export function useFullCsvGz() {
  return {
    onDisk,
    /** Look for the file the upload of `bytes` left. */
    async check(bytes: number): Promise<void> {
      onDisk.value = (await bigCsvGzSize()) === bytes;
    },
    forget(): void {
      onDisk.value = null;
    },
    /** Save it as run-full.csv.gz; gone by the click, the button becomes the line. */
    save: (bytes: number) =>
      tryDownloadAsync('full CSV', async () => {
        if (!(await saveBigCsvGz(FULL_CSV_GZ_NAME, bytes))) onDisk.value = false;
      }),
  };
}
