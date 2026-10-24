/**
 * Never nothing at the Vue layer (Jordan's Safari shot, 24 Oct 2026: By a date showed the instant answer's Hide pill
 * with nothing under it, while Nearby routes read the answer it had found). A component whose render throws is drawn
 * as nothing in a production build; InstantGuard.ts says so instead. Rendered with a small in-memory renderer
 * (Vue's createRenderer), as the guard reacts to an error after its first render, which a server render never sees.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  Teleport,
  createCommentVNode,
  createRenderer,
  defineComponent,
  h,
  nextTick,
  ref,
  type Component,
  type VNode,
} from 'vue';
import InstantGuard from './InstantGuard';
import { INSTANT_FAILED, isRenderFailure } from '@/lib/renderGuard';

interface Node {
  tag: string;
  text?: string;
  props: Record<string, unknown>;
  children: Node[];
  parent: Node | null;
}
const node = (tag: string, text?: string): Node => ({ tag, text, props: {}, children: [], parent: null });

function makeRenderer(root: Node) {
  const find = (n: Node, pred: (n: Node) => boolean): Node | null => {
    if (pred(n)) return n;
    for (const c of n.children) {
      const f = find(c, pred);
      if (f) return f;
    }
    return null;
  };
  const r = createRenderer<Node, Node>({
    createElement: t => node(t),
    createText: t => node('#text', t),
    createComment: t => node('#comment', t),
    setText: (n, t) => void (n.text = t),
    setElementText: (n, t) => {
      n.children = [{ ...node('#text', t), parent: n }];
    },
    insert: (c, p, a) => {
      if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
      const i = a ? p.children.indexOf(a) : -1;
      if (i >= 0) p.children.splice(i, 0, c);
      else p.children.push(c);
      c.parent = p;
    },
    remove: c => {
      const p = c.parent;
      if (p) p.children.splice(p.children.indexOf(c), 1);
      c.parent = null;
    },
    parentNode: n => n.parent,
    nextSibling: n => (n.parent ? (n.parent.children[n.parent.children.indexOf(n) + 1] ?? null) : null),
    patchProp: (el, key, _prev, next) => void (el.props[key] = next),
    querySelector: sel => find(root, n => sel === `#${String(n.props.id)}`),
  });
  return r;
}
/** Every text on the page, in order (what a player could read). */
const textOf = (n: Node): string =>
  n.tag === '#comment' ? '' : (n.text ?? '') + n.children.map(textOf).join('');
const byTestId = (n: Node, id: string): Node | null =>
  n.props['data-testid'] === id ? n : n.children.map(c => byTestId(c, id)).find(Boolean) ?? null;

function mount(child: Component, page: () => VNode | null = () => null) {
  const root = node('root');
  const errors: unknown[] = [];
  const app = makeRenderer(root).createApp({
    render: () => h('div', [h(InstantGuard, null, { default: () => h(child) }), page()]),
  });
  app.config.errorHandler = e => void errors.push(e);
  app.mount(root);
  return { root, errors };
}

describe('isRenderFailure', () => {
  it('setup, render and update, in development and production words', () => {
    for (const info of ['setup function', 'render function', 'component update']) expect(isRenderFailure(info)).toBe(true);
    for (const code of [0, 1, 15]) expect(isRenderFailure(`https://vuejs.org/error-reference/#runtime-${code}`)).toBe(true);
  });
  it('not handlers, watchers or hooks: the card still shows', () => {
    for (const info of ['component event handler', 'watcher callback', 'mounted hook', 'native event handler'])
      expect(isRenderFailure(info)).toBe(false);
    for (const code of [2, 5, 6, 10, 14]) expect(isRenderFailure(`https://vuejs.org/error-reference/#runtime-${code}`)).toBe(false);
  });
});

describe('InstantGuard', () => {
  it('a card whose render throws: the message and Show it again, never nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = ref(true);
    let mounts = 0;
    const Card = defineComponent({
      setup() {
        mounts++;
        return () => {
          if (broken.value) throw new TypeError("undefined is not an object (evaluating 'r.legs')");
          return h('section', 'Instant answer: 314 TE');
        };
      },
    });
    const { root, errors } = mount(Card);
    await nextTick();
    expect(byTestId(root, 'instant-failed')).not.toBeNull();
    expect(textOf(root)).toContain(INSTANT_FAILED);
    expect(textOf(root)).toContain('Show it again');
    // Player words: no raw error, no "table".
    expect(textOf(root)).not.toMatch(/TypeError|undefined|table/i);
    expect(errors).toEqual([]);
    expect(spy).toHaveBeenCalled();
    // Show it again: a fresh card.
    broken.value = false;
    (byTestId(root, 'instant-failed-again')!.props.onClick as () => void)();
    await nextTick();
    expect(byTestId(root, 'instant-failed')).toBeNull();
    expect(textOf(root)).toContain('Instant answer: 314 TE');
    expect(mounts).toBe(2);
    spy.mockRestore();
  });

  it('a card that draws: as it is, no message', async () => {
    const Card = defineComponent({ setup: () => () => h('section', 'Instant answer: 313 TE') });
    const { root } = mount(Card);
    await nextTick();
    expect(byTestId(root, 'instant-failed')).toBeNull();
    expect(textOf(root)).toBe('Instant answer: 313 TE');
  });

  it('a part inside the card failing blanks only that part (the card is still there)', async () => {
    const Part = defineComponent({
      setup: () => () => {
        throw new Error('part');
      },
    });
    const Card = defineComponent({ setup: () => () => h('section', ['Instant answer', h(Part)]) });
    const { root, errors } = mount(Card);
    await nextTick();
    expect(byTestId(root, 'instant-failed')).toBeNull();
    expect(textOf(root)).toBe('Instant answer');
    expect(errors).toHaveLength(1);
  });

  // Why InstantRoute's "Share this result" Teleport no longer comes and goes with the answer: in Vue 3.5 a deferred
  // Teleport removed before it reached its target throws while the card updates, and the update stops half way. The
  // guard turns that into its message too (an update error, code 15).
  it('a deferred Teleport removed in the same update it was added: the update throws; the guard says so', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const answer = ref(false);
    const hold = ref(false);
    let first = true;
    // A part that, as it mounts, changes what the card shows (the integrity hold, say): the card draws again in the
    // same flush, before the Teleport's deferred mount.
    const Part = defineComponent({
      setup() {
        if (first) {
          first = false;
          hold.value = true;
        }
        return () => h('i', 'part');
      },
    });
    const Card = defineComponent({
      setup: () => () =>
        h('section', [
          'Instant answer',
          answer.value && !hold.value
            ? [h(Teleport, { to: '#share', defer: true }, [createCommentVNode('v-if', true)]), h(Part)]
            : createCommentVNode('v-if', true),
        ]),
    });
    const { root } = mount(Card, () => h('div', { id: 'share' }));
    await nextTick();
    answer.value = true;
    await nextTick();
    await nextTick();
    expect(byTestId(root, 'instant-failed')).not.toBeNull();
    spy.mockRestore();
  });
});
