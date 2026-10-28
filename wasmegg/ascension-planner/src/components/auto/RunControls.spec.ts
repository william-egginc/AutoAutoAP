/** RunControls.vue (12 Oct): the order of the blocks, and Find greyed out for the other search. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import fs from 'node:fs';
import path from 'node:path';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import RunControls from './RunControls.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { renderHtml, textOf } from '@/test/renderComponent';
import { SET_UP_KEY, stepAwayNudge } from '@/composables/useStepAwayNudge';
import { resetConsents } from '@/composables/useConsent';

let pinia: Pinia;
let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  pinia = createPinia();
  setActivePinia(pinia);
  resetConsents(null);
  stepAwayNudge.value = null;
});

const props = {
  kind: 'smart',
  playerId: 'x',
  findDisabled: false,
  running: false,
  showSubmit: true,
  canCarryOn: false,
  report: { own: false },
  optIn: false,
  anonymous: true,
  nickname: '',
  note: '',
};
const render = (p: Record<string, unknown> = {}, slots = {}) =>
  renderHtml(RunControls, { ...props, ...p }, slots, [pinia]);

describe('RunControls', () => {
  it('puts the progress after the acknowledge box and Stepping away?', async () => {
    const html = await render({}, { progress: () => h('div', { 'data-testid': 'p' }, 'P') });
    const share = html.indexOf('data-testid="share-box"');
    const away = html.indexOf('Stepping away?');
    const progress = html.indexOf('data-testid="p"');
    expect(share).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(share);
    expect(progress).toBeGreaterThan(away);
  });

  describe('Find greyed out for the other search', () => {
    // A Smart search is going (no search space set): runProgress.kind is 'smart'.
    const smartRuns = () => {
      const store = useChainSearchStore();
      store.isRunning = true;
      expect(store.runProgress?.kind).toBe('smart');
    };
    it('Fastest\'s Exhaustive (full) names Fast and Exact while it runs', async () => {
      smartRuns();
      const html = await render({ kind: 'full' });
      expect(html).toContain('data-testid="find-blocked"');
      expect(textOf(html)).toContain('Fast and Exact is running');
      expect(html).toContain('data-testid="find-blocked-jump"');
    });
    it('the screen that is itself running says nothing', async () => {
      smartRuns();
      expect(await render({ kind: 'smart' })).not.toContain('find-blocked"');
    });
    it('By a date is never blocked this way', async () => {
      smartRuns();
      expect(await render({ kind: 'by-date' })).not.toContain('data-testid="find-blocked"');
    });
  });
});

describe('Run on a long run opens Stepping away? (28 Oct 2026, ux35-d)', () => {
  /** Render, then press Run (FindBar's `find`) through RunControls' own handler; what the screen was told. */
  async function pressRun(p: Record<string, unknown>): Promise<boolean[]> {
    const finds: boolean[] = [];
    const app = createSSRApp({ render: () => h(RunControls, { ...props, ...p, onFind: (s: boolean) => finds.push(s) } as never) });
    app.use(pinia);
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/RunControls.vue')) (this.$.setupState.onFind as (s: boolean) => void)(true);
      },
    });
    await renderToString(app);
    return finds;
  }

  it('over an hour: the run still starts, and the box of its own kind opens', async () => {
    expect(await pressRun({ estimateSeconds: 2 * 3600 })).toEqual([true]);
    expect(stepAwayNudge.value).toBe('smart');
    stepAwayNudge.value = null;
    await pressRun({ kind: 'full', estimateSeconds: 5 * 3600 });
    expect(stepAwayNudge.value).toBe('sweep');
    stepAwayNudge.value = null;
    await pressRun({ kind: 'by-date', estimateSeconds: 3601 });
    expect(stepAwayNudge.value).toBe('deadline');
  });

  it('an hour or less, or no estimate: the run starts and the box stays closed', async () => {
    expect(await pressRun({ estimateSeconds: 3600 })).toEqual([true]);
    expect(await pressRun({})).toEqual([true]);
    expect(stepAwayNudge.value).toBe(null);
  });

  it('already set up in this browser: not opened', async () => {
    mem.set(SET_UP_KEY, '1');
    expect(await pressRun({ estimateSeconds: 9 * 3600 })).toEqual([true]);
    expect(stepAwayNudge.value).toBe(null);
  });

  it('every screen gives its run estimate (the one it shows) to the run controls', () => {
    const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue', 'DeadlinePanel.vue'])
      expect(read(f), f).toMatch(/<RunControls\b[\s\S]{0,200}?\s:estimate-seconds="/);
  });
});
