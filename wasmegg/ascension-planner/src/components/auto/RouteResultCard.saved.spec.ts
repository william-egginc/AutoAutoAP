/**
 * L2 (spec-r7qa, QA 3 Nov 2026, LOW): of Fastest's two save buttons (one since UX fluff review 2, 5 Nov 2026), "Save this run" (SavedRuns.vue) turned to "Saved ✓"
 * but the result card's "Save run" (RouteResultCard.vue) stayed "Save run". Both read the store's `currentRunSaved` now
 * (ChainSearchPanel.vue and InsanePanel.vue pass it to the card as `saved`); a name typed under Save this run switches only
 * that one back, as before. By a date's card already read `currentAnswerSaved` (DeadlinePanel.vue `:saved`): held here
 * too. "Saved ✓" is DRAFT wording (as spec-r7redteam-c's). Fixed clock, placeholder data, a memory database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const { useChainSearchStore } = await import('@/stores/chainSearch');
const { renderHtml, textOf } = await import('@/test/renderComponent');
const RouteResultCard = (await import('./RouteResultCard.vue')).default;
const ByDateRouteCard = (await import('./ByDateRouteCard.vue')).default;
const SavedRuns = (await import('./SavedRuns.vue')).default;

const PLAYER = 'EI1234567890123456';
const T0 = Date.UTC(2026, 9, 31, 16, 8);
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
/** Each `<tag …>` opening in a template, its attributes only (cut at its own `/>` or the `>` that ends its line). */
const openings = (src: string, tag: string) =>
  src
    .split(`<${tag}`)
    .slice(1)
    .map(b => {
      const m = /\/>|>\s*\n/.exec(b);
      return m ? b.slice(0, m.index) : b;
    });

function installStorageStub(): void {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, String(value)),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  });
}

const cardProps = (saved: boolean) => ({
  chain: [195, 229, 283, 490],
  days: 743.9,
  finalTE: 490,
  endLabel: 'Nov 14, 2028, 3:00 PM',
  running: false,
  canSave: true,
  saved,
});
const cardButton = (html: string) => textOf(/<button[^>]*data-testid="fastest-save"[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? '');
const lowerButton = (html: string) => (/Saved ✓/.test(textOf(html)) ? 'Saved ✓' : /Save this run/.test(textOf(html)) ? 'Save this run' : '');

/** SavedRuns rendered with a hold on its own state (its typed name), as the virtue spec reaches a setup's state. */
async function savedRuns(name = ''): Promise<{ html: string; savedHere: boolean }> {
  let state: Record<string, unknown> = {};
  const app = createSSRApp({ render: () => h(SavedRuns, { playerId: PLAYER }) });
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (this.$.type.__file?.endsWith('/SavedRuns.vue')) state = this.$.setupState;
    },
  });
  app.use(getActivePinia()!);
  const html = await renderToString(app);
  state.label = name;
  return { html, savedHere: state.savedHere as boolean };
}

describe("L2: Fastest's two save buttons say the same for the stored run", () => {
  beforeEach(() => {
    db.clear();
    installStorageStub();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('the card says Saved ✓ when told, else Save run', async () => {
    expect(cardButton(await renderHtml(RouteResultCard, cardProps(true)))).toBe('Saved ✓');
    expect(cardButton(await renderHtml(RouteResultCard, cardProps(false)))).toBe('Save run');
  });

  it('one Save since 5 Nov 2026: the card\'s follows the store; Saved for later has none (UX fluff review 2, item C7b)', async () => {
    const store = useChainSearchStore();
    store.bestChain = [195, 229, 283, 490];
    store.bestDays = 743.9;
    const card = async () => cardButton(await renderHtml(RouteResultCard, cardProps(store.currentRunSaved)));
    expect(await card()).toBe('Save run');
    expect(lowerButton((await savedRuns()).html)).toBe('');
    await store.saveCurrentRun(PLAYER, 'my run');
    expect(await card()).toBe('Saved ✓');
    expect(store.savedRuns[0]?.label).toBe('my run');
    // Another run on screen: save again.
    store.bestChain = [195, 230, 283, 490];
    expect(await card()).toBe('Save run');
  });

  it('both panels that show the card hand it the store flag; a typed name switches only that one back', () => {
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
      const cards = openings(read(f), 'RouteResultCard').filter(a => /\bcan-save\b/.test(a));
      expect(cards.length, f).toBeGreaterThan(0);
      for (const c of cards) expect(c, f).toContain(':saved="store.currentRunSaved"');
      expect(read(f), f).toContain('await store.saveCurrentRun(props.playerId, name);');
    }
    expect(read('CardSaveRow.vue')).toContain('props.saved && !name.value.trim()');
  });

  it("By a date's card: Save answer reads currentAnswerSaved, as Save this answer does", async () => {
    // Only the finished answer's card can save (the best-so-far ones can't): it reads the flag.
    const cards = openings(read('DeadlinePanel.vue'), 'ByDateRouteCard').filter(a => /\bcan-save\b/.test(a));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toContain(':saved="store.currentAnswerSaved"');
    expect(read('SavedAnswers.vue')).toContain('store.currentAnswerSaved && !label.value.trim()');
    // The store side is chainSearch.savedAnswerDedupe.spec.ts's; here, the card's two words.
    const DEADLINE = 1_815_660_000;
    const route = { chain: [166, 198, 222, 249], reachAt: DEADLINE - 3600, ascendAt: DEADLINE - 3600, spare: 3600, legs: [] };
    const btn = async (saved: boolean) =>
      textOf(
        /<button[^>]*data-testid="by-date-save"[^>]*>([\s\S]*?)<\/button>/.exec(
          await renderHtml(ByDateRouteCard, { route, deadline: DEADLINE, zone: 'UTC', canSave: true, saved })
        )?.[1] ?? ''
      );
    expect(await btn(true)).toBe('Saved ✓');
    expect(await btn(false)).toBe('Save answer');
  });
});
