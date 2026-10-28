/**
 * ONE SHARING BOX (ux29 #11, 27 Oct 2026): "Submit anonymously" and "Credit me as" were separate choices in the Help
 * box, Before you send, Setup, Share this result and Send it now. Now one line, "Sharing: on · credited as <name>" /
 * "Sharing: on · anonymous" / "Sharing: off", with ONE Change that opens the one setting (SharingChoices.vue), and the
 * credit radios are defined once in the app. Specs render on the server (no DOM): an open Change is the component's
 * own `open` set before it renders, as in FindBar.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, nextTick, provide, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import SharingSummary from './SharingSummary.vue';
import SharingChoices from './SharingChoices.vue';
import BoardSubmitButtons from './auto/BoardSubmitButtons.vue';
import RunSendReport from './auto/RunSendReport.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { creditWords, sharingLine, OPEN_SHARING_FOR_NAME } from '@/lib/sharingLine';
import { useBoardSubmit, useShareIdentity, type BoardStore } from '@/composables/useShareResult';
import { useShareNameStore } from '@/stores/shareName';

const A = 'EI1234567890123456';
const B = 'EI6543210987654321';

let pinia: Pinia;
let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
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

/** SharingSummary rendered, with Change pressed (`open`) or not, and anything to run in its setup state. */
async function render(
  props: Record<string, unknown>,
  open = false,
  run?: (s: Record<string, unknown>) => void
): Promise<string> {
  const app = createSSRApp({ render: () => h(SharingSummary, props as never) });
  app.use(pinia);
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (!this.$.type.__file?.endsWith('/SharingSummary.vue')) return;
      Object.assign(this.$.setupState, { open });
      run?.(this.$.setupState);
    },
  });
  return renderToString(app);
}

describe('the line: three states', () => {
  it('on and credited, on and anonymous, off', () => {
    expect(sharingLine(true, false, 'Williamthe5thc')).toBe('Sharing: on · credited as Williamthe5thc');
    expect(sharingLine(true, true, 'Williamthe5thc')).toBe('Sharing: on · anonymous');
    expect(sharingLine(false, false, 'Williamthe5thc')).toBe('Sharing: off');
  });

  it('"Credit me as" with no name is anonymous (a name is never made up); a long one is cut at the cap', () => {
    expect(creditWords(false, '   ')).toBe('anonymous');
    expect(creditWords(false, 'Frederick', 4)).toBe('credited as Fred');
    expect(creditWords(false, 'x'.repeat(60))).toBe(`credited as ${'x'.repeat(40)}`);
  });

  it('rendered: the words and ONE Change, and no radios until Change is pressed', async () => {
    const named = await render({ anonymous: false, nickname: 'Williamthe5thc', on: true });
    expect(textOf(named)).toBe('Sharing: on · credited as Williamthe5thc · Change');
    expect(named.match(/data-testid="sharing-change"/g)).toHaveLength(1);
    expect(named).not.toContain('type="radio"');
    expect(named).not.toContain('data-testid="sharing-choices"');
    expect(textOf(await render({ anonymous: true, nickname: 'Williamthe5thc', on: true }))).toBe(
      'Sharing: on · anonymous · Change'
    );
    expect(textOf(await render({ anonymous: false, nickname: 'Williamthe5thc', on: false }))).toBe('Sharing: off · Change');
  });

  it('left without `on`, it is the account\'s leaderboard agreement (off until agreed)', async () => {
    expect(textOf(await render({ anonymous: true, nickname: '' }))).toBe('Sharing: off · Change');
  });
});

