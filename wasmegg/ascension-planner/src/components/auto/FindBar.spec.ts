/**
 * Find / Find and submit / Send best so far (FindBar.vue): what the bar and its share box show before
 * and during a run. Review, 9 Oct: the CSV and diagnostics boxes vanished once a search started,
 * though they apply to the send at the end; a Send best so far press left no clear next step; and the
 * hint under Find and submit said only "Please tick the box below".
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import FindBar from './FindBar.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useShareExtras } from '@/composables/useShareExtras';

/**
 * The Change button (and Done) only set FindBar's own `expanded` ref, and specs here render
 * on the server (no DOM, so nothing can be clicked). So: the button's presence is checked in the
 * HTML, and "clicked" is the same ref set through the component's setup state before it renders.
 */
async function renderWith(props: Record<string, unknown>, setup: Record<string, unknown> = {}): Promise<string> {
  const app = createSSRApp({ render: () => h(FindBar, { ...base, ...props }) });
  app.use(pinia);
  // `expanded` (Change pressed, Done not) is the consent box's own `open` (ConsentBox.vue).
  const { expanded, ...own } = setup;
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (this.$.type.__file?.endsWith('/FindBar.vue')) Object.assign(this.$.setupState, own);
      if (expanded !== undefined && this.$.type.__file?.endsWith('/ConsentBox.vue'))
        Object.assign(this.$.setupState, { open: expanded });
    },
  });
  return renderToString(app);
}
/** Agreed before, then Change pressed. */
const changed = (props: Record<string, unknown>) => renderWith(props, { expanded: true });

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
afterEach(() => {
  vi.unstubAllGlobals();
  // The site-wide singleton: put the extras back to their defaults.
  const extras = useShareExtras();
  extras.sendCsv.value = true;
  extras.sendDiagnostics.value = false;
});

const base = { findDisabled: false, running: false, optIn: false, anonymous: true, nickname: '' };
const render = async (props: Record<string, unknown>) =>
  textOf(await renderHtml(FindBar, { ...base, ...props }, {}, [pinia]));

