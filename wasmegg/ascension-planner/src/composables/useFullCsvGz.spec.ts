/**
 * The full CSV's .csv.gz on this computer (composables/useFullCsvGz.ts, BigCsvStatus.vue; Jordan, 28 Oct 2026):
 * after a big run's full CSV is kept on the collector, the same gzipped file is still in this browser's
 * storage (lib/legSpillOpfs.ts `openBigCsvSink`), and a button saves it as run-full.csv.gz. Gone (site data
 * cleared, a newer run's file in its place): one line says so instead of the button.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const opfs = vi.hoisted(() => ({
  size: vi.fn<() => Promise<number | null>>(),
  save: vi.fn<(name: string, bytes: number) => Promise<boolean>>(),
}));
vi.mock('@/lib/legSpillOpfs', async orig => ({
  ...(await orig<typeof import('@/lib/legSpillOpfs')>()),
  bigCsvGzSize: opfs.size,
  saveBigCsvGz: opfs.save,
}));

import { fullCsvGone, FULL_CSV_GZ_NAME, fullCsvGzButton, useFullCsvGz } from './useFullCsvGz';
import { useRunDownloads } from './useRunDownloads';
import BigCsvStatus from '@/components/auto/BigCsvStatus.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { renderHtml, textOf } from '@/test/renderComponent';

const MB118 = 118_400_000;

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
  opfs.size.mockReset();
  opfs.save.mockReset();
  useFullCsvGz().forget();
});

describe('useFullCsvGz', () => {
  it('the button names the file and its size, as the kept line does', () => {
    // draft wording (Words reviews)
    expect(fullCsvGzButton(MB118)).toBe('Download the full CSV (118 MB, .csv.gz) ↓');
    expect(FULL_CSV_GZ_NAME).toBe('run-full.csv.gz');
  });

  it('here only when the file on this computer is the one uploaded', async () => {
    const g = useFullCsvGz();
    opfs.size.mockResolvedValue(MB118);
    await g.check(MB118);
    expect(g.onDisk.value).toBe(true);
    opfs.size.mockResolvedValue(5);
    await g.check(MB118);
    expect(g.onDisk.value).toBe(false);
    opfs.size.mockResolvedValue(null);
    await g.check(MB118);
    expect(g.onDisk.value).toBe(false);
  });

  it('saves run-full.csv.gz through the saver; a file gone by the click turns the button into the line', async () => {
    const g = useFullCsvGz();
    g.onDisk.value = true;
    opfs.save.mockResolvedValue(true);
    await g.save(MB118);
    expect(opfs.save).toHaveBeenCalledWith('run-full.csv.gz', MB118);
    expect(g.onDisk.value).toBe(true);
    opfs.save.mockResolvedValue(false);
    await g.save(MB118);
    expect(g.onDisk.value).toBe(false);
  });

  it('a saver that throws says so on the page, like every other download', async () => {
    opfs.save.mockRejectedValue(new Error('disk full'));
    await useFullCsvGz().save(MB118);
    expect(useRunDownloads({} as never).downloadError.value).toMatch(/^The full CSV download failed: disk full\./);
  });
});

describe('BigCsvStatus', () => {
  const kept = () => {
    const store = useChainSearchStore();
    store.bigCsvState = {
      state: 'done',
      done: MB118,
      total: MB118,
      bytes: MB118,
      message: "The full CSV (every route's per-ascension detail, 118 MB) is kept privately for analysis.",
    };
    return store;
  };
  const render = async () => renderHtml(BigCsvStatus, {}, {}, []);

  it('kept and still on this computer: the line, then the download button', async () => {
    kept();
    opfs.size.mockResolvedValue(MB118);
    useFullCsvGz().onDisk.value = true;
    const html = await render();
    expect(textOf(html)).toBe(
      "The full CSV (every route's per-ascension detail, 118 MB) is kept privately for analysis. Download the full CSV (118 MB, .csv.gz) ↓"
    );
    expect(html).toContain('data-testid="full-csv-gz"');
    expect(html).toMatch(/min-h-\[44px\]/);
  });

  it('kept but gone from this computer: one line says why, no button', async () => {
    kept();
    opfs.size.mockResolvedValue(null);
    useFullCsvGz().onDisk.value = false;
    const html = await render();
    expect(html).not.toContain('full-csv-gz"');
    expect(textOf(html)).toContain(fullCsvGone());
    // "this computer" / "this phone" from search/device.ts, as everywhere else
    expect(fullCsvGone()).toMatch(/^The full CSV is no longer on this (computer|phone|tablet): /);
  });

  it('no button while the file is made or uploaded, or after a failed upload', async () => {
    const store = useChainSearchStore();
    useFullCsvGz().onDisk.value = true;
    for (const state of ['building', 'uploading', 'failed', 'stopped'] as const) {
      store.bigCsvState = { state, done: 1, total: 2, message: 'x' };
      const html = await render();
      expect(html).not.toContain('full-csv-gz');
      expect(html).not.toContain('full-csv-gone');
    }
  });

  it('the store keeps the size the kept line gives, for the button', () => {
    const src = readFileSync(path.join(__dirname, '../stores/chainSearch.ts'), 'utf8');
    expect(src).toContain("...(out.kind === 'kept' ? { bytes: out.bytes } : {}),\n                message: bigCsvMessage(out),");
  });

  it('no full CSV at all (most runs): nothing', async () => {
    expect(textOf(await render())).toBe('');
  });
});
