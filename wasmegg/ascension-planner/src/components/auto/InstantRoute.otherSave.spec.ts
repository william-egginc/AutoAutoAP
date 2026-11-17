/**
 * The instant card with a result priced on ANOTHER save of the same account (17 Nov 2026, Reliability). InstantRoute is
 * never mounted whole in the suite, so this covers it in two parts: the pure rule InstantRoute reads (lib/searchPlan.ts
 * `liveSearchResult`, `fromOtherSave`, `keptEntryOf`; lib/searchPointer.ts `pointerOf`) driven the way InstantRoute
 * drives it on a By a date result 30 minutes older than the loaded save, with the real kept list
 * (localStorage 'aap-search-plans'), and the wiring in InstantRoute.vue read as text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import InstantPointer from './InstantPointer.vue';
import { pointerOf } from '@/lib/searchPointer';
import { fromOtherSave, keptEntryOf, liveSearchResult, readKeptSearches, recordKeptSearch, KEPT_SEARCH_KEY, type LiveSearchInput } from '@/lib/searchPlan';

const LOADED = 1_794_000_000;
const DEADLINE = LOADED + 90 * 86400;
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};
const input = (backupAt: number): LiveSearchInput => ({
  goal: 'date',
  deadline: DEADLINE,
  target: 490,
  currentTE: 191.4,
  ownerOk: () => true,
  fastest: { running: false, bestDays: Infinity, bestChain: [], bestLegs: null, planStart: 0, custom: false, effort: null, at: 0, owner: '' },
  date: {
    running: false,
    owner: '',
    result: { deadline: DEADLINE, te: 191, simple: true, level: 'quick', at: (LOADED + 60) * 1000, planStart: LOADED, backupAt, routes: [{ chain: [197, 313], reachAt: DEADLINE - 86400, legs: [] }] },
  },
});
const meta = { account: 'acct', goal: `date ${DEADLINE}`, backupTime: LOADED, setup: { availability: null, timeOff: [] }, teByEgg: [1, 2, 3, 4, 5] };

describe('instant card, a By a date result priced 30 minutes before the loaded save', () => {
  it('the pointer shows it and says it is from the other save', async () => {
    const f = liveSearchResult(input(LOADED - 1800))!;
    const other = fromOtherSave(f, LOADED);
    expect(other).toBe(true);
    const p = pointerOf('date', f, String, other ? f.backupAt : null)!;
    const t = textOf(await renderHtml(InstantPointer, { pointer: p }));
    expect(t).toBe(`Fast found 313 TE on your save from ${LOADED - 1800}. Run Fast again to check it on this save. See it ↓`);
  });
  it('it is kept under the result\'s own backupAt, without the loaded save\'s setup or teByEgg', () => {
    const st = mem();
    const f = liveSearchResult(input(LOADED - 1800))!;
    expect(recordKeptSearch(keptEntryOf(meta, f), st)).toBe(true);
    const kept = readKeptSearches(st);
    expect(st.raw.has(KEPT_SEARCH_KEY)).toBe(true);
    expect(kept).toHaveLength(1);
    expect(kept[0].backupTime).toBe(LOADED - 1800);
    expect(kept[0].teByEgg).toBeUndefined();
    expect(kept[0].setup).toBeUndefined();
  });
  it('same save: the old pointer words and the loaded save\'s record', () => {
    const f = liveSearchResult(input(LOADED - 60))!;
    expect(fromOtherSave(f, LOADED)).toBe(false);
    expect(pointerOf('date', f, String, null)?.text).toBe('Fast found 313 TE on your account.');
    const st = mem();
    recordKeptSearch(keptEntryOf(meta, f), st);
    expect(readKeptSearches(st)[0]).toMatchObject({ backupTime: LOADED, teByEgg: [1, 2, 3, 4, 5] });
  });
});

describe('InstantRoute.vue wiring', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
  it('keeps and patches through the other-save rule, and the pointer gets the save time', () => {
    expect(src).toContain('keptEntryOf(');
    expect(src).toContain('fromOtherSave(');
    expect(src).toContain('searchFromOtherSave.value ? searchFound.value?.backupAt : null');
    expect(src).toContain('saveAt: store.chainRunSaveAt');
    expect(src).toContain("search: newerSearch(keptSearch.value, thisSaveFound.value)");
  });
});
