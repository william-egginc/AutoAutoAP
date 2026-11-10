/**
 * The in-house tip on the important buttons (Tip.vue, composables/useTip.ts, lib/tipPlace.ts; Allan, 9 Nov 2026: the
 * native `title` tips were slow and easy to miss). Shown at once on hover and on keyboard focus, gone with Esc; on a
 * touch screen a tap on the small "i" or a long press on the button shows it, and a plain tap on the button still
 * presses it. The tip is in the page with an id and role="tooltip", and the button points at it (aria-describedby).
 *
 * No DOM library here (vitest.config.ts): the handlers Tip.vue binds to mouseenter, focusin, keydown, pointerdown and
 * the click (capture) are driven with stand-in events, the placement is pure, and the markup is rendered on the
 * server. The real events in WebKit and Chrome: ~/code/aaap-tools/harness-r7/simpler/allan2-check.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString, type SSRContext } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import Tip from './Tip.vue';
import FollowButton from './FollowButton.vue';
import { LONG_PRESS_MS, useTip } from '@/composables/useTip';
import { placeTip } from '@/lib/tipPlace';
import { TIP_FOLLOW, TIP_SIMULATE, tipInfoLabel } from '@/lib/tipWords';

/** A stand-in event: records preventDefault / stopPropagation. */
function ev(init: Record<string, unknown> = {}) {
  const e = {
    prevented: false,
    stopped: false,
    preventDefault() {
      e.prevented = true;
    },
    stopPropagation() {
      e.stopped = true;
    },
    ...init,
  };
  return e;
}
/** A focus event on a button focused from the keyboard (`:focus-visible`), or by a tap / click (not). */
const focusEv = (visible: boolean) => ev({ target: { matches: (q: string) => (q === ':focus-visible' ? visible : false) } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTip: when the tip shows', () => {
  it('hover: shown at once (no delay), gone when the pointer leaves', () => {
    const t = useTip();
    expect(t.shown.value).toBe(false);
    t.onMouseEnter();
    expect(t.shown.value).toBe(true);
    t.onMouseLeave();
    expect(t.shown.value).toBe(false);
  });
  it('keyboard focus: shown at once; a focus from a click or a tap is not a reason to show it', () => {
    const t = useTip();
    t.onFocusIn(focusEv(true) as never);
    expect(t.shown.value).toBe(true);
    t.onFocusOut(ev({ relatedTarget: null }) as never);
    expect(t.shown.value).toBe(false);
    t.onFocusIn(focusEv(false) as never);
    expect(t.shown.value).toBe(false);
  });
  it('Esc hides it (hover, focus or pinned), and says it did', () => {
    const t = useTip();
    t.onMouseEnter();
    t.onFocusIn(focusEv(true) as never);
    const esc = ev({ key: 'Escape' });
    expect(t.onKeydown(esc as never)).toBe(true);
    expect(t.shown.value).toBe(false);
    expect(t.onKeydown(ev({ key: 'Escape' }) as never)).toBe(false);
    t.onInfoClick();
    expect(t.shown.value).toBe(true);
    t.onKeydown(ev({ key: 'Escape' }) as never);
    expect(t.shown.value).toBe(false);
  });
});

