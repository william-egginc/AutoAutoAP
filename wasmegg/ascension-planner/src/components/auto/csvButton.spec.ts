/**
 * The green result card's CSV button says what the file holds (Jordan, 28 Oct 2026; was "CSV ↓"). The file
 * (store `streamFullCsv`) always has a line for every route priced; each ascension's detail is there for the
 * top routes, or for every route when the run kept them all on this computer (its leg spill). Wording is a
 * draft for Words.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import ByDateRouteCard from './ByDateRouteCard.vue';
import RouteResultCard from './RouteResultCard.vue';
import { CSV_EVERY_ROUTE, CSV_TOP_ROUTES, csvButton } from './csvButton';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { LegSpill, MemorySpillBackend } from '@/search/legSpill';
import type { DeadlineRoute } from '@/search/deadline';

const read = (f: string) => readFileSync(path.join(__dirname, f), 'utf8');
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

describe('the CSV button names what it holds', () => {
  it('top routes, or every route when the run kept them all (draft wording)', () => {
    expect(CSV_TOP_ROUTES).toBe('Download CSV (detail for top routes) ↓');
    expect(CSV_EVERY_ROUTE).toBe('Download CSV (detail for every route) ↓');
    expect(csvButton(false).text).toBe(CSV_TOP_ROUTES);
    expect(csvButton(true).text).toBe(CSV_EVERY_ROUTE);
    expect(csvButton(false).title).toMatch(/every route priced.*top routes/i);
    expect(csvButton(true).title).toMatch(/every route/i);
  });

  it('By a date: the card shows the named button, still emitting csv', async () => {
    const top = await renderHtml(ByDateRouteCard, { route, deadline: DEADLINE, zone: 'UTC', canCsv: true });
    expect(textOf(top)).toContain('Download CSV (detail for top routes) ↓');
    expect(textOf(top)).not.toMatch(/(^|\s)CSV ↓/);
    expect(top.replace(/&#39;/g, "'")).toContain(`title="${csvButton(false).title}"`);
    const every = await renderHtml(ByDateRouteCard, { route, deadline: DEADLINE, zone: 'UTC', canCsv: true, csvEvery: true });
    expect(textOf(every)).toContain('Download CSV (detail for every route) ↓');
    const src = read('ByDateRouteCard.vue');
    expect(src).toMatch(/data-testid="by-date-csv"\s+:title="csv\.title"\s+@click="emit\('csv'\)"/);
  });

  it('By a date panel: the label follows the run, the download is the same handler', () => {
    const src = read('DeadlinePanel.vue');
    expect(src).toContain(`:csv-every="store.csvHasEveryRoute('deadline')"`);
    expect(src).toContain('@csv="downloadByDateCsv"');
  });

  it('the store: every route only with the screen\'s spill open and not stopped', () => {
    const store = useChainSearchStore();
    expect(store.csvHasEveryRoute('fastest')).toBe(false);
    expect(store.csvHasEveryRoute('deadline')).toBe(false);
    store.setLegSpill(new LegSpill(new MemorySpillBackend(), 'UTC'), 'fastest');
    expect(store.csvHasEveryRoute('fastest')).toBe(true);
    // By a date also needs its own finished run's list of every route priced: none here.
    store.setLegSpill(new LegSpill(new MemorySpillBackend(), 'UTC'), 'deadline');
    expect(store.csvHasEveryRoute('deadline')).toBe(false);
    store.setLegSpill(null);
    expect(store.csvHasEveryRoute('fastest')).toBe(false);
  });

  it('a spill that stopped (disk full) is not every route', async () => {
    const store = useChainSearchStore();
    const spill = new LegSpill(new MemorySpillBackend(0), 'UTC');
    store.setLegSpill(spill, 'fastest');
    spill.put('166,197', [{ key: 'continue', endTE: 166 } as never]);
    await spill.commit().catch(() => {});
    expect(spill.stopped).not.toBeNull();
    expect(store.csvHasEveryRoute('fastest')).toBe(false);
  });
});

describe('Fastest (Fast, Exact, Custom): the same named button in the same place', () => {
  const fast = (over = {}) =>
    renderHtml(RouteResultCard, { chain: [212, 280, 490], days: 760.5, finalTE: 490, endLabel: 'Feb 15, 2029', running: false, canSave: true, ...over });

  it('Share, then the named CSV button, then Save run, as on By a date', async () => {
    expect(textOf(await fast())).toMatch(/Share Download CSV \(detail for top routes\) ↓ Save run/);
    expect(textOf(await fast({ csvEvery: true }))).toMatch(/Share Download CSV \(detail for every route\) ↓ Save run/);
    expect(read('RouteResultCard.vue')).toMatch(/data-testid="fastest-csv"\s+:title="csv\.title"\s+@click="emit\('csv'\)"/);
  });

  it('Fast / Exact and Custom pass the run\'s detail and keep the same handler', () => {
    for (const panel of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
      const src = read(panel);
      expect(src).toContain(`:csv-every="store.csvHasEveryRoute('fastest')"`);
      expect(src).toContain('@csv="downloadCsv"');
    }
  });

  it('the full CSV (.csv.gz) sits with the kept line on every screen: one component under each result', () => {
    expect(read('CsvCard.vue')).toContain('<BigCsvStatus />');
    expect(read('DeadlinePanel.vue')).toContain('<BigCsvStatus />');
    for (const panel of ['ChainSearchPanel.vue', 'InsanePanel.vue']) expect(read(panel)).toMatch(/<CsvCard\b/);
  });
});
