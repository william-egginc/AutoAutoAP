/**
 * "Follow this route" on the search results (Jordan, 23 Oct 2026: "I can't follow the fast results"): Fastest's card
 * (RouteResultCard.vue) and By a date's (ByDateRouteCard.vue) carry the FollowButton with the result's finish, TE,
 * plan start and level, 44 px on a phone; each screen that shows a finished result passes it (Fast/Exact on Fastest,
 * Exhaustive's Custom, By a date's), and the rows of the boxes' results and of "Best for each stop count" too.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = new URL('./', import.meta.url).pathname;
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const tags = (s: string) => [...s.matchAll(/<FollowButton\b[^>]*>/g)].map(m => m[0]);

describe('Follow this route on every result card', () => {
  it('both result cards have a FollowButton with :finish=, the source, TE and plan start, primary (44 px on a phone)', () => {
    for (const f of ['RouteResultCard.vue', 'ByDateRouteCard.vue']) {
      const card = read(f);
      const t = tags(card);
      expect(t, f).toHaveLength(1);
      for (const attr of ['v-if="follow"', 'primary', ':finish="follow.finish"', ':source="follow.source"', ':end-t-e="follow.endTE"', ':plan-start="follow.planStart"', ':goal-key="follow.goalKey"'])
        expect(t[0], `${f} ${attr}`).toContain(attr);
      expect(card).toContain('follow?: ResultFollow | null;');
    }
    // Finished answers only on By a date (the best so far has only Simulate).
    const byDate = read('ByDateRouteCard.vue');
    expect(byDate.indexOf('<FollowButton')).toBeGreaterThan(byDate.indexOf('<template v-if="!running">'));
    expect(byDate).toContain('(follow && !running)" #actions');
  });

  it('each screen with a finished result passes it: Fast/Exact (Fastest), Exhaustive (Custom), By a date', () => {
    expect(read('ChainSearchPanel.vue')).toContain(':follow="fastFollow"');
    expect(read('InsanePanel.vue')).toContain(':follow="customFollow"');
    expect(read('DeadlinePanel.vue')).toContain(':follow="dateFollow"');
    // The level is the source (fast, exact, custom), never a fixed one.
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue'])
      expect(read(f)).toContain("source: sourceOfLevel(levelOfRun({ custom: store.runKindUsed === 'full', effort: store.runSettingsUsed?.effort }))");
    expect(read('DeadlinePanel.vue')).toContain('sourceOfLevel(foundLevel({ custom: !r.simple, effort: r.level }))');
    // By a date: only a route that makes the date.
    expect(read('DeadlinePanel.vue')).toContain('followableAnswer(best.value, r.deadline)');
  });

  it('Dig deeper rows: the boxes\' results (Exhaustive) and Best for each stop count (By a date), 44 px on a phone, with the finish', () => {
    for (const [f, finish] of [
      ['InsanePanel.vue', ':finish="q.finish"'],
      ['DeadlinePanel.vue', ':finish="r.reachAt"'],
    ] as const) {
      const row = tags(read(f)).find(t => t.includes(finish));
      expect(row, f).toBeTruthy();
      expect(row).toContain('class="min-h-[44px] sm:min-h-0"');
      expect(row).toContain(':source="');
    }
  });
});
