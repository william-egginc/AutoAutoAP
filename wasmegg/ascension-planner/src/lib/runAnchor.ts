/**
 * The progress bar's "Jump to it" / "Show it": the running search's own progress block, found by its
 * kind (`data-run-progress="smart" | "full" | "by-date"`), scrolled to once it is on the page.
 *
 * Two things went wrong with a bare `querySelector('[data-run-progress]')` (review, 9 Oct):
 *  - From another tab the first click only switched tabs: the screen's panels are async components,
 *    so the block was not there yet, and the page stayed at the top ("site has a new layout"). A second
 *    click was needed. Now the switch is followed by waiting for the block to mount (and lay out).
 *  - Any screen's block matched, whichever kind was running, so the first one in the page won: the
 *    Full sweep's jump could land on another panel's. Now only the running kind's block counts, and
 *    only one that is actually shown.
 *
 * And a third (the user, 9 Oct, a Full sweep carried on after a refresh): the jump landed on the
 * estimate box ("Values tried / Chains it will run / Est. wall clock") a screen above the progress.
 * The scroll was aimed once, centring a block 25 px tall, and the page above it was still changing
 * height as the run settled in (boxes closing and opening, cards appearing), which carried the block
 * out of view after the scroll had been aimed. Now the block's top goes just under the progress bar
 * (so the progress and the best so far under it are what shows), and the page is watched for a moment
 * afterwards (`holdInView`): whenever the block moves, the scroll follows it, until it has stayed put
 * for a second and a half, or the player scrolls themselves.
 */
export type RunAnchorKind = 'smart' | 'full' | 'by-date';

export function runAnchorSelector(kind: RunAnchorKind): string {
  return `[data-run-progress="${kind}"]`;
}

/** Shown: laid out with a size (not display:none, nor inside a closed or hidden parent). */
function shown(el: Element): boolean {
  return el.getClientRects().length > 0;
}

export interface FindRunOptions {
  /** Where to look; the page by default. */
  root?: Pick<Document, 'querySelectorAll'>;
  /** Waits one step; a 50 ms timer by default. Not `requestAnimationFrame`: a tab the browser counts
   *  as hidden gets no frames at all, and the jump would then wait for ever. */
  frame?: () => Promise<void>;
  /** Give up after this many steps (5 s). */
  maxFrames?: number;
}

const nextFrame = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 50));

function findShown(kind: RunAnchorKind, root: Pick<Document, 'querySelectorAll'>): Element | null {
  return [...root.querySelectorAll(runAnchorSelector(kind))].find(shown) ?? null;
}

/**
 * The running kind's progress block once it is on the page and shown, waiting step by step while a
 * tab switch mounts it; null if it never comes (the run ended meanwhile, or the block is not shown).
 * One more step after it appears, so the scroll lands on the laid-out page, not on the first paint.
 */
export async function findRunBlock(kind: RunAnchorKind, opts: FindRunOptions = {}): Promise<Element | null> {
  const root = opts.root ?? document;
  const frame = opts.frame ?? nextFrame;
  const max = opts.maxFrames ?? 100;
  for (let i = 0; i <= max; i++) {
    const el = findShown(kind, root);
    if (el) {
      await frame();
      return el;
    }
    await frame();
  }
  return null;
}

/** What `holdInView` needs from the page; `browserView()` is the real one, tests pass their own. */
export interface HoldView {
  /** The page's scroll position. */
  scrollY(): number;
  scrollTo(top: number): void;
  /** Where the block's top should sit, px from the top of the window: under the sticky progress bar. */
  inset(): number;
  /** Calls `cb` when the layout may have moved (resizes, and a short poll); returns the unsubscribe. */
  watchLayout(cb: () => void): () => void;
  /** Calls `cb` when the player scrolls by hand (wheel, touch, keys, a press on the scrollbar). */
  watchPlayer(cb: () => void): () => void;
  /** A one-off timer; returns its cancel. */
  later(cb: () => void, ms: number): () => void;
}

export interface HoldOptions {
  /** Stop once the block has stayed put this long (ms). */
  quietMs?: number;
  /** Stop after this long whatever happens (ms). */
  maxMs?: number;
}

