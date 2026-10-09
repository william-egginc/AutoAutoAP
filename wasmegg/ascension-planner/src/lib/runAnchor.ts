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
    const el = [...root.querySelectorAll(runAnchorSelector(kind))].find(shown);
    if (el) {
      await frame();
      return el;
    }
    await frame();
  }
  return null;
}

/** Find the block (waiting for it) and scroll it into view. True when it was found. */
export async function scrollToRun(kind: RunAnchorKind, opts: FindRunOptions = {}): Promise<boolean> {
  const el = await findRunBlock(kind, opts);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !!el;
}
