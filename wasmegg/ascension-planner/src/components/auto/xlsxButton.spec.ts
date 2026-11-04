/**
 * The Excel download beside the CSV (spec-xlsx, 29 Oct 2026): the run CSV showed ######## in every time column in
 * Excel, and a CSV can't say how wide a column is. Both result cards (Fastest's, By a date's) offer the same table
 * as an .xlsx when it is of top-routes size (utils/xlsxRows.ts `XLSX_ROW_CAP`); the CSV button stays as it was.
 * The writer (utils/xlsxWriter.ts) is loaded only on the click. Wording is a draft for Words.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import ByDateRouteCard from './ByDateRouteCard.vue';
import RouteResultCard from './RouteResultCard.vue';
import { XLSX_BUTTON, xlsxButton } from './csvButton';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { XLSX_ROW_CAP, XLSX_ROW_CAP_STORED, deadlineTableRows, fastestTableRows, xlsxRowCap } from '@/utils/xlsxRows';
import type { DeadlineRoute } from '@/search/deadline';

const read = (f: string) => readFileSync(path.join(__dirname, f), 'utf8');
const SRC = path.join(__dirname, '../..');
const DEADLINE = 1_815_660_000;
const route: DeadlineRoute = {
  chain: [166, 197, 223, 247],
  reachAt: DEADLINE - 3600,
  ascendAt: DEADLINE - 3600,
  spare: 3600,
  legs: [],
};

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
});

describe('the button (draft wording)', () => {
  it('says what it is, in sentence case', () => {
    expect(XLSX_BUTTON).toBe('Download for Excel (.xlsx) ↓');
    expect(xlsxButton().text).toBe(XLSX_BUTTON);
    expect(xlsxButton().title).toMatch(/every column wide enough.*header row/);
  });

  it('Fastest: beside the CSV button only when offered, emitting xlsx; a 44 px tap target', async () => {
    const card = (over = {}) =>
      renderHtml(RouteResultCard, {
        chain: [212, 280, 490],
        days: 760.5,
        finalTE: 490,
        endLabel: 'Feb 15, 2029',
        running: false,
        canSave: true,
        ...over,
      });
    expect(textOf(await card())).not.toContain(XLSX_BUTTON);
    const t = textOf(await card({ xlsx: true }));
    expect(t).toMatch(/Share Download CSV \(detail for top routes\) ↓ Download for Excel \(\.xlsx\) ↓ Save run/);
    const src = read('RouteResultCard.vue');
    expect(src).toMatch(
      /v-if="xlsx"\s+type="button"\s+:class="SECONDARY_BUTTON"\s+data-testid="fastest-xlsx"[\s\S]*?@click="emit\('xlsx'\)"/
    );
    expect(read('resultCardStyle.ts')).toMatch(/SECONDARY_BUTTON = `[^`]*min-h-\[44px\]/);
  });

  it('By a date: the same, on the finished answer', async () => {
    const base = { route, deadline: DEADLINE, zone: 'UTC', canCsv: true };
    expect(textOf(await renderHtml(ByDateRouteCard, base))).not.toContain(XLSX_BUTTON);
    expect(textOf(await renderHtml(ByDateRouteCard, { ...base, xlsx: true }))).toMatch(
      /Download CSV \(detail for top routes\) ↓ Download for Excel \(\.xlsx\) ↓/
    );
    expect(textOf(await renderHtml(ByDateRouteCard, { ...base, xlsx: true, running: true }))).not.toContain(
      XLSX_BUTTON
    );
    expect(read('ByDateRouteCard.vue')).toMatch(
      /v-if="xlsx"[\s\S]*?data-testid="by-date-xlsx"[\s\S]*?@click="emit\('xlsx'\)"/
    );
  });

  it('every panel with a result card offers it by the store and downloads through one handler', () => {
    for (const panel of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
      const src = read(panel);
      expect(src).toContain(`:xlsx="store.xlsxOffered('fastest')"`);
      expect(src).toContain(`@xlsx="downloadXlsx('fastest')"`);
    }
    const src = read('DeadlinePanel.vue');
    expect(src).toContain(`:xlsx="store.xlsxOffered('deadline')"`);
    expect(src).toContain(`@xlsx="downloadXlsx('deadline')"`);
  });
});

describe('the row cap', () => {
  it('200,000 rows; 50,000 where the browser cannot deflate (the sheet is then held whole)', () => {
    expect(XLSX_ROW_CAP).toBe(200_000);
    expect(XLSX_ROW_CAP_STORED).toBe(50_000);
    expect(xlsxRowCap(true)).toBe(XLSX_ROW_CAP);
    expect(xlsxRowCap(false)).toBe(XLSX_ROW_CAP_STORED);
  });

  it('rows as the CSV writes them: a row a leg, one for a route without legs', () => {
    expect(fastestTableRows([3, 0, 5, 0])).toBe(3 + 1 + 5 + 1);
    // With every route priced listed: legs for the top `legRoutes`, then a summary line each.
    expect(deadlineTableRows([4, 4, 4], 2, 1000)).toBe(8 + 1000);
    // Without: every kept route, those past the leg cap on one row.
    expect(deadlineTableRows([4, 4, 4], 2, null)).toBe(8 + 1);
    expect(deadlineTableRows([0, 2], 20_000, null)).toBe(3);
  });

  it('the store offers it for nothing when there is no result', () => {
    const store = useChainSearchStore();
    expect(store.xlsxOffered('fastest')).toBe(false);
    expect(store.xlsxOffered('deadline')).toBe(false);
  });

  it('the store: offered under the cap only, never mid-run (source)', () => {
    const src = readFileSync(path.join(SRC, 'stores/chainSearch.ts'), 'utf8');
    const fn = src.slice(src.indexOf('const xlsxOfferedNow'), src.indexOf('function xlsxOffered('));
    expect(fn).toMatch(/isRunning\.value/);
    expect(fn).toMatch(/xlsxRowCap\(\)/);
  });
});

describe('the writer is loaded on click only', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap(f => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|vue)$/.test(f) && !/\.spec\.ts$/.test(f) ? [p] : [];
    });
  }

  it('no static import of utils/xlsxWriter anywhere in the app; the download imports it dynamically', () => {
    const statics = files(SRC).filter(f =>
      /^\s*import\b[^;(]*from\s+['"][^'"]*xlsxWriter['"]/m.test(readFileSync(f, 'utf8'))
    );
    expect(statics.map(f => path.relative(SRC, f))).toEqual([]);
    const downloads = readFileSync(path.join(SRC, 'composables/useRunDownloads.ts'), 'utf8');
    expect(downloads).toMatch(/await import\('@\/utils\/xlsxWriter'\)/);
  });
});