/** Why `holdInView` stopped. */
export type HoldEnd = 'settled' | 'player' | 'gone' | 'timeout';

/** Where the sticky progress bar ends, so the block goes just under it; 16 px with no bar. */
function barInset(): number {
  const bar = document.querySelector('[data-run-bar]');
  const r = bar?.getBoundingClientRect();
  // The bar sticks 0.5rem from the top; under it, a little air.
  return r && r.height > 0 ? 8 + r.height + 16 : 16;
}

export function browserView(): HoldView {
  return {
    scrollY: () => window.scrollY,
    scrollTo: top => window.scrollTo({ top, behavior: 'smooth' }),
    inset: barInset,
    watchLayout: cb => {
      // The body's size changes whenever anything above the block opens or closes; the block's own
      // when it grows. The poll catches a move neither reports (a sibling swapping for another of the
      // same height above it, say).
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => cb()) : null;
      ro?.observe(document.body);
      const poll = setInterval(cb, 100);
      return () => {
        ro?.disconnect();
        clearInterval(poll);
      };
    },
    watchPlayer: cb => {
      const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
      const opts = { capture: true, passive: true } as const;
      for (const e of events) window.addEventListener(e, cb, opts);
      return () => {
        for (const e of events) window.removeEventListener(e, cb, opts);
      };
    },
    later: (cb, ms) => {
      const t = setTimeout(cb, ms);
      return () => clearTimeout(t);
    },
  };
}

/**
 * Scroll so the block found by `find` sits just under the progress bar, then keep it there while the
 * page settles: each time the block's place on the page moves (something above it opened, closed or
 * loaded), scroll again. Stops once it has not moved for `quietMs` (1.5 s), after `maxMs` (5 s) at
 * most, when the block is gone, or as soon as the player scrolls by hand, so it never fights them.
 * `find` is asked again each time, so a block re-rendered meanwhile is still the one followed.
 */
export function holdInView(
  find: () => Element | null,
  view: HoldView = browserView(),
  opts: HoldOptions = {}
): Promise<HoldEnd> {
  const quietMs = opts.quietMs ?? 1500;
  const maxMs = opts.maxMs ?? 5000;
  /** Where the page should be scrolled to for the block, or null when it is gone. */
  const target = (): number | null => {
    const el = find();
    if (!el || !shown(el)) return null;
    return Math.max(0, Math.round(el.getBoundingClientRect().top + view.scrollY() - view.inset()));
  };
  return new Promise(resolve => {
    let aimedAt = target();
    if (aimedAt === null) {
      resolve('gone');
      return;
    }
    view.scrollTo(aimedAt);
    const stops: (() => void)[] = [];
    let quiet: (() => void) | null = null;
    let ended = false;
    const end = (why: HoldEnd) => {
      if (ended) return;
      ended = true;
      quiet?.();
      for (const s of stops) s();
      resolve(why);
    };
    const restartQuiet = () => {
      quiet?.();
      quiet = view.later(() => end('settled'), quietMs);
    };
    const check = () => {
      if (ended) return;
      const t = target();
      if (t === null) return end('gone');
      // A pixel or two is rounding, not the page moving.
      if (Math.abs(t - (aimedAt as number)) <= 2) return;
      aimedAt = t;
      view.scrollTo(t);
      restartQuiet();
    };
    stops.push(view.watchLayout(check));
    stops.push(view.watchPlayer(() => end('player')));
    stops.push(view.later(() => end('timeout'), maxMs));
    restartQuiet();
  });
}

export interface ScrollToRunOptions extends FindRunOptions {
  /** The page, for `holdInView`; the browser's by default. */
  view?: HoldView;
  hold?: HoldOptions;
}

/** Find the block (waiting for it), scroll it into view and hold it there while the page settles.
 *  True when it was found. */
export async function scrollToRun(kind: RunAnchorKind, opts: ScrollToRunOptions = {}): Promise<boolean> {
  const el = await findRunBlock(kind, opts);
  if (!el) return false;
  const root = opts.root ?? document;
  void holdInView(() => findShown(kind, root), opts.view, opts.hold);
  return true;
}
