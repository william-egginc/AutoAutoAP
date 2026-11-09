/**
 * spec-firsttour (8 Nov 2026, Jordan: "Can we make a tutorial for first time visitors? (with the option to skip and
 * remind me later defaulted checked)"; design ~/code/aaap-tools/notes/tutorial-design.md, Jordan's defaults kept).
 * The tour's memory: ONE localStorage key, `aap.tour`, absent / later:N / off / done, read and written with plain
 * localStorage calls in try/catch. Never sent, never synced, never part of the result hash.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TOUR_KEY,
  TOUR_REMIND_CAP,
  afterDone,
  afterLoadMySave,
  afterSkip,
  formatTour,
  isNewVisitor,
  parseTour,
  readTour,
  shownFirst,
  stepsFor,
  tourShouldStart,
  writeTour,
} from './firstTour';
import { resultCodeHash } from './resultCodeHash';
import { onStorageWrite, watchStorageWrites } from './storageWrites';
import { memoryStorage } from './storageGuard';
import * as WORDS from './firstTourWords';

const mem = () => {
  const m = new Map<string, string>();
  return {
    m,
    st: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    },
  };
};

describe('aap.tour values', () => {
  it('reads absent, later:N, off and done; junk is absent', () => {
    expect(TOUR_KEY).toBe('aap.tour');
    expect(parseTour(null)).toEqual({ kind: 'absent' });
    expect(parseTour('later:0')).toEqual({ kind: 'later', n: 0 });
    expect(parseTour('later:2')).toEqual({ kind: 'later', n: 2 });
    expect(parseTour('off')).toEqual({ kind: 'off' });
    expect(parseTour('done')).toEqual({ kind: 'done' });
    for (const junk of ['', 'later', 'later:x', 'later:-1', 'yes', '{"a":1}']) expect(parseTour(junk)).toEqual({ kind: 'absent' });
    expect(formatTour({ kind: 'later', n: 2 })).toBe('later:2');
    expect(formatTour({ kind: 'off' })).toBe('off');
    expect(formatTour({ kind: 'done' })).toBe('done');
  });

  it('starts: absent only for a new visitor; later:N while N < 3; never off, done, or later:3 and up (the cap)', () => {
    expect(TOUR_REMIND_CAP).toBe(3);
    const go = (v: string | null, newVisitor = true) => tourShouldStart({ stored: parseTour(v), newVisitor, blocked: false });
    expect(go(null)).toBe(true);
    expect(go(null, false)).toBe(false);
    expect(go('later:0', false)).toBe(true);
    expect(go('later:1')).toBe(true);
    expect(go('later:2')).toBe(true);
    expect(go('later:3')).toBe(false);
    expect(go('later:7')).toBe(false);
    expect(go('off')).toBe(false);
    expect(go('done')).toBe(false);
  });

  it('skip with Remind me later ticked adds 1, unticked writes off; Done writes done; the first show writes later:0', () => {
    expect(afterSkip({ kind: 'absent' }, true)).toEqual({ kind: 'later', n: 1 });
    expect(afterSkip({ kind: 'later', n: 0 }, true)).toEqual({ kind: 'later', n: 1 });
    expect(afterSkip({ kind: 'later', n: 2 }, true)).toEqual({ kind: 'later', n: 3 });
    expect(afterSkip({ kind: 'later', n: 1 }, false)).toEqual({ kind: 'off' });
    // A replay skipped with the box ticked asks for it again (from done or off: a fresh count).
    expect(afterSkip({ kind: 'done' }, true)).toEqual({ kind: 'later', n: 1 });
    expect(afterSkip({ kind: 'done' }, false)).toEqual({ kind: 'off' });
    expect(afterDone()).toEqual({ kind: 'done' });
    // v2 (Jordan, 9 Nov 2026): "Load my save" on the welcome box is a choice to start: done, no reminder, no skip count.
    expect(afterLoadMySave()).toEqual({ kind: 'done' });
    expect(shownFirst({ kind: 'absent' })).toEqual({ kind: 'later', n: 0 });
    expect(shownFirst({ kind: 'later', n: 2 })).toEqual({ kind: 'later', n: 2 });
    // The third skip with the box ticked is the last: later:3 reads as off.
    expect(tourShouldStart({ stored: afterSkip({ kind: 'later', n: 2 }, true), newVisitor: true, blocked: false })).toBe(false);
  });

  it('new visitor: no saved player ID and no remembered tab in this browser', () => {
    expect(isNewVisitor({ savedPlayerId: null, lastRoute: null })).toBe(true);
    expect(isNewVisitor({ savedPlayerId: '', lastRoute: '' })).toBe(true);
    expect(isNewVisitor({ savedPlayerId: 'EI1234567890123456', lastRoute: null })).toBe(false);
    expect(isNewVisitor({ savedPlayerId: null, lastRoute: '#/auto/fastest' })).toBe(false);
  });

  it('a save file with no player ID ends the tour at step 4 (Follow this route)', () => {
    expect(stepsFor({ hasAccount: false, hasSaveFile: false })).toEqual(['load', 'goal', 'answer', 'follow', 'myruns', 'setup']);
    expect(stepsFor({ hasAccount: true, hasSaveFile: false })).toEqual(['load', 'goal', 'answer', 'follow', 'myruns', 'setup']);
    expect(stepsFor({ hasAccount: false, hasSaveFile: true })).toEqual(['load', 'goal', 'answer', 'follow']);
  });
});

describe('storage: plain localStorage calls, never a crash', () => {
  afterEach(() => {
    // nothing global is touched by these
  });

  it('round-trips through a storage', () => {
    const { m, st } = mem();
    expect(readTour(st)).toEqual({ kind: 'absent' });
    expect(writeTour({ kind: 'later', n: 1 }, st)).toBe(true);
    expect(m.get('aap.tour')).toBe('later:1');
    expect(readTour(st)).toEqual({ kind: 'later', n: 1 });
  });

  it('getItem throwing: unreadable (null), and no tour starts by itself', () => {
    const st = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    };
    expect(readTour(st)).toBeNull();
    expect(tourShouldStart({ stored: readTour(st), newVisitor: true, blocked: false })).toBe(false);
  });

  it('setItem throwing (full or refused): false, no throw', () => {
    const st = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => writeTour({ kind: 'done' }, st)).not.toThrow();
    expect(writeTour({ kind: 'done' }, st)).toBe(false);
  });

  it('storage blocked (storageGuard memory fallback): never starts by itself', () => {
    const st = memoryStorage();
    expect(readTour(st)).toEqual({ kind: 'absent' });
    expect(tourShouldStart({ stored: readTour(st), newVisitor: true, blocked: true })).toBe(false);
    expect(tourShouldStart({ stored: { kind: 'later', n: 1 }, newVisitor: true, blocked: true })).toBe(false);
  });

  it('writes go through the ONE wrapper on Storage.prototype and never wrap it again', () => {
    // A Storage-like prototype standing in for the browser's, wrapped once by lib/storageWrites.ts.
    class FakeStorage {
      m = new Map<string, string>();
      getItem(k: string) {
        return this.m.get(k) ?? null;
      }
      setItem(k: string, v: string) {
        this.m.set(k, v);
      }
      removeItem(k: string) {
        this.m.delete(k);
      }
    }
    const local = new FakeStorage();
    const win = { Storage: FakeStorage, localStorage: local };
    expect(watchStorageWrites(win)).toBe(true);
    const before = Object.getOwnPropertyDescriptor(FakeStorage.prototype, 'setItem');
    const seen: string[] = [];
    const stop = onStorageWrite((_a, k, v) => seen.push(`${k}=${v}`));
    expect(writeTour({ kind: 'later', n: 0 }, local as unknown as Storage)).toBe(true);
    stop();
    expect(seen).toEqual(['aap.tour=later:0']);
    expect(Object.getOwnPropertyDescriptor(FakeStorage.prototype, 'setItem')).toEqual(before);
  });

  it('the module never wraps, reassigns or defines setItem, and registers no storage listener', () => {
    const src = readFileSync(new URL('./firstTour.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/defineProperty|onStorageWrite|watchStorageWrites|\.setItem\s*=|addEventListener\(\s*['"]storage/);
  });
});

describe('never sent, never synced, never in the result hash', () => {
  const appRoot = new URL('../../', import.meta.url).pathname;
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(path.join(appRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.ts')) files.set(rel, readFileSync(path.join(appRoot, rel), 'utf8'));
    }
  };
  walk('src');
  files.set('release.ts', readFileSync(path.join(appRoot, 'release.ts'), 'utf8'));
  const tourFile = (p: string) => /(^|\/)(firstTour|useFirstTour|firstTourWords|tourSlides)[^/]*\.ts$/.test(p);

  it('no tour file is a hash input, and the hash is the same without them', () => {
    const r = resultCodeHash(files);
    expect(r.inputs.filter(tourFile)).toEqual([]);
    const without = new Map([...files].filter(([p]) => !tourFile(p)));
    expect(resultCodeHash(without).hash).toBe(r.hash);
  });

  it('the tour key is in no sync, prefs, follow or consent payload code', () => {
    for (const [p, src] of files) {
      if (tourFile(p) || /\.spec\.ts$/.test(p)) continue;
      expect(`${p}: ${src.includes("'aap.tour'") || src.includes('TOUR_KEY')}`).toBe(`${p}: false`);
    }
  });
});

describe('words (lib/firstTourWords.ts; v2 additions DRAFT, for Words)', () => {
  it('has a title and body for every step, the welcome box, alt text, and the controls', () => {
    for (const id of ['load', 'goal', 'answer', 'follow', 'myruns', 'setup'] as const) {
      expect(WORDS.FIRST_TOUR_STEPS[id].title.length).toBeGreaterThan(3);
      expect(WORDS.FIRST_TOUR_STEPS[id].body.length).toBeGreaterThan(20);
      expect(WORDS.FIRST_TOUR_ALT[id].length).toBeGreaterThan(20);
    }
    expect(WORDS.FIRST_TOUR_WELCOME.title).toBe('Welcome to the Ascension Planner');
    expect(WORDS.FIRST_TOUR_WELCOME.take).toBe('Take the tour');
    expect(WORDS.FIRST_TOUR_WELCOME.skip).toBe('Skip');
    expect(WORDS.FIRST_TOUR_WELCOME.load).toBe('Load my save');
    expect(WORDS.FIRST_TOUR_REMIND).toBe('Remind me later');
    expect(WORDS.FIRST_TOUR_SKIP).toBe('Skip tour');
    expect(WORDS.FIRST_TOUR_REPLAY).toBe('Show the tour again');
    expect(WORDS.firstTourLabel(2, 6)).toBe('Step 2 of 6');
    expect(WORDS.firstTourAnnounce(2, 6, 'Pick a goal')).toBe('Tour, step 2 of 6: Pick a goal');
  });

  it('the pictures show a sample account: no real name and no player ID in any word', () => {
    const all = JSON.stringify(WORDS);
    expect(all).not.toMatch(/Williamthe5thc|EI\d{16}/);
  });
});