describe('FindBar', () => {
  it('says how to use Find and submit until the box is ticked', async () => {
    const t = await render({});
    // Names the fold the ticks are in, as a link that opens it (UX review 26 Oct 2026, item 11).
    expect(t).toContain('To use Find and submit, open Before you send');
    expect(t).not.toMatch(/tick the box below/i);
    expect(t).toContain('I acknowledge the following');
    expect(await render({ optIn: true })).not.toContain('To use Find and submit');
    const src = fs.readFileSync(path.join(__dirname, 'FindBar.vue'), 'utf8');
    expect(src).toMatch(/data-testid="acknowledge-hint-link"\s*@click="showConsent"\s*>Before you send<\/button/);
    expect(src).toContain('await ackFold.value?.show(false);');
  });

  for (const goalWord of ['target', 'deadline'] as const) {
    it(`keeps the CSV and diagnostics boxes during a run (${goalWord})`, async () => {
      // Agreed already, so the share box is folded to its summary until Change opens it.
      const t = textOf(await changed({ running: true, goalWord, optIn: true }));
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
    expect(textOf(await changed({ running: true, optIn: true }))).toContain('Sent with the result when the run finishes');
  });

  describe('the remembered consent folds to one line (12 Oct)', () => {
    it('with the box ticked: a summary with Change, without the consent text or the CSV box', async () => {
      const html = await renderWith({ optIn: true });
      const t = textOf(html);
      expect(html).toContain('data-testid="consent-summary"');
      expect(html).toContain('data-testid="consent-change"');
      expect(t).toContain('You agreed to share runs on the leaderboard');
      expect(t).not.toContain('I acknowledge the following');
      expect(t).not.toContain('Send my CSV too');
      expect(html).not.toContain('consent-done');
    });

    it('the summary says what goes: CSV, diagnostics, and the name', async () => {
      const extras = useShareExtras();
      extras.sendCsv.value = false;
      extras.sendDiagnostics.value = true;
      expect(textOf(await renderWith({ optIn: true }))).toMatch(/CSV off · diagnostics on · anonymous/);
      extras.sendCsv.value = true;
      extras.sendDiagnostics.value = false;
      const t = textOf(await renderWith({ optIn: true, anonymous: false, nickname: 'Fred' }));
      expect(t).toMatch(/CSV on · diagnostics off · credited as Fred/);
      expect(t).not.toContain('anonymous');
    });

    it('Change shows the consent text, the boxes and Done, and the summary goes', async () => {
      const html = await changed({ optIn: true });
      const t = textOf(html);
      expect(html).not.toContain('data-testid="consent-summary"');
      expect(t).toContain('I acknowledge the following');
      expect(t).toContain('Send my CSV too');
      expect(html).toContain('data-testid="consent-remembered"');
      expect(html).toContain('data-testid="consent-done"');
      expect(t).not.toContain('Fold this away');
    });

    it('Done is there during a run too (14 Oct: opened mid-run, nothing closed it)', async () => {
      const html = await changed({ running: true, optIn: true });
      expect(html).toContain('data-testid="consent-done"');
      expect(textOf(html)).toContain('Done');
    });

    it('Done folds it back to the one line', async () => {
      const html = await renderWith({ optIn: true }, { expanded: false });
      expect(html).toContain('data-testid="consent-summary"');
      expect(html).not.toContain('consent-done');
    });

    it('no Done before the box is ticked, nor while Send best so far asks for the tick', async () => {
      expect(await renderWith({ optIn: false }, { expanded: true })).not.toContain('consent-done');
      const store = useChainSearchStore();
      store.beginBestSoFar('fastest', null);
      store.askBestSoFar(true);
      const html = await renderWith({ running: true, optIn: false, bestSoFarKind: 'fastest' }, { expanded: true });
      expect(html).not.toContain('consent-done');
    });

    it('"Credit me as" with no name says anonymous in the summary', async () => {
      const t = textOf(await renderWith({ optIn: true, anonymous: false, nickname: '  ' }));
      expect(t).toMatch(/diagnostics off · anonymous/);
    });

    it('with the box unticked: the full text and no summary', async () => {
      const html = await renderWith({ optIn: false });
      expect(html).not.toContain('consent-summary');
      expect(textOf(html)).toContain('I acknowledge the following');
      expect(textOf(html)).toContain('Send my CSV too');
    });
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

  describe('animated dots and the blocked line (12 Oct)', () => {
    it('a running label is the words plus the animated dots, not a literal "..."', async () => {
      const html = await renderHtml(FindBar, { ...base, running: true, runningLabel: 'Searching...' }, {}, [pinia]);
      expect(html.match(/class="animated-dots"/g)).toHaveLength(1);
      expect(html).toMatch(/>Searching<span class="animated-dots"[^>]*>(<span[^>]*>\.<\/span>){3}<\/span>/);
      // The visible text is the word plus three dots once (the aria-label keeps the full label).
      expect(textOf(html).match(/Searching\s?\.\s?\.\s?\./g)).toHaveLength(1);
      expect(html).not.toMatch(/>Searching\.\.\./);
    });

    const blocked = { blockedBy: 'Nearby routes', blockedKind: 'smart', findDisabled: true };
    it('blocked by the other search: the button says so and a line with Jump to it explains', async () => {
      const html = await renderHtml(FindBar, { ...base, ...blocked }, {}, [pinia]);
      expect(html).toMatch(/data-testid="find-blocked-label"[^>]*>Nearby routes is running<span class="animated-dots"/);
      expect(html).toContain('data-testid="find-blocked"');
      expect(textOf(html)).toContain('Nearby routes is running, and one search runs at a time');
      expect(html).toContain('data-testid="find-blocked-jump"');
      expect(textOf(html)).toContain('Jump to it');
    });
    it('without blockedKind there is no jump button', async () => {
      const html = await renderHtml(FindBar, { ...base, blockedBy: 'Nearby routes', findDisabled: true }, {}, [pinia]);
      expect(html).toContain('data-testid="find-blocked"');
      expect(html).not.toContain('find-blocked-jump');
    });
    it('no blockedBy: no blocked line or label', async () => {
      const html = await renderHtml(FindBar, { ...base, blockedKind: 'smart' }, {}, [pinia]);
      expect(html).not.toContain('find-blocked');
    });
  });
});
