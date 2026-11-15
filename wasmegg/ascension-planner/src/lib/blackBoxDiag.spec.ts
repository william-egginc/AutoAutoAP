/**
 * lib/blackBoxDiag.ts reads and writes search/blackBox.ts's record with lines of its own (blackBox.ts
 * keeps them private, and may not import this file: the result code hash). One record, read and
 * written by both, with the same 40-entry history.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as blackBox from '@/search/blackBox';
import { noteCarryOn, notePageLoad, readLive, watcherReopenPath } from './blackBoxDiag';

let backing: Map<string, string>;
beforeEach(() => {
  backing = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
  });
  vi.stubGlobal('document', { visibilityState: 'visible' });
});

const carryOn = (n: number) =>
  noteCarryOn({ kind: 'deadline search', carryOn: 'click', workersFrom: 7, workersTo: 5, lastSaveAt: n, lastSaveRoutes: n });

describe("the same record as search/blackBox.ts", () => {
  it('a beat written by blackBox.beat() is what readLive() reads, open and in the history', () => {
    const b = blackBox.beat({ phase: 'deadline search', detail: 'Round 1', done: 293, workers: 7 });
    const live = readLive();
    expect(live.open).toEqual(b);
    expect(live.history.at(-1)).toMatchObject({ phase: 'deadline search', done: 293, at: b.at });
    expect(live.env).toBeDefined();
  });

  it("a page-load entry goes into blackBox's history and leaves its unfinished beat open", () => {
    const b = blackBox.beat({ phase: 'deadline search', detail: 'Round 1', done: 293, workers: 7 });
    notePageLoad(b, { reopenedBy: 'watcher-new-tab', sinceReopenMs: 5000 }, b.at + 240_000);
    const u = blackBox.readUnfinished()!;
    expect(u.last).toEqual(b);
    expect(u.history.at(-1)).toMatchObject({
      phase: 'page load',
      sinceLastBeatMs: 240_000,
      reopenedBy: 'watcher-new-tab',
      sinceReopenMs: 5000,
    });
    // ...and blackBox's own writes after it keep it.
    blackBox.end('deadline search');
    expect(readLive().history.map(e => e.phase)).toEqual(['deadline search', 'page load', 'deadline search']);
  });

  it('the history stays at 40 entries, whichever of the two writes', () => {
    for (let i = 0; i < 30; i++) blackBox.beat({ phase: 'deadline search', done: i });
    for (let i = 0; i < 30; i++) carryOn(i);
    expect(readLive().history).toHaveLength(40);
    expect(readLive().history.at(-1)).toMatchObject({ phase: 'carry on', lastSaveRoutes: 29 });
    blackBox.note('tab hidden');
    const h = blackBox.readUnfinished()!.history;
    expect(h).toHaveLength(40);
    expect(h.at(-2)).toMatchObject({ phase: 'carry on', lastSaveRoutes: 29 });
  });
});

describe('watcherReopenPath', () => {
  it('a new tab within 20 s of the reopen, its own tab up to 3 min, nothing after or without one', () => {
    expect(watcherReopenPath({ reopens: [1000] }, 6000)).toEqual({ reopenedBy: 'watcher-new-tab', sinceReopenMs: 5000 });
    expect(watcherReopenPath({ reopens: [1000] }, 26_000)).toEqual({ reopenedBy: 'watcher-own-tab', sinceReopenMs: 25_000 });
    expect(watcherReopenPath({ reopens: [1000] }, 1000 + 3 * 60_000 + 1)).toBeNull();
    expect(watcherReopenPath({ reopens: [] }, 6000)).toBeNull();
    expect(watcherReopenPath(null, 6000)).toBeNull();
  });
});
