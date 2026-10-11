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
    expect(t).not.toContain('Refine');
  });

  it('by a date the line mentions the TE lower', async () => {
    expect(await text({ on: false, deadline: DEADLINE })).toContain('tries a TE lower when the top route misses it');
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
    expect(t.match(/your earlier route/g)?.length).toBe(3);
    expect(t).toContain('From your board run, sent');
    expect(t).toContain('From your earlier check');
    expect(t).toContain('1.00 days later than the answer above');
    expect(t).toContain("The full simulator couldn't price it on this save.");
  });

  it('none found says where it looked', async () => {
    const t = await text();
    expect(t).toContain('None for this target beyond the routes above');
    expect(t).toContain('your board runs sent from this browser');
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

  it('refine: the estimate and button, greyed out with the reason', async () => {
    const plan = {
      base: p([175, 225, 490], 200),
      text: 'Checks all 24 routes within 2 TE of each stop (every TE): about 2 min on 8 workers.',
    };
    const t = await text({ refine: idleRefine({ plan }) });
    expect(t).toContain('Refine the best route Around 175 225 490 . Checks all 24 routes');
    expect(t).toMatch(/Refine$/);
    const html = await renderHtml(
      StrongerCheckView,
      base({ refine: idleRefine({ plan, can: false, blocked: 'Waits while a search is running.' }) })
    );
    expect(html).toMatch(/disabled[^>]*data-testid="stronger-refine-go"|data-testid="stronger-refine-go"[^>]*disabled/);
    expect(textOf(html)).toContain('Waits while a search is running.');
  });

  it('refine running: progress, time left, best so far, Stop', async () => {
    const start = p([175, 225, 490], 200);
    const t = await text({
      refine: idleRefine({
        plan: { base: start, text: '' },
        status: 'running',
        startBase: start,
        progress: { done: 120, total: 625, priced: 120, best: p([176, 225, 490], 199.8) },
        percent: 19,
        timeLeft: 'about 4 min left',
      }),
    });
    expect(t).toContain('Checked 120 of 625 routes · about 4 min left · best so far 0.20 days sooner Stop');
  });

  it('refine done: found better, or this route holds', async () => {
    const start = p([175, 225, 490], 200);
    const better = await text({
      refine: idleRefine({
        plan: { base: p([176, 225, 490], 199.8), text: 'x' },
        status: 'done',
        startBase: start,
        outcome: {
          done: 625,
          total: 625,
          priced: 625,
          best: p([176, 225, 490], 199.8),
          improved: true,
          stopped: false,
        },
      }),
    });
    expect(better).toContain(
      'Found a better route among 625 priced: 176 225 490 , 0.20 days sooner than the route it started from.'
    );
    expect(better).toContain('Refine again');
    const holds = await text({
      refine: idleRefine({
        plan: { base: start, text: 'x' },
        status: 'done',
        startBase: start,
        outcome: { done: 300, total: 625, priced: 300, best: start, improved: false, stopped: true },
      }),
    });
    expect(holds).toContain(
      'Nothing better among 300 routes priced within 2 TE of each stop (stopped after 300 of 625): this route holds.'
    );
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
