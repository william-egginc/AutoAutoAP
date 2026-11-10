/**
 * When a tip shows (components/Tip.vue; Allan, 9 Nov 2026): at once, with no delay, while the pointer is over the
 * button or it has the keyboard's focus; pinned by a tap on the small "i" beside it or by a long press on the button
 * (a touch screen has no hover); gone with Esc, or (pinned) a tap elsewhere.
 *
 * A TAP STILL PRESSES THE BUTTON. A plain tap is never swallowed and never opens the tip: the mouse events and the
 * focus a phone's browser sends after a tap (`mouseenter`, a focus that is not `:focus-visible`) are not a hover or
 * a keyboard focus. Only the click that ends a long press is stopped (in the capture phase, before the button's own
 * handler), so a long press shows the tip without also pressing the button; its context menu is stopped too.
 */
import { computed, ref } from 'vue';

/** How long a finger rests on the button before the tip shows. */
export const LONG_PRESS_MS = 500;
/** After a touch, the browser's own mouse events and focus for that tap are ignored for this long. */
export const TOUCH_GRACE_MS = 800;
/** A finger that moves further than this is scrolling, not pressing. */
const MOVE_SLOP_PX = 10;

interface PointerLike {
  pointerType?: string;
  clientX?: number;
  clientY?: number;
}
interface Cancellable {
  preventDefault(): void;
  stopPropagation(): void;
}

export function useTip() {
  const hover = ref(false);
  const focus = ref(false);
  const pinned = ref(false);
  const shown = computed(() => hover.value || focus.value || pinned.value);

  let lastTouch = -Infinity;
  let press: ReturnType<typeof setTimeout> | null = null;
  let pressAt: { x: number; y: number } | null = null;
  /** The click that ends a long press is the tip's, not the button's. */
  let swallowClick = false;
  const recentTouch = () => Date.now() - lastTouch < TOUCH_GRACE_MS;

  function cancelPress(): void {
    if (press) clearTimeout(press);
    press = null;
    pressAt = null;
  }

  function onMouseEnter(): void {
    if (!recentTouch()) hover.value = true;
  }
  function onMouseLeave(): void {
    hover.value = false;
  }
  function onFocusIn(e: { target: unknown }): void {
    if (recentTouch()) return;
    let keyboard = true;
    try {
      keyboard = (e.target as { matches?: (q: string) => boolean } | null)?.matches?.(':focus-visible') ?? true;
    } catch {
      // A browser without :focus-visible: a focus with no touch just before is the keyboard's.
    }
    if (keyboard) focus.value = true;
  }
  function onFocusOut(e: { relatedTarget: unknown; currentTarget: unknown }): void {
    // Focus moving between the button and its "i" keeps the tip.
    const box = e.currentTarget as { contains?: (n: unknown) => boolean } | null;
    if (e.relatedTarget && box?.contains?.(e.relatedTarget)) return;
    focus.value = false;
  }
  /** Esc: true when it hid a tip that was showing (Tip.vue then stops the key going further). */
  function onKeydown(e: { key?: string }): boolean {
    if (e.key !== 'Escape' || !shown.value) return false;
    hide();
    return true;
  }
  function hide(): void {
    hover.value = false;
    focus.value = false;
    pinned.value = false;
    cancelPress();
  }

  function onPointerDown(e: PointerLike): void {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    lastTouch = Date.now();
    swallowClick = false;
    cancelPress();
    pressAt = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
    press = setTimeout(() => {
      press = null;
      pinned.value = true;
      swallowClick = true;
    }, LONG_PRESS_MS);
  }
  function onPointerMove(e: PointerLike): void {
    if (!pressAt) return;
    if (Math.abs((e.clientX ?? 0) - pressAt.x) > MOVE_SLOP_PX || Math.abs((e.clientY ?? 0) - pressAt.y) > MOVE_SLOP_PX) cancelPress();
  }
  function onPointerEnd(): void {
    lastTouch = pressAt ? Date.now() : lastTouch;
    cancelPress();
    // A browser that sends no click after a long press: the next click (a key's Enter) is the button's again.
    if (swallowClick) setTimeout(() => (swallowClick = false), TOUCH_GRACE_MS);
  }
  /** On the wrapper, in the capture phase: stops only the click that ends a long press. */
  function onClickCapture(e: Cancellable): void {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }
  function onContextMenu(e: Cancellable): void {
    if (press || swallowClick) e.preventDefault();
  }

  /** The "i": shows or hides it. */
  function onInfoClick(): void {
    pinned.value = !pinned.value;
  }
  /** A tap or click outside the button and its "i" while it shows: hidden, whatever showed it. */
  function onOutside(): void {
    hide();
  }
  /** Any touch on the button or its "i" (Tip.vue's wrapper): the browser's mouse events and focus for that tap that
   *  follow are not a hover or a keyboard focus. */
  function onAnyPointerDown(e: PointerLike): void {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') lastTouch = Date.now();
  }

  return {
    shown,
    pinned,
    hide,
    onMouseEnter,
    onMouseLeave,
    onFocusIn,
    onFocusOut,
    onKeydown,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onClickCapture,
    onContextMenu,
    onInfoClick,
    onOutside,
    onAnyPointerDown,
  };
}
