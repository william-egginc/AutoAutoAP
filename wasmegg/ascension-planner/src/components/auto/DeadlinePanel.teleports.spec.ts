/**
 * BY A DATE'S RUN CONTROLS AND RESULTS ARE NEVER LEFT UNSEEN (teleport2, 27 Oct 2026; after ux29-c, pieha's instant
 * answer: InstantShareTarget.spec.ts).
 *
 * DeadlinePanel.vue's own Teleport markup (the run controls and the results of each box, compiled from the file as
 * InstantRoute.states.spec.ts does), drawn by Vue's renderer over a small DOM with runtime-dom's node operations, in
 * a page like DeadlinePanel's: the search panel with the four targets (`#bd-around-*` in Fast and Exact, `#bd-exh-*`
 * under Custom's boxes), then the Teleports.
 *
 * Until this fix they were deferred Teleports to the selectors: Vue looked each target up once, just after mount.
 * A search panel that missed its first draw left them with no target for good: Custom's run controls (shown all
 * along) were never drawn at all, and anything shown later threw inside the panel's update. One drawn again left
 * them in the old, detached element. Now: the element, looked up when needed (composables/useTeleportTarget.ts);
 * none, and they show in place, under the search panel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Vue from 'vue';
import { createRenderer, defineComponent, h, nextTick, reactive, ref, type Component } from 'vue';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { useTeleportTarget } from '@/composables/useTeleportTarget';
import { BY_DATE_KINDS, BY_DATE_TARGETS, type ByDateKind } from '@/search/byDateKinds';

// ---- DeadlinePanel.vue's Teleports, compiled ----
const source = fs.readFileSync(path.resolve(__dirname, 'DeadlinePanel.vue'), 'utf8');
const template = parse(source).descriptor.template!.content;
const afterPanel = template.slice(template.indexOf('</SearchPanel>'));
const teleportMarkup = afterPanel.slice(
  afterPanel.indexOf('<Teleport'),
  afterPanel.lastIndexOf('</Teleport>') + '</Teleport>'.length
);
const compiled = compileTemplate({
  source: teleportMarkup,
  filename: 'DeadlinePanel.vue',
  id: 'teleports',
  compilerOptions: { isTS: true },
}).code;
const code = ts.transpileModule(compiled, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const body = code
  .replace(/import \{([^}]*)\} from "vue";?/, (_, names: string) => `const {${names.replace(/ as /g, ': ')}} = Vue;`)
  .replace('export function render', 'function render');
const renderTeleports = new Function('Vue', `${body}\nreturn render;`)(Vue) as (ctx: object, cache: unknown[]) => Vue.VNode;

/** Anything the run controls' props read that a spec doesn't care about: any property, any call, never a ref. */
const anything: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : typeof k === 'string' && k.startsWith('__v_') ? undefined : anything),
  apply: () => anything,
});

// ---- A small DOM with the browser's node operations (as InstantShareTarget.spec.ts) ----
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
const find = (n: El, pred: (n: El) => boolean): El | null => {
  if (pred(n)) return n;
  for (const c of n.childNodes) {
    const f = find(c, pred);
    if (f) return f;
  }
  return null;
};
const all = (n: El, pred: (n: El) => boolean): El[] => [...(pred(n) ? [n] : []), ...n.childNodes.flatMap(c => all(c, pred))];

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

/** DeadlinePanel's end: the search panel (with the four targets), then the Teleports. */
function mountPanel(opts: { panelFailsFirst?: boolean } = {}) {
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

  const panelDraw = ref(0);
  const panelKey = ref(0);
  const ownerDraw = ref(0);
  const state = reactive({
    // Custom's run controls show all along (search/byDateKinds.ts `showsControls`); Fast and Exact's by state.
    controls: { around: false, boxes: true } as Record<ByDateKind, boolean>,
    result: null as object | null,
    resultKind: 'around' as ByDateKind,
  });
  let fails = opts.panelFailsFirst ? 1 : 0;
  const SearchPanel = defineComponent({
    name: 'SearchPanel',
    setup: () => () => {
      void panelDraw.value;
      if (fails > 0) {
        fails--;
        throw new TypeError("Cannot read properties of undefined (reading 'max')");
      }
      return h('section', { 'data-testid': 'search-panel-by-date' }, [
        h('div', { 'data-testid': 'fast-exact' }, [h('div', { id: 'bd-around-controls' }), h('div', { id: 'bd-around-results' })]),
        h('div', { 'data-testid': 'custom' }, [h('div', { id: 'bd-exh-controls' }), h('div', { id: 'bd-exh-results' })]),
      ]);
    },
  });
  const Panel = defineComponent({
    name: 'DeadlinePanel',
    setup() {
      // DeadlinePanel.vue's own wiring (`teleportTargets`), with this page's lookup.
      const targets = Object.fromEntries(
        BY_DATE_KINDS.map(k => [
          k,
          {
            controls: useTeleportTarget(() => BY_DATE_TARGETS[k].controls, () => state.controls[k], querySelector),
            results: useTeleportTarget(() => BY_DATE_TARGETS[k].results, () => !!state.result && state.resultKind === k, querySelector),
          },
        ])
      ) as Record<ByDateKind, Record<'controls' | 'results', Vue.ShallowRef<Element | null>>>;
      const ctx = new Proxy(
        {
          BY_DATE_KINDS,
          TARGETS: BY_DATE_TARGETS,
          teleportTo: (k: ByDateKind, part: 'controls' | 'results') => targets[k][part].value,
          showControls: (k: ByDateKind) => state.controls[k],
        } as Record<string, unknown>,
        {
          get: (t, k) =>
            k === 'result' ? state.result : k === 'resultKind' ? state.resultKind : k in t ? t[k as string] : anything,
          has: () => true,
          set: () => true,
        }
      );
      const cache: unknown[] = [];
      return () => {
        void ownerDraw.value;
        return [h('h3', 'Highest TE by a date'), h(SearchPanel, { key: panelKey.value }), renderTeleports(ctx, cache)];
      };
    },
  });
  const errors: unknown[] = [];
  const app = renderer.createApp({ render: () => h('div', { 'data-testid': 'page' }, [h(Panel as Component)]) });
  app.component('RunControls', defineComponent({ setup: () => () => h('div', { 'data-testid': 'run-controls' }, 'Run Custom') }));
  app.component('RunResults', defineComponent({ setup: () => () => h('div', { 'data-testid': 'run-results' }, 'The best routes') }));
  app.config.errorHandler = e => void errors.push(e);
  app.config.warnHandler = () => {};
  app.mount(root);
  mounted.push(app);
  const byId = (id: string) => find(root, n => n.props.id === id);
  const controls = () => all(root, n => n.props['data-testid'] === 'run-controls');
  const results = () => all(root, n => n.props['data-testid'] === 'run-results');
  const inside = (n: El, id: string) => {
    for (let p = n.parentNode; p; p = p.parentNode) if (p.props.id === id) return true;
    return false;
  };
  const shownInPlace = (n: El) => n.isConnected && !find(root, x => x.props['data-testid'] === 'search-panel-by-date' && !!find(x, y => y === n));
  return { root, state, panelDraw, panelKey, ownerDraw, errors, byId, controls, results, inside, shownInPlace };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await nextTick();
}
const notTheMax = (errors: unknown[]) => errors.filter(e => !String(e).includes("reading 'max'"));