describe('useTip on a touch screen', () => {
  it('a plain tap on the button: no tip, and its click goes through (never swallowed)', () => {
    const t = useTip();
    t.onPointerDown(ev({ pointerType: 'touch', clientX: 10, clientY: 10 }) as never);
    vi.advanceTimersByTime(120);
    t.onPointerEnd();
    // The browser's mouse events after a tap: not a hover.
    t.onMouseEnter();
    t.onFocusIn(focusEv(true) as never);
    const click = ev();
    t.onClickCapture(click as never);
    expect(click.prevented).toBe(false);
    expect(click.stopped).toBe(false);
    expect(t.shown.value).toBe(false);
  });
  it('a long press shows it, and the click that ends it does not press the button; the next tap does', () => {
    const t = useTip();
    t.onPointerDown(ev({ pointerType: 'touch', clientX: 10, clientY: 10 }) as never);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(t.shown.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(t.shown.value).toBe(true);
    // The browser's own long-press menu (Android), while the finger is still down: not shown.
    const menu = ev();
    t.onContextMenu(menu as never);
    expect(menu.prevented).toBe(true);
    t.onPointerEnd();
    const after = ev();
    t.onClickCapture(after as never);
    expect(after.prevented).toBe(true);
    expect(after.stopped).toBe(true);
    // The next plain tap presses the button.
    t.onPointerDown(ev({ pointerType: 'touch', clientX: 10, clientY: 10 }) as never);
    t.onPointerEnd();
    const next = ev();
    t.onClickCapture(next as never);
    expect(next.prevented).toBe(false);
  });
  it('a finger that moves (a scroll) is not a long press', () => {
    const t = useTip();
    t.onPointerDown(ev({ pointerType: 'touch', clientX: 10, clientY: 10 }) as never);
    t.onPointerMove(ev({ pointerType: 'touch', clientX: 10, clientY: 40 }) as never);
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(t.shown.value).toBe(false);
  });
  it('a tap on the "i" is a touch: the mouse events and the focus the browser sends after it are not a hover', () => {
    const t = useTip();
    t.onAnyPointerDown(ev({ pointerType: 'touch' }) as never);
    t.onInfoClick();
    t.onMouseEnter();
    t.onFocusIn(focusEv(true) as never);
    t.onOutside();
    expect(t.shown.value).toBe(false);
  });
  it('the "i": a tap shows it, a second tap or a tap elsewhere hides it', () => {
    const t = useTip();
    t.onInfoClick();
    expect(t.shown.value).toBe(true);
    t.onInfoClick();
    expect(t.shown.value).toBe(false);
    t.onInfoClick();
    t.onOutside();
    expect(t.shown.value).toBe(false);
  });
  it('a mouse press is never a long press', () => {
    const t = useTip();
    t.onPointerDown(ev({ pointerType: 'mouse', clientX: 1, clientY: 1 }) as never);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    t.onPointerEnd();
    const click = ev();
    t.onClickCapture(click as never);
    expect(click.prevented).toBe(false);
  });
});

describe('placeTip: inside the screen, off the button', () => {
  const view = { width: 320, height: 640 };
  const anchor = (left: number, top: number, width = 120, height = 44) => ({ left, top, width, height, right: left + width, bottom: top + height });
  it('above the button when there is room, clear of it', () => {
    const p = placeTip(anchor(100, 300), { width: 200, height: 60 }, view);
    expect(p.side).toBe('above');
    expect(p.top + 60).toBeLessThanOrEqual(300);
  });
  it('below when there is no room above', () => {
    const p = placeTip(anchor(100, 20), { width: 200, height: 60 }, view);
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThanOrEqual(64);
  });
  it('clamped at both edges of a 320 px screen', () => {
    const right = placeTip(anchor(280, 300, 40), { width: 256, height: 60 }, view);
    expect(right.left + 256).toBeLessThanOrEqual(320 - 8);
    const left = placeTip(anchor(0, 300, 40), { width: 256, height: 60 }, view);
    expect(left.left).toBeGreaterThanOrEqual(8);
  });
});

describe('Tip.vue markup', () => {
  async function render(props: Record<string, unknown>) {
    const ctx: SSRContext = {};
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Tip, props as never, {
            default: ({ describedby }: { describedby: string }) => h('button', { 'aria-describedby': describedby, id: 'the-button' }, 'Simulate this plan'),
          }),
      }),
      ctx
    );
    return { html, body: String(ctx.teleports?.body ?? '') };
  }
  it('the button points at the tip (aria-describedby); the tip has that id, role="tooltip", hidden until shown', async () => {
    const { html, body } = await render({ text: TIP_SIMULATE, name: 'Simulate this plan' });
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(body).toContain(`id="${id}"`);
    expect(body).toContain('role="tooltip"');
    expect(body).toContain(TIP_SIMULATE.replace(/'/g, '&#39;'));
    expect(body).toMatch(/role="tooltip"[^>]*\shidden|\shidden[^>]*role="tooltip"/);
  });
  it('the "i" beside it: a real button with a name, a 44 px target on a phone, pointing at the same tip', async () => {
    const { html } = await render({ text: TIP_SIMULATE, name: 'Simulate this plan' });
    const info = html.slice(html.indexOf('<button', html.indexOf('the-button')), html.indexOf('>', html.indexOf('data-testid="tip-info"')) + 1);
    expect(info).toContain('type="button"');
    expect(info).toContain(`aria-label="${tipInfoLabel('Simulate this plan')}"`);
    expect(info).toMatch(/min-h-\[44px\]/);
    expect(info).toMatch(/min-w-\[44px\]/);
    expect(info).toContain('aria-expanded="false"');
  });
  it('no "i" where it would not fit (info=false): the long press still shows it', async () => {
    const { html } = await render({ text: TIP_SIMULATE, name: 'Fast', info: false });
    expect(html).not.toContain('data-testid="tip-info"');
  });
});

describe('the buttons carry the tip, not a native title', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  const template = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
  it('Follow this route: the tip with its words, aria-describedby, no title', async () => {
    setActivePinia(createPinia());
    const ctx: SSRContext = {};
    const html = await renderToString(
      createSSRApp({ render: () => h(FollowButton, { chain: [200, 490], goalKey: 'fastest-490', from: 'answer', main: true, primary: true }) }),
      ctx
    );
    const btn = html.slice(html.indexOf('<button'), html.indexOf('>', html.indexOf('data-testid="follow-route"')) + 1);
    expect(btn).not.toMatch(/\stitle=/);
    const id = btn.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(String(ctx.teleports?.body)).toContain(`id="${id}"`);
    expect(String(ctx.teleports?.body)).toContain(TIP_FOLLOW);
  });
  it('Simulate this plan, everywhere it is a button: inside a Tip with TIP_SIMULATE, no SIMULATE_TITLE', () => {
    for (const f of ['auto/InstantRoute.vue', 'auto/RouteResultCard.vue', 'auto/ByDateRouteCard.vue', 'auto/TopRoutes.vue']) {
      const t = template(read(f));
      expect(t, f).not.toContain('SIMULATE_TITLE');
      const n = t.split(/>\s*Simulate this plan\s*</).length - 1;
      expect(n, f).toBeGreaterThan(0);
      expect(t.split(':text="TIP_SIMULATE"').length - 1, f).toBe(n);
    }
  });
  it('the run button and the Search card choices', () => {
    expect(template(read('auto/FindBar.vue'))).toMatch(/<Tip[^>]*:text="runTip"/);
    expect(read('auto/FindBar.vue')).toMatch(/TIP_RUN_FAST[\s\S]*TIP_RUN_EXACT[\s\S]*TIP_RUN_CUSTOM/);
    const panel = template(read('auto/SearchPanel.vue'));
    expect(panel).toMatch(/<Tip[^>]*:text="o\.tip"/);
    expect(read('auto/SearchPanel.vue')).toMatch(/TIP_SEARCH_FAST[\s\S]*TIP_SEARCH_EXACT[\s\S]*TIP_SEARCH_CUSTOM/);
  });
});
