/**
 * R7 red-team #3 (31 Oct 2026): the Build-up tracker is Right now's shown goal's. With a route followed for ANOTHER goal
 * (Egg Day followed, Fastest to 490 shown), it said "follow a route first" although a route was followed. Now it names
 * the goal the route is followed for, with a button that shows it (MyRunsView `trackerFollowedFor`, `page.selectGoal`).
 * Without any follow the words are as before. Rendered on the server, fixed clock. Words DRAFT (Words).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { mt, ZONE } from '@/lib/buildUpTracker.fixture';

const props = (over: Record<string, unknown> = {}) => ({
  state: 'noRoute' as const,
  open: false,
  result: null,
  ticks: new Set<string>(),
  summary: null,
  now: mt(10, 30, 12, 10),
  zone: ZONE,
  saveSeconds: mt(10, 30, 12, 5),
  ...over,
});

describe('BuildUpTracker: a route followed for another goal', () => {
  it('names that goal instead of "follow a route first", with a 44 px button that shows it', async () => {
    const html = await renderHtml(BuildUpTracker, props({ followedFor: { key: 'eggday-2027', name: 'Egg Day 2027' } }));
    const text = textOf(html);
    expect(text).not.toContain('follow a route first');
    expect(text).not.toContain('Follow a route on Right now');
    expect(text).toContain('Build-up tracker your route is for Egg Day 2027');
    expect(text).toContain("Your followed route is for Egg Day 2027. Its build-up shows here when Right now shows that goal.");
    expect(html).toMatch(/<button[^>]*data-testid="buildup-show-followed"[^>]*data-goal="eggday-2027"/);
    expect(html).toMatch(/<button[^>]*min-h-\[44px\][^>]*data-testid="buildup-show-followed"/);
    expect(text).toContain('Show Egg Day 2027');
  });

  it('no follow anywhere: as before', async () => {
    const text = textOf(await renderHtml(BuildUpTracker, props()));
    expect(text).toContain('Build-up tracker follow a route first');
    expect(text).toContain('Follow a route on Right now and its build-up shows here.');
  });

  it('MyRunsView passes the followed goal while the shown one has no follow, and the button picks it', () => {
    const src = fs.readFileSync(path.join(__dirname, '../MyRunsView.vue'), 'utf8');
    expect(src).toContain(':followed-for="trackerFollowedFor"');
    expect(src).toContain('@show-goal="page.selectGoal"');
    expect(src).toMatch(/const trackerFollowedFor = computed\(/);
  });
});
