/**
 * THE LAYOUT CONTRACT on Highest TE by a date (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026):
 * the title and its one line, the date, the answer (always shown, no Hide), what to do now, then the one closed More
 * holding the search and the rest, in that order. The five ways in to "how it works" on this screen are one link
 * (HOW_IT_WORKS_LINK) at More's foot: the screen's own fold is gone (its words are in How this is worked out), the
 * Search card has no link of its own, and Why? and How this is worked out sit inside More. Read from the source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
/** The template without its comments (they name the regions too). */
const template = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

describe('By a date: the regions in their fixed order', () => {
  const screen = template(read('auto/ByDateScreen.vue'));
  const panel = template(read('auto/DeadlinePanel.vue'));
  it('title (the screen), then the date, the answer, what to do now and More (the panel), in this order', () => {
    expect(screen.indexOf('data-region="title"')).toBeGreaterThan(-1);
    expect(screen.indexOf('data-region="title"')).toBeLessThan(screen.indexOf('<InsanePanel'));
    const at = ['data-region="date"', 'data-region="answer"', '<NowLine', '<MoreFold'].map(m => panel.indexOf(m));
    expect(at.every(i => i >= 0), String(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('the search and the instant answer\'s extras are inside More; the save strip, the explainer fold and Hide are gone', () => {
    const more = panel.slice(panel.indexOf('<MoreFold'), panel.indexOf('</MoreFold>'));
    expect(more).toContain('<SearchPanel');
    expect(more).toContain('id="more-bydate-answer"');
    expect(more).toContain('id="more-bydate-answer-how"');
    expect(panel).toContain('more-to="more-bydate-answer"');
    expect(screen).not.toContain('<AutoSaveStrip');
    expect(screen).not.toContain('by-date-how');
    expect(panel).not.toContain('<CollapsibleSection');
    expect(panel).toContain('data-testid="section-instant"');
  });
  it('one way in to how it works: the link at More\'s foot, and the explainer\'s words kept in How this is worked out', () => {
    const more = panel.slice(panel.indexOf('<MoreFold'), panel.indexOf('</MoreFold>'));
    expect(more.match(/HOW_IT_WORKS_LINK/g)).toHaveLength(1);
    expect(panel.slice(0, panel.indexOf('<MoreFold'))).not.toMatch(/How it works|How this is worked out|science\/how/);
    expect(read('auto/SearchPanel.vue')).not.toContain('search-panel-how');
    expect(read('auto/InstantRoute.vue')).toContain(
      'Fast and Exact pick the early stops for you: the instant answer\'s route for each number of ascensions and a few'
    );
  });
  it('More opens with a run going or one to carry on, and its line names what is not at its default', () => {
    const tag = panel.slice(panel.indexOf('<MoreFold'), panel.indexOf('>', panel.indexOf('<MoreFold')));
    expect(tag).toContain('section="moreByDate"');
    expect(tag).toContain(':line="moreLineWithChanges(MORE_LINE_AUTO, moreChanges)"');
    expect(tag).toContain(':running="!!runKind"');
    expect(tag).toContain(':unfinished="!!store.deadlineUnfinished"');
  });
});
