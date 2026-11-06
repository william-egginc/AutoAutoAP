/**
 * Share (UX fluff review 2, 5 Nov 2026, items C9/S1, C10/S2 and S3): Custom's Share this result opens with one sentence;
 * what the random code does moves behind "Show exactly what is sent"; the consent stays word for word. The unsent-result
 * box near Run leaves out the result whose own Share this result is on the page (its second send path and second copy
 * of the consent), and keeps every other kept result. New wording is DRAFT for Words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import type { Submission } from '@/search/submission';
import UnsentResults from './UnsentResults.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const payload = { schema: 8, chain: [250, 313], finalTE: 313 } as unknown as Submission;

describe("Custom's Share this result (InsanePanel.vue)", () => {
  const panel = read('InsanePanel.vue');
  const intro = panel.slice(panel.indexOf('<template #intro>'), panel.indexOf('</template>', panel.indexOf('<template #intro>')));
  it('one sentence before the consent (C9/S1)', () => {
    expect(intro).not.toContain('A Custom result is the most useful thing');
    expect(intro).not.toContain('The Leaderboard uses the random code');
    expect(intro).toContain('Sends the space it covered, its best route and the runners-up');
  });
  it('what the random code does is behind "Show exactly what is sent", word for word (C10/S2)', () => {
    const note = panel.slice(panel.indexOf('<template #payload-note>'));
    expect(note).toMatch(/The Leaderboard uses the random code so that a run landing on the flagged Leaderboard shows to you as yours/);
    expect(read('BoardSubmitButtons.vue')).toMatch(/v-if="showPayload && \$slots\['payload-note'\]"/);
  });
  it('the consent text is untouched (ShareResult.vue)', () => {
    expect(read('ShareResult.vue')).toContain(
      'I acknowledge the following: I want to share this result on the leaderboard. I understand it sends the route,'
    );
  });
});

describe('the unsent box near Run (UnsentResults.vue, S3)', () => {
  const pending = (id: string, key: string) =>
    ({ id, kind: 'deadline', key, label: `${id} TE by Oct 30, 2026`, createdAt: Date.now(), payload, consent: null }) as never;
  it('leaves out the result whose Share this result is on the page, keeps the others', async () => {
    const p = createPinia();
    setActivePinia(p);
    useChainSearchStore().pendingSends = [pending('313', 'deadline:1'), pending('300', 'deadline:2')];
    const t = textOf(await renderHtml(UnsentResults, { playerId: 'EI1234567890123456', kind: 'deadline', hideKey: 'deadline:1' }, {}, [p]));
    expect(t).not.toContain('313 TE by');
    expect(t).toContain('300 TE by');
    expect(t.match(/I acknowledge the following/g)).toHaveLength(1);
  });
  it('every panel passes the key of the result its Share this result shows', () => {
    expect(read('RunControls.vue')).toMatch(/<UnsentResults[^>]*:hide-key="shareShownKey"/);
    for (const f of ['InsanePanel.vue', 'ChainSearchPanel.vue', 'DeadlinePanel.vue'])
      expect(read(f), f).toMatch(/:share-shown-key="shareShownKey"/);
  });
});
