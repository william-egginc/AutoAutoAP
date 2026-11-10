/**
 * Help improve the planner (the consent box) on the simpler default page (Jordan, 9 Nov 2026, Q2): on Fastest and By a
 * date (where a new player lands) it sits BELOW the answer, between What to do now and More; on every other screen it
 * shows where it always did, at the top. One box on the page at a time, its words unchanged (StudyBox.vue renders
 * StudyForm's text; lib/aboutPage.spec.ts pins it against about.html). Read from the source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tpl = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

describe('the consent box below the answer on the answer screens', () => {
  for (const f of ['components/auto/FastestRoute.vue', 'components/auto/DeadlinePanel.vue'])
    it(f, () => {
      const t = tpl(read(f));
      const at = ['data-region="answer"', '<NowLine', '<StudyBox', '<MoreFold'].map(m => t.indexOf(m));
      expect(at.every(i => i >= 0), String(at)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(t.match(/<StudyBox\b/g)).toHaveLength(1);
      expect(t).toContain('<StudyBox v-if="store.submitUrl" />');
    });
  it('App.vue keeps it at the top of every other screen, and not on those two (one box at a time)', () => {
    const app = read('App.vue');
    expect(app).toContain('<StudyBox v-if="playerId && chainSearchStore.submitUrl && !studyBelowAnswer" class="mt-3" />');
    expect(app).toContain("const studyBelowAnswer = computed(() => plannerTab.value === 'automatic' && autoView.value !== 'classic');");
  });
  it('the box itself is unchanged: drawn the same way in both places, with no prop of its own', () => {
    for (const f of ['components/auto/FastestRoute.vue', 'components/auto/DeadlinePanel.vue']) expect(read(f)).toContain('<StudyBox v-if="store.submitUrl" />');
    expect(read('App.vue')).toMatch(/<StudyBox v-if="[^"]*" class="mt-3" \/>/);
  });
});
