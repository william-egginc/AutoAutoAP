/**
 * More's "Final target TE" boxes (Fast/Exact's in ChainSearchPanel.vue, Custom's in InsanePanel.vue). They stopped at 490
 * (spec-targette, 12 Nov 2026: Fast/Exact said 2000, Custom had no max), and since 13 Nov 2026 (Jordan's side, via the
 * orchestrator) they go through the store's one rule, `commitFinalTE`, on Enter or leaving the box, never per keystroke
 * (FinalTargetInput.vue; its spec has the behaviour). Read from the source, as the layout specs do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const template = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'));

describe('the Final target TE boxes in More', () => {
  for (const [f, n] of [['ChainSearchPanel.vue', 2], ['InsanePanel.vue', 1]] as const) {
    it(`${f}: every box is FinalTargetInput (the store's commit), none writes store.finalTE itself`, () => {
      const t = template(read(f));
      expect(t.match(/<FinalTargetInput\b/g)).toHaveLength(n);
      expect(t).not.toMatch(/v-model(\.number)?="store\.finalTE"/);
      expect(t).not.toContain('2000');
      for (const m of t.matchAll(/<input\b[^>]*>/g)) expect(m[0]).not.toContain('store.finalTE');
    });
  }
});
