<!--
  A TIP ON AN IMPORTANT BUTTON (Allan, 9 Nov 2026, relayed by Jordan: the native `title` tips were slow to appear and
  easy to miss). Follow this route, Simulate this plan, the run button and the Search card's choices. The words are in
  lib/tipWords.ts (DRAFT).

  Shown AT ONCE on hover and on keyboard focus, gone with Esc (composables/useTip.ts). On a touch screen: a tap on the
  small "i" beside the button (a 44 px target; drawn on a phone or a screen with no hover, `info` false where it would
  not fit) or a long press on the button shows it; a plain tap on the button still presses it, and only the click that
  ends a long press is stopped. No focus is moved or trapped.

  The tip is always in the page (hidden until shown) with an id and role="tooltip", and the slot hands that id to the
  button for aria-describedby, so a screen reader reads the text with the button. Like HelpTip.vue it is TELEPORTED TO
  <body> WITH FIXED COORDINATES (the tables and cards it sits in clip their overflow), placed by lib/tipPlace.ts: above
  the button when it fits, else below, never over it, clamped inside the screen. Styled as the site's cards: white,
  slate border, small text.

  Usage: <Tip :text="TIP_SIMULATE" name="Simulate this plan" v-slot="{ describedby }"><button :aria-describedby=...>
-->
<template>
  <span
    ref="root"
    :class="fill ? 'flex items-stretch' : 'inline-flex items-center'"
    @mouseenter="tip.onMouseEnter"
    @mouseleave="tip.onMouseLeave"
    @focusin="tip.onFocusIn"
    @focusout="tip.onFocusOut"
    @pointerdown.capture="tip.onAnyPointerDown"
  >
    <span
      ref="trigger"
      class="tip-trigger min-w-0"
      :class="fill ? 'flex flex-1' : 'inline-flex'"
      @pointerdown="tip.onPointerDown"
      @pointermove="tip.onPointerMove"
      @pointerup="tip.onPointerEnd"
      @pointercancel="tip.onPointerEnd"
      @click.capture="tip.onClickCapture"
      @contextmenu="tip.onContextMenu"
    >
      <slot :describedby="text ? id : undefined" />
    </span>
    <button
      v-if="info && text"
      type="button"
      class="tip-info min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-label="tipInfoLabel(name)"
      :aria-expanded="tip.pinned.value ? 'true' : 'false'"
      :aria-controls="id"
      data-testid="tip-info"
      @click.stop="tip.onInfoClick"
    >
      <span aria-hidden="true" class="tip-i inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-small font-bold leading-none"></span>
    </button>
    <Teleport v-if="text" to="body">
      <span
        :id="id"
        ref="bubble"
        role="tooltip"
        :hidden="!tip.shown.value"
        class="pointer-events-none fixed z-[9999] w-max rounded-lg border border-slate-200 bg-white px-3 py-2 text-small font-normal normal-case tracking-normal text-slate-700 shadow-lg"
        :style="{ left: `${pos.left}px`, top: `${pos.top}px`, maxWidth: 'min(16rem, calc(100vw - 16px))' }"
        :data-side="pos.side"
        data-testid="tip"
        >{{ text }}</span
      >
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useTip } from '@/composables/useTip';
import { placeTip } from '@/lib/tipPlace';
import { tipInfoLabel } from '@/lib/tipWords';

const props = withDefaults(
  defineProps<{
    /** What the button does (lib/tipWords.ts). Empty: no tip, the button alone. */
    text: string;
    /** The button's own words, for the "i"'s name ("About Simulate this plan"). */
    name: string;
    /** Draw the "i" beside the button on a phone / a screen with no hover. Off where it would not fit (the Search
     *  card's three choices): the long press still shows the tip there. */
    info?: boolean;
    /** The button fills the row it is in (the run button, a Search choice). */
    fill?: boolean;
  }>(),
  { info: true, fill: false }
);

const id = `tip-${useId()}`;
const tip = useTip();
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLElement | null>(null);
const bubble = ref<HTMLElement | null>(null);
const pos = ref<{ left: number; top: number; side: 'above' | 'below' }>({ left: 0, top: 0, side: 'above' });

function place(): void {
  const t = trigger.value;
  const b = bubble.value;
  if (!t || !b) return;
  const r = t.getBoundingClientRect();
  pos.value = placeTip(r, { width: b.offsetWidth, height: b.offsetHeight }, {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: window.innerHeight,
  });
}
function onKey(e: KeyboardEvent): void {
  tip.onKeydown(e);
}
function onDocPointer(e: Event): void {
  if (root.value && !root.value.contains(e.target as Node)) tip.onOutside();
}
/** While shown: Esc anywhere, a tap elsewhere (pinned), and a scroll or resize moves it with its button. */
function listen(on: boolean): void {
  if (on) {
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDocPointer, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
  } else {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDocPointer, true);
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
  }
}
watch(
  () => tip.shown.value,
  async s => {
    listen(s);
    if (!s) return;
    await nextTick();
    place();
  }
);
onBeforeUnmount(() => {
  if (tip.shown.value) listen(false);
  tip.hide();
});

defineExpose({ id, text: props.text });
</script>

<style scoped>
/* A long press shows the tip: no callout or text selection on the button under the finger (iOS). */
.tip-trigger {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
/* The "i" is drawn, not text: the button's name is its aria-label, and the row's text stays the buttons' words. */
.tip-i::before {
  content: 'i';
}
/* The "i" on a phone and on any screen without hover; a desktop has hover and keyboard focus. */
.tip-info {
  display: inline-flex;
}
@media (min-width: 640px) and (hover: hover) {
  .tip-info {
    display: none;
  }
}
</style>
