/**
 * "SHARE THIS RESULT" NEVER BREAKS THE INSTANT ANSWER (ux29-c, 27 Oct 2026: pieha reloaded his save with the update
 * banner up, and the card showed "The instant answer couldn't be shown…").
 *
 * InstantRoute's own Teleport markup (compiled from InstantRoute.vue, as InstantRoute.states.spec.ts does), in the
 * real InstantGuard, on a page drawn with Vue's own renderer over a small DOM whose node operations are the
 * browser's (runtime-dom's nodeOps: `parent.insertBefore`, `node.nextSibling`), so a null target fails the way it
 * does in Chrome. The page: an update banner that comes and goes above, the card, and the search panel below it with
 * `#search-share-fastest` (SearchPanel.vue).
 *
 * Until this fix the Teleport was deferred to the selector: Vue looked the target up once, as the card mounted. A
 * search panel that was not on the page then (its first draw failed, and the next one worked) left the Teleport
 * with no target for good; when a search result came the line was put into nothing inside the card's update, which
 * threw, and the guard replaced the whole answer with its message. A panel drawn again left the line in the old,
 * detached element: never seen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Vue from 'vue';
import { computed, createRenderer, defineComponent, h, nextTick, reactive, ref, type Component } from 'vue';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import InstantGuard from './InstantGuard';
import { INSTANT_FAILED } from '@/lib/renderGuard';
import { useShareTarget } from '@/composables/useShareTarget';

// ---- InstantRoute.vue's Teleport, compiled ----
const source = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
const template = parse(source).descriptor.template!.content;
const teleportMarkup = template.slice(template.indexOf('<Teleport'), template.indexOf('</Teleport>') + '</Teleport>'.length);
const compiled = compileTemplate({
  source: teleportMarkup,
  filename: 'InstantRoute.vue',
  id: 'share',
  compilerOptions: { isTS: true },
}).code;
const code = ts.transpileModule(compiled, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const body = code
  .replace(/import \{([^}]*)\} from "vue";?/, (_, names: string) => `const {${names.replace(/ as /g, ': ')}} = Vue;`)
  .replace('export function render', 'function render');
const renderShare = new Function('Vue', `${body}\nreturn render;`)(Vue) as (ctx: object, cache: unknown[]) => Vue.VNode;

// ---- A small DOM with the browser's node operations ----
class El {
  childNodes: El[] = [];
  parentNode: El | null = null;
  props: Record<string, unknown> = {};
  constructor(
    public tag: string,
    public text = '',
    private root?: { el: El }
  ) {}
  get nextSibling(): El | null {
    const p = this.parentNode;
    return p ? (p.childNodes[p.childNodes.indexOf(this) + 1] ?? null) : null;
  }
  get isConnected(): boolean {
    let n: El = this;
    while (n.parentNode) n = n.parentNode;
    return n === this.root?.el;
  }
  insertBefore(child: El, anchor: El | null): void {
    child.parentNode?.removeChild(child);
    const i = anchor ? this.childNodes.indexOf(anchor) : -1;
    if (anchor && i < 0) throw new Error("NotFoundError: Failed to execute 'insertBefore' on 'Node'");
    if (i >= 0) this.childNodes.splice(i, 0, child);
    else this.childNodes.push(child);
    child.parentNode = this;
  }
  removeChild(child: El): void {
    this.childNodes.splice(this.childNodes.indexOf(child), 1);
    child.parentNode = null;
  }
}
const textOf = (n: El): string => (n.tag === '#comment' ? '' : n.text + n.childNodes.map(textOf).join(''));
const find = (n: El, pred: (n: El) => boolean): El | null => {
  if (pred(n)) return n;
  for (const c of n.childNodes) {
    const f = find(c, pred);
    if (f) return f;
  }
  return null;
};
const byTestId = (n: El, id: string) => find(n, x => x.props['data-testid'] === id);

/** Every page drawn in a test, taken down after it (a card left broken by one test must not reach the next). */
const mounted: { unmount(): void }[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) {
    try {
      app.unmount();
    } catch {
      /* a page the old code broke half way */
    }
  }
});