describe('Change opens the one setting', () => {
  it('the ticks and the credit radios of SharingChoices, picked as the line says; Done closes it', async () => {
    const html = await render({ anonymous: false, nickname: 'Williamthe5thc', on: true }, true);
    expect(html).toContain('data-testid="sharing-choices"');
    for (const k of ['share', 'csv', 'diag', 'checks']) expect(html).toContain(`data-testid="sharing-tick-${k}"`);
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    expect(radios[0]).toMatch(/checked[^>]*data-testid="sharing-credit-name"/);
    expect(radios[1]).not.toMatch(/checked/);
    expect(radios[0]).toMatch(/name="([^"]+)"/);
    expect(radios[0]?.match(/name="([^"]+)"/)?.[1]).toBe(radios[1]?.match(/name="([^"]+)"/)?.[1]);
    expect(html).toMatch(/value="Williamthe5thc"[^>]*data-testid="sharing-nickname"/);
    expect(textOf(html)).toContain('Done');
    const t = textOf(html);
    expect(t).toContain('Credit me as');
    expect(t).toContain('Stay anonymous');
    expect(t).not.toContain('Submit anonymously');
  });

  it('a pick goes to the screen\'s identity (the account\'s one setting): anonymous, then credit me', async () => {
    const onAnon = vi.fn();
    await render({ anonymous: false, nickname: 'Williamthe5thc', 'onUpdate:anonymous': onAnon }, true, s =>
      (s.pick as (v: string) => void)('anon')
    );
    expect(onAnon).toHaveBeenCalledWith(true);
    const onAnon2 = vi.fn();
    await render({ anonymous: true, nickname: 'Williamthe5thc', 'onUpdate:anonymous': onAnon2 }, true, s =>
      (s.pick as (v: string) => void)('name')
    );
    expect(onAnon2).toHaveBeenCalledWith(false);
    // Picking what is already picked changes nothing.
    const onAnon3 = vi.fn();
    await render({ anonymous: true, nickname: '', 'onUpdate:anonymous': onAnon3 }, true, s =>
      (s.pick as (v: string) => void)('anon')
    );
    expect(onAnon3).not.toHaveBeenCalled();
  });

  it('greyed out where a run already took its name (a sweep going)', async () => {
    expect(await render({ anonymous: true, nickname: '', on: true, disabled: true })).toMatch(
      /<button[^>]*disabled[^>]*data-testid="sharing-change"/
    );
  });
});

describe('the choice persists per account (stores/shareName.ts, no store of its own)', () => {
  it('picked through the line for one account: that account only, kept in this browser, read back on a new page', async () => {
    const who = useShareIdentity(() => A);
    useShareIdentity(() => B);
    // The line's pick, wired as every screen wires it (v-model:anonymous on the identity).
    await render(
      { anonymous: who.anonymous.value, nickname: 'Williamthe5thc', 'onUpdate:anonymous': (v: boolean) => (who.anonymous.value = v) },
      true,
      s => (s.pick as (v: string) => void)('name')
    );
    const names = useShareNameStore();
    expect(names.anonymousFor(A)).toBe(false);
    expect(names.anonymousFor(B)).toBeUndefined();
    await new Promise(r => setTimeout(r, 20));
    expect([...mem.values()]).toContain('0');
    // A new page: a fresh store reads it back for A, and B still has none.
    setActivePinia(createPinia());
    const fresh = useShareNameStore();
    await fresh.load(A);
    await fresh.load(B);
    expect(fresh.anonymousFor(A)).toBe(false);
    expect(fresh.anonymousFor(B)).toBeUndefined();
  });
});

