/** "Try: stronger check" (prototype): what the panel shows for each state (StrongerCheckView.vue). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import StrongerCheckView from './StrongerCheckView.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import type { Priced, RefineView } from '@/search/strongerCheck';

const START = 1_790_000_000;
const DAY = 86400;
const DEADLINE = START + 280 * DAY;
const p = (chain: number[], days: number, endTE = chain[chain.length - 1]): Priced => ({
  chain,
  seconds: days * DAY,
  end: START + days * DAY,
  endTE,
});
const idleRefine = (over: Partial<RefineView> = {}): RefineView => ({
  plan: null,
  status: 'idle',
  progress: null,
  outcome: null,
  startBase: null,
  blocked: '',
  can: true,
  percent: 0,
  timeLeft: '',
  error: '',
  ...over,
});
const base = (over: Record<string, unknown> = {}) => ({
  on: true,
  target: 490,
  zone: 'UTC',
  waitingFor: '',
  best: p([175, 225, 490], 200),
  bestNow: null,
  autoStatus: 'done',
  autoText: '',
  earlier: [],
  steps: [],
  stepSkipped: '',
  refine: idleRefine(),
  ...over,
});
const text = async (over: Record<string, unknown> = {}) => textOf(await renderHtml(StrongerCheckView, base(over)));

describe('StrongerCheckView', () => {
  it('off: the labelled toggle and one line about it, nothing else', async () => {
    const t = await text({ on: false });
    expect(t).toMatch(/^Try: stronger check prototype After Check exactly, also prices your own earlier routes/);
    expect(t).not.toContain('Your earlier routes');
    // Refine was retired (decision A): the line points to Search around this answer instead.
    expect(t).not.toContain('Refine');
    expect(t).toContain('To search the routes near the best one, use Nearby routes below.');
  });

  it('by a date the line mentions the TE lower', async () => {
    expect(await text({ on: false, deadline: DEADLINE })).toContain('and tries a TE lower when the top route misses it');
  });

  it('waiting for Check exactly', async () => {
    const t = await text({ waitingFor: 'Starts when Check exactly has finished.', autoStatus: 'idle' });
    expect(t).toContain('Starts when Check exactly has finished.');
  });

  it('earlier routes: labelled, where from, priced, against the answer above; Best now when one beats it', async () => {
    const sooner = p([176, 226, 490], 199.5);
    const t = await text({
      earlier: [
        {
          route: { chain: [176, 226, 490], source: 'board', at: (START - 8 * DAY) * 1000 },
          priced: sooner,
          made: sooner,
        },
        {
          route: { chain: [180, 230, 490], source: 'check' },
          priced: p([180, 230, 490], 201),
          made: p([180, 230, 490], 201),
        },
        { route: { chain: [170, 490], source: 'saved-search' }, priced: null, made: null },
      ],
      bestNow: { p: sooner, how: 'Your earlier route, from your board run.' },
    });
    expect(t).toContain('Best now · found by the stronger check 176 → 226 → 490');
    expect(t).toContain('0.50 days sooner than the answer above');
    expect(t).toContain('Your earlier route, from your board run. Simulate this plan');
    // Folded by default behind one line with the count (13 Oct); the routes are still in the page.
    expect(t).toMatch(/\d+ routes priced on this save · Show/);
    expect(t.match(/your earlier route/g)?.length).toBe(3);
    expect(t).toContain('From your board run, sent');
    expect(t).toContain('From your earlier check');
    expect(t).toContain('1.00 days later than the answer above');
    expect(t).toContain("The full simulator couldn't price it on this save.");
  });

  it('none found says where it looked', async () => {
    const t = await text();
    expect(t).toContain('None for this target beyond the routes above');
    expect(t).toContain('your board runs (sent from this browser or another)');
  });

  it('by a date: an earlier route that misses, lowered, and one that misses even lower', async () => {
    const lowered = p([168, 220, 247], 279);
    const t = await text({
      deadline: DEADLINE,
      best: p([170, 222, 247], 279.5),
      earlier: [
        { route: { chain: [168, 220, 249], source: 'saved-answer' }, priced: p([168, 220, 249], 281), made: lowered },
        { route: { chain: [160, 200, 250], source: 'last-search' }, priced: p([160, 200, 250], 283), made: null },
      ],
    });
    expect(t).toContain('Misses the date as it was; with its last stop at 247: 247 TE · 1.00 days to spare');
    expect(t).toContain('0.50 days more to spare than the answer above');
    expect(t).toContain('Misses the date on your account by 3.00 days, and one or two TE lower too.');
  });

  it('by a date: the step-down, made and missed', async () => {
    const t = await text({
      deadline: DEADLINE,
      steps: [
        { target: 247, tried: [p([170, 220, 247], 281)], made: null },
        { target: 246, tried: [], made: p([168, 219, 246], 278.9) },
      ],
    });
    expect(t).toContain(
      "The instant answer's fastest routes to 247 TE miss the date on your account too (the closest by 1.00 days)."
    );
    expect(t).toContain(
      "so the instant answer's fastest route to 246 TE was checked: 168 219 246 makes it with 1.10 days to spare."
    );
    const skipped = await text({ deadline: DEADLINE, stepSkipped: 'Put back from a saved answer.' });
    expect(skipped).toContain('A TE lower Put back from a saved answer.');
  });

});

describe('InstantRoute wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('./InstantRoute.vue', import.meta.url)), 'utf8');
  it('runs the integrity probe and holds the routes back while it holds them', () => {
    expect(src).toMatch(/useIntegrityProbe\(\(\) => useInitialStateStore\(\)\.playerId\)/);
    expect(src).toContain('<InstantIntegrity v-if="status !== \'loading\' && !atTarget" :state="integrity" />');
    expect(src).toContain('<template v-if="!integrityHold">');
    // The exact check never runs for a blocked account.
    expect(src).toMatch(/if \(store\.integrityBlocked\) \{\s*exactStatus\.value = 'idle';\s*return;/);
  });
  it('mounts the stronger check under the answer', () => {
    expect(src).toContain('<StrongerCheck');
    expect(src).toContain(':ctx="findCtx"');
  });
});

describe('StrongerCheckView: no Refine (decision A)', () => {
  it('shows no Refine button even with a plan to refine', async () => {
    const html = await renderHtml(
      StrongerCheckView,
      base({ refine: idleRefine({ plan: { base: p([175, 225, 490], 200), text: 'x' } }) })
    );
    expect(html).not.toContain('stronger-refine');
    expect(textOf(html)).not.toContain('Refine the best route');
  });
});