function page() {
  const holder: { el: El } = { el: null as unknown as El };
  const root = new El('root', '', holder);
  holder.el = root;
  const make = (tag: string, text = '') => new El(tag, text, holder);
  const querySelector = (sel: string) => find(root, n => sel === `#${String(n.props.id)}`) as unknown as Element | null;
  const renderer = createRenderer<El, El>({
    createElement: t => make(t),
    createText: t => make('#text', t),
    createComment: t => make('#comment', t),
    setText: (n, t) => void (n.text = t),
    setElementText: (el, t) => {
      for (const c of [...el.childNodes]) el.removeChild(c);
      el.insertBefore(make('#text', t), null);
    },
    // runtime-dom's nodeOps, word for word.
    insert: (child, parent, anchor) => parent.insertBefore(child, anchor || null),
    remove: child => {
      const parent = child.parentNode;
      if (parent) parent.removeChild(child);
    },
    parentNode: node => node.parentNode,
    nextSibling: node => node.nextSibling,
    patchProp: (el, key, _prev, next) => void (el.props[key] = next),
    querySelector: sel => querySelector(sel) as unknown as El | null,
  });
  return { root, renderer, querySelector };
}

const SHARE_TO = '#search-share-fastest';

/**
 * The card (its Teleport, with the state it reads), the guard round it, the search panel under it and the update
 * banner above. `panelFailsFirst`: the panel's first draw throws (the next one works).
 */
function mountPage(opts: { panelFailsFirst?: boolean } = {}) {
  const { root, renderer, querySelector } = page();
  const banner = ref(false);
  const panelDraw = ref(0);
  const panelKey = ref(0);
  const ctx = reactive({
    instantUrl: 'precompute/table-v2.bin.gz',
    shareTo: SHARE_TO,
    shareEl: null as Element | null,
    pointer: null as object | null,
    result: null as object | null,
    noTable: false,
    integrityHold: false,
    staleAt: null as number | null,
    shareThis: false,
    keepSharing: false,
    shareText: '',
    shareNote: null,
    SHARE_WHAT: 'Share this result',
  });
  const shown = computed(() => !!(ctx.pointer && ctx.result && !ctx.noTable && !ctx.integrityHold && !ctx.staleAt));
  const Card = defineComponent({
    name: 'InstantRoute',
    setup() {
      const el = useShareTarget(() => ctx.shareTo, shown, querySelector);
      const cache: unknown[] = [];
      return () => {
        ctx.shareEl = el.value;
        return [h('section', [h('h3', 'Instant answer'), h('p', ctx.result ? 'Reaches 490 TE' : 'Working out the instant answer')]), renderShare(ctx, cache)];
      };
    },
  });
  let fails = opts.panelFailsFirst ? 1 : 0;
  const Panel = defineComponent({
    name: 'SearchPanel',
    setup: () => () => {
      void panelDraw.value;
      if (fails > 0) {
        fails--;
        throw new TypeError("Cannot read properties of undefined (reading 'max')");
      }
      return h('section', { 'data-testid': 'search-panel-fastest' }, [h('h3', 'Search'), h('div', { id: SHARE_TO.slice(1), 'data-testid': 'search-share' })]);
    },
  });
  const ShareCheck = defineComponent({ setup: () => () => h('div', { 'data-testid': 'share-check' }, 'Share this result') });
  const errors: unknown[] = [];
  const app = renderer.createApp({
    render: () =>
      h('div', [
        banner.value ? h('div', { 'data-testid': 'update-banner-essential' }, 'Please reload') : null,
        h('div', [h(InstantGuard, null, { default: () => h(Card as Component) }), h(Panel, { key: panelKey.value })]),
      ]),
  });
  app.component('InstantShareCheck', ShareCheck);
  app.config.errorHandler = e => void errors.push(e);
  app.config.warnHandler = () => {};
  app.mount(root);
  mounted.push(app);
  const answer = () => {
    ctx.result = { best: {} };
    ctx.pointer = { level: 'Fast', te: 312 };
  };
  const shareTarget = () => byTestId(root, 'search-share');
  return { root, ctx, banner, panelDraw, panelKey, errors, answer, shareTarget };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await nextTick();
}