describe('Put my name on it, on a row sent anonymously', () => {
  const store = (rec: { id?: string; nickname?: string; quarantined?: boolean } | null) =>
    ({
      sentRecord: rec,
      nameToClaim: (n: string) => (rec?.id && n.trim() && n.trim() !== (rec.nickname ?? '') ? n.trim() : ''),
      alreadySubmitted: true,
      bestDays: 0,
      isRunning: false,
      prepareRechecks: vi.fn(),
      retryTable: vi.fn(),
      claimName: vi.fn(),
    }) as unknown as BoardStore;

  it('offered while the setting has no name for it; the rename once one is chosen; never for a named row', () => {
    const name = ref('');
    const s = useBoardSubmit(store({ id: 'r1', nickname: '' }), name, ref(true));
    expect(s.offerName.value).toBe(true);
    expect(s.nameToClaim.value).toBe('');
    name.value = 'Williamthe5thc';
    expect(s.offerName.value).toBe(false);
    expect(s.nameToClaim.value).toBe('Williamthe5thc');
    expect(useBoardSubmit(store({ id: 'r1', nickname: 'Williamthe5thc' }), ref(''), ref(true)).offerName.value).toBe(false);
    expect(useBoardSubmit(store({ id: 'r1', quarantined: true }), ref(''), ref(true)).offerName.value).toBe(false);
    expect(useBoardSubmit(store(null), ref(''), ref(true)).offerName.value).toBe(false);
  });

  it('Share this result: the same label, and the press opens the sharing setting (not a rename)', async () => {
    const open = vi.fn();
    const onClaim = vi.fn();
    const props = {
      optIn: true,
      submitUrl: 'https://example.invalid/submit',
      nameToClaim: '',
      offerName: true,
      claiming: false,
      sending: false,
      alreadySubmitted: true,
      message: '',
      ok: true,
      partial: false,
      pendingTable: false,
      retrying: false,
      preview: () => '',
      onClaim,
    };
    const app = createSSRApp({
      setup() {
        provide(OPEN_SHARING_FOR_NAME, open);
        return () => h(BoardSubmitButtons, props);
      },
    });
    const html = await renderToString(app);
    expect(html).toMatch(/data-testid="name-it"[^>]*>\s*Put my name on it\s*</);
    expect(html).toMatch(/<button[^>]*min-h-\[44px\][^>]*data-testid="name-it"/);
    // Outside Share this result (nothing to open), not offered.
    expect(await renderHtml(BoardSubmitButtons, props)).not.toContain('data-testid="name-it"');
    // With a name chosen: the rename, as before.
    const named = await renderHtml(BoardSubmitButtons, { ...props, nameToClaim: 'Williamthe5thc', offerName: false });
    expect(textOf(named)).toContain('Put my name on it');
    expect(named).not.toContain('data-testid="name-it"');
  });

  it('under Run (the automatic send\'s report): the same label, and the press asks the bar to open the setting', async () => {
    const html = await renderHtml(RunSendReport, { kind: 'smart', own: true, running: false, message: 'Stored.', offerName: true });
    expect(html).toMatch(/data-testid="name-it"[^>]*>\s*Put my name on it\s*</);
    const src = fs.readFileSync(path.resolve(__dirname, 'auto/RunControls.vue'), 'utf8');
    expect(src).toContain('@name-it="findBar?.openForName()"');
    const bar = fs.readFileSync(path.resolve(__dirname, 'auto/FindBar.vue'), 'utf8');
    expect(bar).toMatch(/async function openForName\(\): Promise<void> \{\s*await ackFold\.value\?\.show\(false\);\s*await sharing\.value\?\.openForName\(\);/);
  });

  it('openForName: the setting opens on "Credit me as"', async () => {
    const onAnon = vi.fn();
    let opened: unknown;
    await render({ anonymous: true, nickname: 'Williamthe5thc', 'onUpdate:anonymous': onAnon }, false, s => {
      void (s.openForName as () => Promise<void>)();
      opened = s.open;
    });
    await nextTick();
    expect(onAnon).toHaveBeenCalledWith(false);
    expect(opened).toBe(true);
  });
});

/** Every .vue file under src, with its HTML and script comments taken out. */
function vueSources(): Map<string, string> {
  const root = path.resolve(__dirname, '..');
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.vue'))
        out.set(
          path.relative(root, p),
          fs
            .readFileSync(p, 'utf8')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
        );
    }
  };
  walk(root);
  return out;
}

