/**
 * A flight recorder for long runs: what the page was doing when the browser took it away.
 *
 * Safari (and Chrome, less often) can kill a tab outright -- the white page, and in Activity Monitor
 * no process at all -- without the page getting a single event. Nothing can be saved AT the crash,
 * so this saves a small note all the time instead: every beat while a run or a submission is going,
 * and at every hide/show of the tab. A beat that never got its matching "done" means the page died
 * in the middle, and the next visit can say when, doing what, with the tab hidden or not, and with
 * how much memory where the browser reports it.
 *
 * localStorage, not IndexedDB, on purpose: its writes are synchronous, so the last beat before the
 * crash is on disk rather than in a queue the crash takes with it. The record is a few KB.
 */
const KEY = 'aap.blackBox';
const HISTORY = 40;

export interface Beat {
  at: number;
  phase: string;
  detail?: string;
  done?: number;
  total?: number;
  workers?: number;
  /** Priced chains held in memory. */
  entries?: number;
  hidden: boolean;
  /** JS heap in use, MB -- Chrome only; Safari and Firefox do not report it. */
  heapMB?: number;
}

interface Box {
  version: 1;
  /** The last beat of a phase that has not finished. Still set at the next load = it died there. */
  open: Beat | null;
  history: Beat[];
}

function read(): Box {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Box | null;
    if (raw && raw.version === 1 && Array.isArray(raw.history)) return raw;
  } catch {
    // unreadable or blocked: start fresh
  }
  return { version: 1, open: null, history: [] };
}

function write(box: Box): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(box));
  } catch {
    // Storage full or blocked: the recorder is a nicety, never a reason to fail a run.
  }
}

function heapMB(): number | undefined {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : undefined;
}

/** Record that `phase` is going on right now, with whatever progress is known. */
export function beat(b: Omit<Beat, 'at' | 'hidden' | 'heapMB'>): void {
  const box = read();
  const full: Beat = {
    ...b,
    at: Date.now(),
    hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
    heapMB: heapMB(),
  };
  box.open = full;
  box.history = [...box.history, full].slice(-HISTORY);
  write(box);
}

/** A tab hide/show, noted in the history without opening a phase. */
export function note(detail: string): void {
  const box = read();
  const b: Beat = {
    at: Date.now(),
    phase: 'tab',
    detail,
    hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
    heapMB: heapMB(),
  };
  box.history = [...box.history, b].slice(-HISTORY);
  write(box);
}

/** The phase finished normally: nothing to report next time. */
export function end(phase: string): void {
  const box = read();
  if (box.open && box.open.phase === phase) box.open = null;
  box.history = [
    ...box.history,
    {
      at: Date.now(),
      phase,
      detail: 'finished',
      hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
      heapMB: heapMB(),
    },
  ].slice(-HISTORY);
  write(box);
}

/** What the previous page was in the middle of when it stopped, or null. Read once, at load. */
export function readUnfinished(): { last: Beat; history: Beat[] } | null {
  const box = read();
  return box.open ? { last: box.open, history: box.history } : null;
}

/** Forget the previous page's unfinished phase (dismissed, or a new run started). */
export function clearUnfinished(): void {
  const box = read();
  box.open = null;
  write(box);
}
