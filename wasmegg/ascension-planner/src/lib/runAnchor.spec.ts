import { describe, expect, it } from 'vitest';
import { findRunBlock, runAnchorSelector, scrollToRun } from './runAnchor';

/** A stand-in element: `rects` 0 is "not shown" (display:none, or a hidden screen). */
function el(kind: string, rects = 1) {
  return {
    kind,
    scrolled: 0,
    getClientRects: () => ({ length: rects }),
    scrollIntoView() {
      this.scrolled++;
    },
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
    expect(await scrollToRun('by-date', p)).toBe(true);
    expect(block.scrolled).toBe(1);
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