describe('Share this result: the instant answer is never replaced by the guard', () => {
  it('the search panel drawn a moment after the card: a search result shows the line in the panel, no guard', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = mountPage({ panelFailsFirst: true });
    await settle();
    expect(p.shareTarget()).toBeNull(); // the panel's first draw failed
    p.panelDraw.value++;
    await settle();
    expect(p.shareTarget()).not.toBeNull();
    // The update banner appears as the result lands, as in pieha's reload.
    p.banner.value = true;
    p.answer();
    await settle();
    expect(byTestId(p.root, 'instant-failed')).toBeNull();
    expect(textOf(p.root)).not.toContain(INSTANT_FAILED);
    expect(textOf(p.root)).toContain('Reaches 490 TE');
    const line = byTestId(p.root, 'share-check');
    expect(line).not.toBeNull();
    expect(byTestId(p.shareTarget()!, 'share-check')).toBe(line);
    expect(p.errors.filter(e => !String(e).includes("reading 'max'"))).toEqual([]);
    spy.mockRestore();
  });

  it('the panel drawn again (a new element): the line goes into the one on the page, not the old one', async () => {
    const p = mountPage();
    await settle();
    const first = p.shareTarget();
    p.panelKey.value++;
    await settle();
    const second = p.shareTarget();
    expect(second).not.toBe(first);
    p.answer();
    await settle();
    expect(byTestId(p.root, 'instant-failed')).toBeNull();
    expect(byTestId(second!, 'share-check')).not.toBeNull();
    expect(p.errors).toEqual([]);
  });

  it('no panel on the page at all: the line shows under the answer, inside the card', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = mountPage({ panelFailsFirst: true });
    await settle();
    p.answer();
    await settle();
    expect(byTestId(p.root, 'instant-failed')).toBeNull();
    const line = byTestId(p.root, 'share-check');
    expect(line).not.toBeNull();
    // Beside the card's own section, in the guard's slot, not in a panel.
    expect(find(line!.parentNode!, n => n.tag === 'section' && textOf(n).startsWith('Instant answer'))).not.toBeNull();
    // The panel draws later; the next time the line shows, it moves there.
    p.panelDraw.value++;
    await settle();
    p.ctx.integrityHold = true;
    await settle();
    p.ctx.integrityHold = false;
    await settle();
    expect(byTestId(p.shareTarget()!, 'share-check')).not.toBeNull();
    expect(byTestId(p.root, 'instant-failed')).toBeNull();
    spy.mockRestore();
  });

  it('the update banner coming and going while the card mounts and while the result lands: as it was, no guard', async () => {
    const p = mountPage();
    p.banner.value = true;
    await settle();
    p.banner.value = false;
    p.answer();
    p.banner.value = true;
    await settle();
    expect(byTestId(p.root, 'update-banner-essential')).not.toBeNull();
    expect(byTestId(p.root, 'instant-failed')).toBeNull();
    expect(byTestId(p.shareTarget()!, 'share-check')).not.toBeNull();
    // Answer gone and back (a save reloaded: the result is cleared, then a new one lands).
    p.ctx.result = null;
    await settle();
    expect(byTestId(p.root, 'share-check')).toBeNull();
    p.answer();
    p.banner.value = false;
    await settle();
    expect(byTestId(p.shareTarget()!, 'share-check')).not.toBeNull();
    expect(p.errors).toEqual([]);
  });

  it('the Teleport markup: not deferred, never to the selector itself', () => {
    const tag = teleportMarkup.slice(0, teleportMarkup.indexOf('>'));
    expect(tag).toContain(':to="shareEl ?? \'body\'"');
    expect(tag).toContain(':disabled="!shareEl"');
    expect(tag).not.toMatch(/\bdefer\b/);
  });
});

// What the guard showed pieha, and what its Details fold says: a deferred Teleport to a selector that wasn't on the
// page when it mounted, then content for it. The exact throw, in the browser's own words.
describe('the hazard itself (Vue 3.5 deferred Teleport with no target)', () => {
  it('throws in the card update; the guard shows its message with the error in Details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { root, renderer } = page();
    const show = ref(false);
    const panel = ref(false);
    const Card = defineComponent({
      setup: () => () => [
        h('section', 'Instant answer'),
        h(Vue.Teleport, { to: SHARE_TO, defer: true }, [show.value ? h('div', 'Share this result') : Vue.createCommentVNode('v-if', true)]),
      ],
    });
    const app = renderer.createApp({
      render: () => h('div', [h(InstantGuard, null, { default: () => h(Card) }), panel.value ? h('div', { id: SHARE_TO.slice(1) }) : null]),
    });
    app.config.warnHandler = () => {};
    app.mount(root);
    mounted.push(app);
    await settle();
    panel.value = true;
    await settle();
    show.value = true;
    await settle();
    expect(byTestId(root, 'instant-failed')).not.toBeNull();
    const details = textOf(byTestId(root, 'instant-failed-error')!);
    expect(details).toMatch(/^TypeError: Cannot read properties of null \(reading '(parentNode|nextSibling|insertBefore)'\) \(while updating\)/);
    expect(String(spy.mock.calls.find(c => /^\[instant\]/.test(String(c[0])))?.[0])).toMatch(
      /^\[instant\] card could not be drawn: TypeError: Cannot read properties of null/
    );
    spy.mockRestore();
  });
});