describe("By a date's run controls and results: never unseen, never a throw", () => {
  it('all four targets there: the controls and the results go into their boxes', async () => {
    const p = mountPanel();
    await settle();
    expect(p.controls()).toHaveLength(1);
    expect(p.inside(p.controls()[0], 'bd-exh-controls')).toBe(true);
    p.state.controls.around = true;
    p.state.result = { routes: [] };
    await settle();
    expect(p.controls().filter(c => p.inside(c, 'bd-around-controls'))).toHaveLength(1);
    expect(p.inside(p.results()[0], 'bd-around-results')).toBe(true);
    expect(p.errors).toEqual([]);
  });

  it('the search panel missed its first draw: Custom\'s controls show in place, then move into the box', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = mountPanel({ panelFailsFirst: true });
    await settle();
    expect(p.byId('bd-exh-controls')).toBeNull();
    // Shown, under where the search panel would be: never unseen.
    expect(p.controls()).toHaveLength(1);
    expect(p.shownInPlace(p.controls()[0])).toBe(true);
    p.panelDraw.value++;
    await settle();
    // The panel's next draw (and the owner's next one) finds the box.
    p.ownerDraw.value++;
    await settle();
    expect(p.inside(p.controls()[0], 'bd-exh-controls')).toBe(true);
    // A result and Fast and Exact's controls coming later: into their boxes, no throw.
    p.state.controls.around = true;
    p.state.result = { routes: [] };
    await settle();
    expect(p.controls().filter(c => p.inside(c, 'bd-around-controls'))).toHaveLength(1);
    expect(p.inside(p.results()[0], 'bd-around-results')).toBe(true);
    expect(notTheMax(p.errors)).toEqual([]);
    spy.mockRestore();
  });

  it('a result while the search panel is still missing: in place, then in its box once found', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = mountPanel({ panelFailsFirst: true });
    await settle();
    p.state.result = { routes: [] };
    p.state.resultKind = 'boxes';
    await settle();
    expect(p.results()).toHaveLength(1);
    expect(p.shownInPlace(p.results()[0])).toBe(true);
    p.panelDraw.value++;
    p.ownerDraw.value++;
    await settle();
    expect(p.inside(p.results()[0], 'bd-exh-results')).toBe(true);
    expect(notTheMax(p.errors)).toEqual([]);
    spy.mockRestore();
  });

  it('the search panel drawn again (new elements): the controls and results follow into the new boxes', async () => {
    const p = mountPanel();
    p.state.result = { routes: [] };
    await settle();
    const oldBox = p.byId('bd-exh-controls');
    p.panelKey.value++;
    await settle();
    const newBox = p.byId('bd-exh-controls');
    expect(newBox).not.toBe(oldBox);
    expect(p.inside(p.controls()[0], 'bd-exh-controls')).toBe(true);
    expect(p.controls()[0].isConnected).toBe(true);
    expect(p.results()[0].isConnected).toBe(true);
    expect(p.inside(p.results()[0], 'bd-around-results')).toBe(true);
    expect(p.errors).toEqual([]);
  });

  it('the markup: no deferred Teleport anywhere in the app, and DeadlinePanel\'s go to the looked-up element', () => {
    const dir = path.resolve(__dirname, '..', '..');
    const vueFiles = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? vueFiles(path.join(d, e.name)) : e.name.endsWith('.vue') ? [path.join(d, e.name)] : []));
    for (const f of vueFiles(dir)) {
      const t = fs.readFileSync(f, 'utf8');
      for (const m of t.matchAll(/<Teleport\b[^>]*>/g)) {
        expect(m[0], path.relative(dir, f)).not.toMatch(/\bdefer\b/);
        // A selector other than body: looked up by the owner instead (useTeleportTarget.ts).
        expect(m[0], path.relative(dir, f)).toMatch(/to="body"|:to="[A-Za-z]+(\([^)]*\))? \?\? 'body'"/);
      }
    }
    expect(teleportMarkup).toContain(":to=\"teleportTo(k, 'controls') ?? 'body'\"");
    expect(teleportMarkup).toContain(":disabled=\"!teleportTo(k, 'results')\"");
  });
});
