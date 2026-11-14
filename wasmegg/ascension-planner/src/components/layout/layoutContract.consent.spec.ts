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

describe('the consent box at the top of every tab (one line since 14 Nov 2026: Jordan wants it the first thing people see)', () => {
  it('App.vue draws it once, at the top, Chain Finder included', () => {
    const app = read('App.vue');
    expect(app).toContain('<StudyBox v-if="playerId && chainSearchStore.submitUrl" class="mt-3" />');
    expect(app).not.toContain('studyBelowAnswer');
    expect(app.match(/<StudyBox\b/g)).toHaveLength(1);
  });
  it('the two answer screens do not draw it any more (one box on the page)', () => {
    for (const f of ['components/auto/FastestRoute.vue', 'components/auto/DeadlinePanel.vue']) expect(read(f)).not.toContain('<StudyBox');
  });
});
