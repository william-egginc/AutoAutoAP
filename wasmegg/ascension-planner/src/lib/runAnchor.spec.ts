import { describe, expect, it } from 'vitest';
import { findRunBlock, holdInView, runAnchorSelector, scrollToRun, type HoldView } from './runAnchor';

/** A stand-in element: `rects` 0 is "not shown" (display:none, or a hidden screen); `top` is its
 *  place on the page, which a test moves to make the page above it change height. */
function el(kind: string, rects = 1, top = 2000) {
  return {
    kind,
    top,
    getClientRects: () => ({ length: rects }),
    getBoundingClientRect(): { top: number } {
      return { top: this.top - scrolledTo };
    },
  };
}
/** The fake page's scroll position (one page per test). */
let scrolledTo = 0;

/**
 * A page for `holdInView` whose clock the test drives: `tick(ms)` runs the layout poll and timers.
 * Scrolls land at once (a smooth scroll's end is all that matters here).
 */
function fakeView(inset = 120) {
  scrolledTo = 0;
  let now = 0;
  const timers: { at: number; cb: () => void }[] = [];
  const layout = new Set<() => void>();
  const player = new Set<() => void>();
  const scrolls: number[] = [];
  const view: HoldView = {
    scrollY: () => scrolledTo,
    scrollTo: top => {
      scrolledTo = top;
      scrolls.push(top);
    },
    inset: () => inset,
    watchLayout: cb => (layout.add(cb), () => layout.delete(cb)),
    watchPlayer: cb => (player.add(cb), () => player.delete(cb)),
    later: (cb, ms) => {
      const t = { at: now + ms, cb };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
  };
  return {
    view,
    scrolls,
    /** Advance the clock in 100 ms steps, running the layout poll each step. */
    tick(ms: number) {
      for (let t = 0; t < ms; t += 100) {
        now += 100;
        for (const cb of [...layout]) cb();
        for (const x of timers.filter(x => x.at <= now)) {
          timers.splice(timers.indexOf(x), 1);
          x.cb();
        }
      }
    },
    scrollByPlayer(y: number) {
      scrolledTo = y;
      for (const cb of [...player]) cb();
    },
    watching: () => layout.size > 0,
  };
}
type Fake = ReturnType<typeof el>;

/** A page whose elements appear after `mountAt` frames (an async panel mounting after a tab switch). */
function page(elements: Fake[], mountAt = 0) {
  let frames = 0;
  return {
    root: {
      querySelectorAll: (sel: string) =>
        (frames >= mountAt ? elements : []).filter(e => sel === runAnchorSelector(e.kind as never)) as never,
    },
    frame: async () => {
      frames++;
    },
    frames: () => frames,
  };
}

describe('the progress bar jumping to the run (review, 9 Oct)', () => {
  it("finds only the running kind's block, not the first one on the page", async () => {
    const other = el('smart');
    const mine = el('full');
    const p = page([other, mine]);
    expect(await findRunBlock('full', p)).toBe(mine);
  });

  it('skips a block that is not shown', async () => {
    const hidden = el('full', 0);
    const shown = el('full');
    const p = page([hidden, shown]);
    expect(await findRunBlock('full', p)).toBe(shown);
  });

  it('waits for the screen to mount after a tab switch, then scrolls once laid out (one click)', async () => {
    const block = el('by-date');
    const p = page([block], 5);
    const v = fakeView(120);
    expect(await scrollToRun('by-date', { ...p, view: v.view })).toBe(true);
    // Its top just under the progress bar (inset 120), not its middle in the middle of the window.
    expect(v.scrolls).toEqual([2000 - 120]);
    // It waited for the mount, and one frame more.
    expect(p.frames()).toBe(6);
  });

  it('gives up when the block never comes', async () => {
    const p = page([], 0);
    expect(await scrollToRun('smart', { ...p, maxFrames: 10 })).toBe(false);
  });

  it('every panel marks its block with its kind', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(__dirname, '../components/auto');
    const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
    expect(read('ChainSearchPanel.vue')).toContain('data-run-progress="smart"');
    expect(read('InsanePanel.vue')).toContain('data-run-progress="full"');
    expect(read('DeadlinePanel.vue')).toContain('data-run-progress="by-date"');
  });
});

describe('holding the run in view while the page settles (the user, 9 Oct: a carried-on Full sweep)', () => {
  it('follows the block when the page above it grows after the scroll, then stops once it stays put', async () => {
    const block = el('full', 1, 3000);
    const v = fakeView(100);
    const done = holdInView(() => block as never, v.view);
    expect(v.scrolls).toEqual([2900]);
    v.tick(300);
    // Cards open above it (Stepping away, the carry-on box closing and another opening): 900 px more.
    block.top = 3900;
    v.tick(100);
    expect(v.scrolls).toEqual([2900, 3800]);
    // A second change a little later is followed too.
    v.tick(600);
    block.top = 3700;
    v.tick(100);
    expect(v.scrolls.at(-1)).toBe(3600);
    // Then nothing moves for 1.5 s: it lets go.
    v.tick(1600);
    expect(await done).toBe('settled');
    expect(v.watching()).toBe(false);
    block.top = 5000;
    v.tick(500);
    expect(v.scrolls.at(-1)).toBe(3600);
  });

  it("never fights the player: their own scroll ends it, and the block moving after that doesn't pull them back", async () => {
    const block = el('smart', 1, 2500);
    const v = fakeView(100);
    const done = holdInView(() => block as never, v.view);
    v.tick(200);
    v.scrollByPlayer(400);
    expect(await done).toBe('player');
    block.top = 3200;
    v.tick(500);
    expect(v.scrolls).toEqual([2400]);
  });

  it('stops when the block goes (the run ended), and gives up after 5 s of a page that keeps moving', async () => {
    let block: ReturnType<typeof el> | null = el('by-date', 1, 1500);
    const v = fakeView(100);
    const gone = holdInView(() => block as never, v.view);
    v.tick(200);
    block = null;
    v.tick(100);
    expect(await gone).toBe('gone');

    const busy = el('full', 1, 1000);
    const w = fakeView(100);
    const timeout = holdInView(() => busy as never, w.view);
    for (let i = 0; i < 60; i++) {
      busy.top += 50;
      w.tick(100);
    }
    expect(await timeout).toBe('timeout');
  });

  it('ignores a pixel of rounding', async () => {
    const block = el('full', 1, 2000);
    const v = fakeView(100);
    const done = holdInView(() => block as never, v.view);
    block.top = 2001.6;
    v.tick(1600);
    expect(await done).toBe('settled');
    expect(v.scrolls).toEqual([1900]);
  });

  it('the progress bar marks itself, so the block can go just under it', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const bar = fs.readFileSync(path.join(__dirname, '../components/auto/RunProgressBar.vue'), 'utf8');
    expect(bar).toMatch(/\sdata-run-bar\s/);
  });
});