describe('one definition of the credit radios in the app (source checks)', () => {
  const src = vueSources();

  it('"Credit me as" and "Stay anonymous" are labels in SharingChoices.vue only; "Submit anonymously" is gone', () => {
    const credit = [...src].filter(([, s]) => s.includes('Credit me as')).map(([f]) => f);
    // Two pages name the setting in a sentence (no control): the Leaderboard's "To join, pick “Credit me as”" and How
    // it works. Every other mention is SharingChoices.vue's.
    expect(credit.sort()).toEqual(
      ['components/SharingChoices.vue', 'components/auto/LeaderboardPanel.vue', 'components/science/HowItWorks.vue'].sort()
    );
    const anonLabel = [...src].filter(([, s]) => /^\s*Stay anonymous\s*$/m.test(s)).map(([f]) => f);
    expect(anonLabel).toEqual(['components/SharingChoices.vue']);
    expect([...src].filter(([, s]) => s.includes('Submit anonymously')).map(([f]) => f)).toEqual([]);
  });

  it('no file but SharingChoices.vue has an anonymous-or-named radio', () => {
    // A radio with its label: one about the credit names "anonym…" or "credit" in its tag or its label.
    const creditRadio = (s: string) =>
      [...s.matchAll(/<input\b[^>]*type="radio"[^>]*>[\s\S]*?<\/label>/g)].some(m => /anonym|credit/i.test(m[0]));
    const radioFiles = [...src].filter(([, s]) => creditRadio(s)).map(([f]) => f);
    expect(radioFiles).toEqual(['components/SharingChoices.vue']);
    expect(fs.existsSync(path.resolve(__dirname, 'auto/ShareNameChoice.vue'))).toBe(false);
    // And one name box ("Credit me as" + nickname): no search panel or share box keeps its own.
    expect([...src].filter(([, s]) => /placeholder="nickname"|aria-label="Nickname"/.test(s)).map(([f]) => f)).toEqual([
      'components/SharingChoices.vue',
    ]);
  });

  it('the Help box and Setup show SharingChoices; the other places show the line and its Change', () => {
    for (const f of ['components/StudyForm.vue', 'components/auto/StudySetup.vue'])
      expect(src.get(f), f).toMatch(/<SharingChoices\b/);
    for (const f of [
      'components/auto/FindBar.vue',
      'components/auto/ShareResult.vue',
      'components/auto/UnsentResults.vue',
      'components/auto/InsanePanel.vue',
      'components/science/SweepRunner.vue',
    ]) {
      expect(src.get(f), f).toMatch(/<SharingSummary\b/);
      expect(src.get(f), f).not.toMatch(/<SharingChoices\b/);
      expect(src.get(f), f).not.toContain('type="radio"');
    }
    // SharingSummary's Change opens SharingChoices itself, the one copy.
    expect(src.get('components/SharingSummary.vue')).toMatch(/<SharingChoices\b/);
  });
});

describe('a phone (390 px)', () => {
  const choices = fs.readFileSync(path.resolve(__dirname, 'SharingChoices.vue'), 'utf8');
  const summary = fs.readFileSync(path.resolve(__dirname, 'SharingSummary.vue'), 'utf8');

  it('every tap target is 44 px tall below sm: Change, both radios, every tick, the name box', () => {
    expect(summary).toMatch(/class="inline-flex items-center min-h-\[44px\] sm:min-h-0[^"]*"[^>]*data-testid="sharing-change"/);
    const labels = choices.match(/<label[^>]*>/g) ?? [];
    expect(labels).toHaveLength(3);
    for (const l of labels) expect(l).toContain('min-h-[44px] sm:min-h-0');
    expect(choices).toMatch(/class="w-full sm:w-48 min-h-\[44px\] sm:min-h-0[^"]*"/);
  });

  it('nothing wider than the screen: no fixed width below sm, long words wrap, the line wraps', () => {
    for (const s of [choices, summary]) {
      // A box's own size (the 20 px ticks and radios) is fine; nothing 96 px or wider is fixed below sm.
      const widths = [...s.matchAll(/(?<![\w:-])w-(\d+|\[[^\]]+\])/g)]
        .map(m => m[0])
        .filter(w => !/^w-\d+$/.test(w) || Number(w.slice(2)) >= 24);
      expect(widths, 'a fixed width outside sm:').toEqual([]);
    }
    expect(summary).toMatch(/data-testid="sharing-line"/);
    expect(summary).toMatch(/flex flex-wrap[^"]*min-w-0 break-words/);
    expect(choices).toContain('flex flex-col sm:flex-row');
  });

  it('Setup\'s Change and the Help box keep their test ids (one component, each place\'s prefix)', async () => {
    const html = await renderHtml(SharingChoices, {
      ticks: { share: true, csv: false, diag: false, checks: false },
      credit: 'anon',
      nickname: '',
      testid: 'study-setup',
    });
    for (const id of ['study-setup-tick-share', 'study-setup-credit-name', 'study-setup-nickname', 'study-setup-credit-anon'])
      expect(html).toContain(`data-testid="${id}"`);
    expect(html).toMatch(/<input[^>]*checked[^>]*data-testid="study-setup-tick-share"/);
    expect(html).toMatch(/<input[^>]*checked[^>]*data-testid="study-setup-credit-anon"/);
  });
});
