import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LEG_DETAIL_KEY,
  readLegDetailBudget,
  spillNote,
  spillOpenFailure,
  spillSizeText,
  staleDownloadReason,
  withBom,
  writeLegDetailBudget,
} from './legSpillText';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: k => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe('QA 1: the detail setting survives a reload', () => {
  it('reads back what was written, 0 (keep everything) included', () => {
    const s = fakeStorage();
    expect(readLegDetailBudget(s)).toBeNull();
    writeLegDetailBudget(s, 10);
    expect(readLegDetailBudget(s)).toBe(10);
    writeLegDetailBudget(s, 0);
    expect(readLegDetailBudget(s)).toBe(0);
    s.setItem(LEG_DETAIL_KEY, 'lots');
    expect(readLegDetailBudget(s)).toBeNull();
    expect(readLegDetailBudget(null)).toBeNull();
  });
  it('the store reads it at start and writes it on every change', () => {
    const src = readFileSync(new URL('../stores/chainSearch.ts', import.meta.url), 'utf8');
    expect(src).toContain('ref(readLegDetailBudget(browserStorage()) ?? DEFAULT_LEG_DETAIL_BUDGET)');
    expect(src).toContain('watch(legDetailBudget, n => writeLegDetailBudget(browserStorage(), Number(n)))');
  });
});

describe("QA 2: no download of a just-started run's emptied spill", () => {
  it('refuses while a new run has no routes of its own, and only then', () => {
    expect(staleDownloadReason({ ownRoutes: 0, running: true })).toMatch(/hasn't priced a route yet/);
    expect(staleDownloadReason({ ownRoutes: 25, running: true })).toBeNull();
    expect(staleDownloadReason({ ownRoutes: 0, running: false })).toBeNull();
  });
  it('the full Fastest download checks it first', () => {
    const src = readFileSync(new URL('../stores/chainSearch.ts', import.meta.url), 'utf8');
    const at = src.indexOf('async function* streamFullCsv(');
    expect(src.slice(at, at + 900)).toContain('staleDownloadReason({ ownRoutes: allEntries().length, running: isRunning.value })');
  });
});

describe('QA 3: the full download starts with the UTF-8 BOM', () => {
  it('puts it before the first chunk', async () => {
    async function* csv() {
      yield '# a — b\n';
      yield 'rank\n';
    }
    let out = '';
    for await (const c of withBom(csv())) out += c;
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('# a — b\nrank\n');
    const src = readFileSync(new URL('./legSpillOpfs.ts', import.meta.url), 'utf8');
    expect(src).toContain('for await (const c of withBom(chunks))');
  });
});

describe('QA 4: the size in KB or with a decimal, never "0 MB"', () => {
  it('reads like a size', () => {
    expect(spillSizeText(156_557)).toBe('153 KB');
    expect(spillSizeText(300)).toBe('1 KB');
    expect(spillSizeText(0)).toBe('0 KB');
    expect(spillSizeText(7.6 * 1024 * 1024)).toBe('7.6 MB');
    expect(spillSizeText(3_000 * 1024 * 1024)).toBe('3,000 MB');
    expect(spillNote({ routes: 144, bytes: 156_557, stopped: null }, 'this computer', 10)!.text).toContain('(144 routes, 153 KB)');
  });
});

describe('QA 5 and 8: Setup > Memory says when there is no spill, and why', () => {
  it('no OPFS', () => {
    const n = spillNote({ routes: 0, bytes: 0, stopped: null, unavailable: 'no-opfs' }, 'this computer', 10)!;
    expect(n.warn).toBe(true);
    expect(n.text).toContain("This browser can't keep every route's detail on this computer's disk");
    expect(n.text).toContain('per-ascension detail for the fastest 10 routes only');
  });
  it('another tab holds the file', () => {
    const n = spillNote({ routes: 0, bytes: 0, stopped: null, unavailable: 'other-tab' }, 'this computer', 8000)!;
    expect(n.text).toMatch(/^Another tab has this account's search detail file open/);
    expect(n.text).toContain('the fastest 8,000 routes only');
  });
  it('tells the reasons apart from the browser errors', () => {
    expect(spillOpenFailure(Object.assign(new Error('x'), { name: 'NoModificationAllowedError' }))).toBe('other-tab');
    expect(spillOpenFailure(Object.assign(new Error('x'), { name: 'UnknownError' }))).toBe('no-opfs');
    expect(spillOpenFailure(new TypeError('fh.createSyncAccessHandle is not a function'))).toBe('no-opfs');
    expect(spillOpenFailure(new Error('something else'))).toBe('error');
  });
  it('a full disk is a warning; a working spill is not', () => {
    expect(spillNote({ routes: 5, bytes: 10, stopped: 'after 5 routes (disk full)' }, 'this computer', 0)!.warn).toBe(true);
    expect(spillNote({ routes: 5, bytes: 10, stopped: null }, 'this computer', 0)!.warn).toBe(false);
    expect(spillNote(null, 'this computer', 0)).toBeNull();
  });
  it("the CSV's blank-cell note gives the detail limit as the first reason", () => {
    const src = readFileSync(new URL('../search/csv.ts', import.meta.url), 'utf8');
    expect(src).toContain("Blank per-leg cells mean the chain's leg detail was not kept: it is past the 'Keep per-ascension");
  });
});

describe("QA 6 (QA's 7): the download's OPFS copy does not stay", () => {
  it('is deleted after the save, and a stale one at the first spill of a visit', () => {
    const src = readFileSync(new URL('./legSpillOpfs.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/URL\.revokeObjectURL\(url\);\s*void w\.ask\(\{ op: 'close', name, remove: true \}\)/);
    expect(src).toContain("void w.ask({ op: 'close', name: DOWNLOAD_FILE, remove: true })");
  });
});

describe("QA 8: a second tab's own run does not keep the other tab's note", () => {
  it('clears "won\'t start it again" once this tab starts a run', () => {
    const src = readFileSync(new URL('../components/auto/StepAwayOptions.vue', import.meta.url), 'utf8');
    expect(src).toMatch(/\(\) => store\.busy,\s*busy => \{\s*if \(busy && autoNote\.value\.startsWith\(ELSEWHERE_NOTE\)\) autoNote\.value = '';/);
    expect(src.match(/autoNote\.value = ELSEWHERE_NOTE;/g)).toHaveLength(2);
  });
});
