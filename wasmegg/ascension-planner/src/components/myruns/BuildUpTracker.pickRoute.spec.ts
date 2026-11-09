/**
 * Kenzie (a new tester, 9 Nov 2026) could not find how to pick a route: the Build-up tracker said "follow a route
 * first" with no way to do it. With no route followed anywhere it now has a 44 px button that opens the shown goal's
 * screen (Fastest to its target, or By a date / Egg Day for a dated goal; Fastest to 490 when no goal is shown) and
 * scrolls to that screen's instant answer, where Follow this route is (lib/pickRoute.ts). With a route followed for
 * another goal the "Show <goal>" button stays as it was. Rendered on the server, fixed clock, fake document. Words DRAFT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { PICK_ROUTE_WORDS, pickRouteOpen, scrollToInstantAnswer } from '@/lib/pickRoute';

const props = (over: Record<string, unknown> = {}) => ({
  state: 'noRoute' as const,
  open: true,
  result: null,
  ticks: new Set<string>(),
  summary: null,
  now: mt(10, 30, 12, 10),
  zone: ZONE,
  saveSeconds: mt(10, 30, 12, 5),
  ...over,
});

describe('BuildUpTracker: nothing followed has a way to pick a route', () => {
  it('a 44 px button under the line, that asks the page to pick a route', async () => {
    const html = await renderHtml(BuildUpTracker, props());
    const tag = html.match(/<button[^>]*data-testid="buildup-pick-route"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('type="button"');
    expect(tag).toContain('min-h-[44px]');
    expect(textOf(html)).toContain(PICK_ROUTE_WORDS);
    const src = fs.readFileSync(path.join(__dirname, 'BuildUpTracker.vue'), 'utf8');
    expect(src).toMatch(/data-testid="buildup-pick-route"\s+@click="emit\('pickRoute'\)"/);
  });

  it('not with a route followed for another goal (Show <goal> instead), nor in the other states', async () => {
    expect(await renderHtml(BuildUpTracker, props({ followedFor: { key: 'eggday-2027', name: 'Egg Day 2027' } }))).not.toContain(
      'buildup-pick-route'
    );
    for (const state of ['noSave', 'notBuilding', 'working', 'failed'] as const)
      expect(await renderHtml(BuildUpTracker, props({ state }))).not.toContain('buildup-pick-route');
  });

  it('MyRunsView opens the goal and scrolls to its instant answer on the press', () => {
    const src = fs.readFileSync(path.join(__dirname, '../MyRunsView.vue'), 'utf8');
    expect(src).toContain('@pick-route="pickRouteToFollow"');
    expect(src).toMatch(/function pickRouteToFollow\(\): void \{[\s\S]*?emit\('open', pickRouteOpen\([\s\S]*?scrollToInstantAnswer\(/);
  });
});

describe('pickRouteOpen: the screen the press opens', () => {
  const fastest = { key: 'fastest-400', open: { auto: 'fastest' as const, depth: 'smart' as const, target: 400 } };
  const eggDay = { key: 'eggday-2027', open: { auto: 'by-date' as const, byDate: { eggDay: true as const } } };
  it('the goal Right now shows', () => {
    expect(pickRouteOpen([fastest, eggDay], 'eggday-2027')).toEqual(eggDay.open);
    expect(pickRouteOpen([fastest, eggDay], 'fastest-400')).toEqual(fastest.open);
  });
  it('none shown: Fastest to 490', () => {
    expect(pickRouteOpen([], null)).toEqual({ auto: 'fastest', depth: 'smart', target: 490 });
    expect(pickRouteOpen(undefined, 'gone')).toEqual({ auto: 'fastest', depth: 'smart', target: 490 });
  });
});

describe('scrollToInstantAnswer: once the screen is drawn', () => {
  const el = (shown: boolean) => ({ getClientRects: () => (shown ? [{}] : []), scrollIntoView: vi.fn() });
  it('waits for a laid-out instant answer (the other screen’s is hidden), then scrolls it into view', () => {
    vi.useFakeTimers();
    const hidden = el(false);
    const shown = el(true);
    let drawn: ReturnType<typeof el>[] = [];
    const doc = { querySelectorAll: vi.fn(() => drawn) };
    scrollToInstantAnswer(doc as never);
    vi.advanceTimersByTime(250);
    expect(shown.scrollIntoView).not.toHaveBeenCalled();
    drawn = [hidden, shown];
    vi.advanceTimersByTime(250);
    expect(doc.querySelectorAll).toHaveBeenCalledWith('[data-testid="section-instant"]');
    expect(hidden.scrollIntoView).not.toHaveBeenCalled();
    expect(shown.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(shown.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    vi.advanceTimersByTime(5000);
    expect(shown.scrollIntoView).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('gives up after a few seconds without one', () => {
    vi.useFakeTimers();
    const doc = { querySelectorAll: vi.fn(() => []) };
    scrollToInstantAnswer(doc as never);
    vi.advanceTimersByTime(20_000);
    const calls = doc.querySelectorAll.mock.calls.length;
    vi.advanceTimersByTime(20_000);
    expect(doc.querySelectorAll.mock.calls.length).toBe(calls);
    expect(calls).toBeLessThanOrEqual(30);
    vi.useRealTimers();
  });
});
