/**
 * Earlier unfinished runs (UnfinishedRuns.vue). 13 Oct: folded by default into one line, except runs from the last 6 hours
 * ("2 older runs, the newest 5 days ago") with Show; recent ones are listed as before.
 * Specs render on the server (no DOM), so Show's click is its `showOld` ref set through the
 * component's setup state before it renders.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import UnfinishedRuns from './UnfinishedRuns.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { textOf } from '@/test/renderComponent';
import type { SearchCheckpoint } from '@/search/persistence';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

/** A staged (no `space`) unfinished run, last written `ageMs` ago, with `n` plans priced. */
function run(ageMs: number, n: number, bestChain: number[]): SearchCheckpoint {
  return {
    version: 1,
    fingerprint: `fp-${n}`,
    effort: 'normal',
    seedChain: [],
    bestChain,
    bestSeconds: 1000,
    bestLegs: [],
    durations: Array.from({ length: n }, (_, i) => [`k${i}`, i] as [string, number]),
    stage: 'x',
    detail: '',
    chainsDone: n,
    complete: false,
    updatedAt: Date.now() - ageMs,
  } as unknown as SearchCheckpoint;
}

async function render(runs: SearchCheckpoint[], showOld = false): Promise<string> {
  const store = useChainSearchStore();
  store.interrupted = runs;
  const app = createSSRApp({ render: () => h(UnfinishedRuns, { playerId: 'p1', kind: 'staged' }) });
  app.use(pinia);
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (showOld && this.$.type.__file?.endsWith('/UnfinishedRuns.vue')) this.$.setupState.showOld = true;
    },
  });
  return renderToString(app);
}

describe('UnfinishedRuns', () => {
  const mixed = () => [run(2 * HOUR, 11, [1, 2]), run(5 * DAY, 22, [3, 4]), run(6 * DAY, 33, [5, 6])];

  it('lists the recent run with Carry on, and folds the two old ones into one line', async () => {
    const html = await render(mixed());
    const t = textOf(html);
    expect(t).toContain('Earlier unfinished runs');
    expect(t).toContain('11 plans priced, best 1 2 · 2 h ago');
    expect(t).toContain('Carry on');
    expect(html).toContain('data-testid="unfinished-old"');
    expect(html).toContain('data-testid="unfinished-old-show"');
    expect(t).toContain('2 older runs, the newest 5 days ago');
    expect(t).not.toContain('22 plans priced');
    expect(t).not.toContain('33 plans priced');
  });

  it('Show lists the old runs too, and the one line goes', async () => {
    const html = await render(mixed(), true);
    const t = textOf(html);
    expect(html).not.toContain('unfinished-old"');
    expect(t).toContain('11 plans priced');
    expect(t).toContain('22 plans priced, best 3 4 · 5 days ago');
    expect(t).toContain('33 plans priced, best 5 6 · 6 days ago');
    expect(t.match(/Carry on/g)).toHaveLength(3);
  });

  it('one run, not from the last few hours: "1 unfinished run", folded', async () => {
    const t = textOf(await render([run(3 * DAY, 5, [1])]));
    expect(t).toContain('1 unfinished run, the newest 3 days ago');
    expect(t).not.toContain('Carry on');
  });

  it('a run from this page\'s last visit (5 h) stays open; one from 7 h ago folds', async () => {
    const open = textOf(await render([run(5 * HOUR, 8, [1])]));
    expect(open).toContain('8 plans priced');
    expect(open).toContain('Carry on');
    expect(open).not.toContain('unfinished run,');
    const folded = textOf(await render([run(7 * HOUR, 8, [1])]));
    expect(folded).toContain('1 unfinished run, the newest 7 h ago');
    expect(folded).not.toContain('Carry on');
  });

  it('every run old: the header still shows, with just the one line and no rows', async () => {
    const html = await render([run(5 * DAY, 22, [3]), run(6 * DAY, 33, [4])]);
    const t = textOf(html);
    expect(t).toContain('Earlier unfinished runs');
    expect(t).toContain('2 unfinished runs, the newest 5 days ago');
    expect(t).not.toContain('Carry on');
    expect(t).not.toContain('plans priced');
  });

  it('nothing at all with no runs', async () => {
    expect(await render([])).not.toContain('Earlier unfinished runs');
  });
});
