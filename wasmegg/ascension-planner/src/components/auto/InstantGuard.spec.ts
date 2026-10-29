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
import { INSTANT_FAILED, cardErrorOf, cardErrorText, isRenderFailure, scrubErrorText } from '@/lib/renderGuard';

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
    // Player words outside the closed Details fold: no raw error, no "table".
    const failedCard = byTestId(root, 'instant-failed')!;
    const outside = failedCard.children.filter(c => c.props['data-testid'] !== 'instant-failed-details');
    expect(outside.map(textOf).join('')).not.toMatch(/TypeError|undefined|table/i);
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

// crash2 (26 Oct 2026): a fresh Chrome showed the message and nobody could tell what threw. The guard keeps the error.
describe('InstantGuard keeps what went wrong', () => {
  const ID = 'EI1234567890123456';
  it('the error name and message in a closed Details fold, one tagged console line, no ID', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Card = defineComponent({
      setup: () => () => {
        const e = new TypeError(`Cannot read properties of null (reading 'insertBefore') for ${ID}`);
        e.stack = [
          `TypeError: Cannot read properties of null (reading 'insertBefore') for ${ID}`,
          '    at insert (https://example.test/assets/index-abc.js:1:200)',
          '    at mountElement (https://example.test/assets/index-abc.js?k=3726b0602ac0&id=' + ID + ':2:300)',
          '    at patch (https://example.test/assets/index-abc.js:3:400)',
          '    at render (https://example.test/assets/index-abc.js:4:500)',
        ].join('\n');
        throw e;
      },
    });
    const { root } = mount(Card);
    await nextTick();
    const fold = byTestId(root, 'instant-failed-details');
    expect(fold).not.toBeNull();
    expect(fold!.tag).toBe('details');
    // Closed by default: no `open`.
    expect(fold!.props.open).toBeFalsy();
    const text = textOf(byTestId(root, 'instant-failed-error')!);
    expect(text).toContain("TypeError: Cannot read properties of null (reading 'insertBefore')");
    expect(text).toContain('(while drawing)');
    expect(text).toContain('at insert (https://example.test/assets/index-abc.js:1:200)');
    // 3 stack lines at most, no query, no ID, anywhere on the page or in the console.
    expect(text.split('\n')).toHaveLength(4);
    expect(text).not.toContain('at render');
    expect(text).not.toContain('?k=');
    expect(textOf(root)).not.toMatch(/EI\d{16}/);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]![0]);
    expect(line).toMatch(/^\[instant\] card could not be drawn: TypeError: Cannot read properties of null/);
    expect(line).not.toMatch(/EI\d{16}/);
    expect(spy.mock.calls[0]).toHaveLength(1);
    // Show it again clears it.
    (byTestId(root, 'instant-failed-again')!.props.onClick as () => void)();
    await nextTick();
    spy.mockRestore();
  });

  it('cardErrorOf: name, message, where, 3 lines; a thrown non-error; production codes', () => {
    const e = cardErrorOf('plain text thrown', 'https://vuejs.org/error-reference/#runtime-15');
    expect(e).toEqual({ name: 'Error', message: 'plain text thrown', where: 'updating', stack: [] });
    expect(cardErrorText(e)).toBe('Error: plain text thrown (while updating)');
    const r = new RangeError('Invalid time zone specified: Mars/Base');
    r.stack = 'RangeError: Invalid time zone specified: Mars/Base\n    at a (x.js:1:1)\n    at b (x.js:2:2)\n    at c (x.js:3:3)\n    at d (x.js:4:4)';
    const k = cardErrorOf(r, 'setup function');
    expect(k.name).toBe('RangeError');
    expect(k.where).toBe('setting up');
    expect(k.stack).toEqual(['at a (x.js:1:1)', 'at b (x.js:2:2)', 'at c (x.js:3:3)']);
    // Safari: no header line, the frames only.
    const s = new Error('boom');
    s.stack = 'render@https://example.test/a.js:1:2\npatch@https://example.test/a.js:3:4';
    expect(cardErrorOf(s, 'render function').stack).toEqual(['render@https://example.test/a.js:1:2', 'patch@https://example.test/a.js:3:4']);
    expect(cardErrorOf(new Error('x'.repeat(1000))).message.length).toBeLessThanOrEqual(300);
  });

  // ux29-c (27 Oct 2026): in Chrome the card's update threw "reading 'nextSibling'" and, stopped half way, the next
  // one threw "reading 'emitsOptions'"; Details showed only the second, which says nothing about the cause.
  it('a second throw: Details keeps the first, both get their console line; Show it again starts over', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const which = ref<'first' | 'second' | 'none'>('first');
    const Card = defineComponent({
      setup: () => () => {
        if (which.value === 'first') throw new TypeError("Cannot read properties of null (reading 'nextSibling')");
        if (which.value === 'second') throw new TypeError("Cannot read properties of null (reading 'emitsOptions')");
        return h('section', 'Instant answer: 312 TE');
      },
    });
    const { root } = mount(Card);
    await nextTick();
    which.value = 'second';
    await nextTick();
    await nextTick();
    const text = textOf(byTestId(root, 'instant-failed-error')!);
    expect(text).toContain("(reading 'nextSibling')");
    expect(text).not.toContain('emitsOptions');
    expect(spy.mock.calls.map(c => String(c[0]))).toEqual([
      "[instant] card could not be drawn: TypeError: Cannot read properties of null (reading 'nextSibling')",
      "[instant] card could not be drawn: TypeError: Cannot read properties of null (reading 'emitsOptions')",
    ]);
    (byTestId(root, 'instant-failed-again')!.props.onClick as () => void)();
    await nextTick();
    expect(textOf(byTestId(root, 'instant-failed-error')!)).toContain("(reading 'emitsOptions')");
    which.value = 'none';
    (byTestId(root, 'instant-failed-again')!.props.onClick as () => void)();
    await nextTick();
    expect(byTestId(root, 'instant-failed')).toBeNull();
    expect(textOf(root)).toBe('Instant answer: 312 TE');
    spy.mockRestore();
  });

  it('scrubErrorText: every ID and every URL query goes, the rest stays', () => {
    expect(scrubErrorText(`no save for ${ID} or ei0000000000000001`)).toBe('no save for EI… or EI…');
    expect(scrubErrorText('GET https://c.example/prefs?k=abc123&x=1 failed')).toBe('GET https://c.example/prefs failed');
    // The query and what follows it in the same word (a line number can't be told from a value) go.
    expect(scrubErrorText('at f (/assets/x.js?v=2:1:1)')).toBe('at f (/assets/x.js)');
    expect(scrubErrorText('is it undefined? yes')).toBe('is it undefined? yes');
  });
});
