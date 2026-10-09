/**
 * Find / Find and submit / Send best so far (FindBar.vue): what the bar and its share box show before
 * and during a run. Review, 9 Oct: the CSV and diagnostics boxes vanished once a search started,
 * though they apply to the send at the end; a Send best so far press left no clear next step; and the
 * hint under Find and submit said only "Please tick the box below".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import FindBar from './FindBar.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { renderHtml, textOf } from '@/test/renderComponent';

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
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
});
afterEach(() => vi.unstubAllGlobals());

const base = { findDisabled: false, running: false, optIn: false, anonymous: true, nickname: '' };
const render = async (props: Record<string, unknown>) =>
  textOf(await renderHtml(FindBar, { ...base, ...props }, {}, [pinia]));

describe('FindBar', () => {
  it('says how to use Find and submit until the box is ticked', async () => {
    const t = await render({});
    expect(t).toContain('To use Find and submit, please tick the box below.');
    expect(t).not.toMatch(/(^|[^,] )Please tick the box below/);
    expect(t).toContain('I acknowledge the following');
    expect(await render({ optIn: true })).not.toContain('To use Find and submit, please tick the box below.');
  });

  for (const goalWord of ['target', 'deadline'] as const) {
    it(`keeps the CSV and diagnostics boxes during a run (${goalWord})`, async () => {
      const t = await render({ running: true, goalWord, optIn: true });
      expect(t).toContain('Send my CSV too');
      expect(t).toContain('Also send diagnostics');
      expect(t).toContain('Tick this by default from now on');
      expect(t).toContain('you can still change these');
      // The name for the send at the end, once agreed.
      expect(t).toContain('Submit anonymously');
      // The consent wording is for starting, or for Send best so far asking: not repeated mid-run.
      expect(t).not.toContain('I acknowledge the following');
    });
  }

  it('says the run sends these when it finishes, for a Find and submit run', async () => {
    useChainSearchStore().submitsWhenDone = true;
    expect(await render({ running: true, optIn: true })).toContain('Sent with the result when the run finishes');
  });

  it('after a Send best so far press: ticking sends, the name comes first, and both places say so', async () => {
    const store = useChainSearchStore();
    store.beginBestSoFar('deadline', null);
    store.askBestSoFar(true);
    const t = await render({ running: true, goalWord: 'deadline', bestSoFarKind: 'deadline' });
    expect(t).toContain('To use Send best so far, please read this and tick the box to agree');
    expect(t).toContain(
      'Your best so far is sent as soon as you tick it, anonymously or under the name you choose below'
    );
    expect(t).toContain('Tick the box below and it sends straight away');
    expect(t).toContain('Not sent yet: tick the box under Find to agree, and it sends straight away.');
    // The name choice is there before the tick, since the tick sends.
    expect(t).toMatch(/Submit anonymously.*Credit me as/);
    store.endBestSoFar();
  });

  it("the automatic option's ask does not promise a send on the tick", async () => {
    const store = useChainSearchStore();
    store.beginBestSoFar('fastest', null);
    store.askBestSoFar();
    const t = await render({ running: true, bestSoFarKind: 'fastest' });
    expect(t).toContain('Tick the box below to agree');
    expect(t).not.toContain('sent as soon as you tick it');
    store.endBestSoFar();
  });

  it('shows how a send went under the button', async () => {
    const store = useChainSearchStore();
    store.beginBestSoFar('fastest', { nickname: '' });
    store.bestSoFarStatus = { ok: false, text: 'Not sent: collector said 400: nope' };
    const html = await renderHtml(FindBar, { ...base, running: true, bestSoFarKind: 'fastest' }, {}, [pinia]);
    expect(textOf(html)).toContain('Not sent: collector said 400: nope');
    expect(html).toMatch(
      /text-red-700[^>]*data-testid="best-so-far-status"|data-testid="best-so-far-status"[^>]*text-red-700/
    );
    store.endBestSoFar();
  });
});
