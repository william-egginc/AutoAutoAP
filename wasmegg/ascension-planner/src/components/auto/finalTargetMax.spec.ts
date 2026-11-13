/**
 * Every "Final target TE" box in More stops at 490 (spec-targette, 12 Nov 2026): 490 is the ceiling (the store's restore,
 * online Setup and the collector all take 1-490), but Fast/Exact's two boxes said max 2000 and Custom's had no max. Read
 * from the source, as the layout specs do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
/** Each <input ...> bound to store.finalTE, as written in the template. */
const finalBoxes = (src: string) =>
  [...src.matchAll(/<input\b[^>]*>/g)].map(m => m[0]).filter(t => t.includes('store.finalTE'));

describe('the Final target TE boxes in More', () => {
  for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
    it(`${f}: every box has max 490, none 2000`, () => {
      const boxes = finalBoxes(read(f));
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b).not.toContain('2000');
        expect(b).toMatch(/:?max="490"/);
      }
    });
  }
});
