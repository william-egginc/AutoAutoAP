<!--
  THE INSTANT CARD'S "?" (the card clean-up, notes/instant-proposal.md; Jordan OKed it 12 Nov 2026): a reason or an
  explanation that moved off the card's lines sits behind it, in its words of before (the saved-from sentence, the gear
  warning's reason and Why list, the quick-estimate note). One "?" style on the card: this one replaces HelpTip's there.

  HelpTip's look (a 14 px "?" with an invisible 44 px area round it on a phone) with Tip.vue's behaviour
  (composables/useTip.ts): shown at once on hover and on keyboard focus, a tap or click on the "?" pins it open or shuts
  it (on a touch screen that tap is the way in), gone with Esc or a tap elsewhere. The
  bubble is always in the page (hidden until shown) with an id and role="tooltip"; the "?" names it with
  aria-describedby, and says aria-expanded / aria-controls. Teleported to <body> with fixed coordinates (the cards clip
  their overflow), placed by lib/tipPlace.ts, styled as Tip.vue's bubble. The slot can hold a sentence or a list.
-->
<template>
  <span
    ref="root"
    class="relative inline-flex align-middle"
    @mouseenter="tip.onMouseEnter"
    @mouseleave="tip.onMouseLeave"
    @focusin="tip.onFocusIn"
    @focusout="tip.onFocusOut"
    @pointerdown.capture="tip.onAnyPointerDown"
  >
    <button
      ref="trigger"
      type="button"
      class="relative before:absolute before:-inset-[15px] before:content-[''] sm:before:hidden w-3.5 h-3.5 rounded-full border border-slate-400 text-slate-500 text-small font-bold leading-none flex items-center justify-center hover:border-slate-600 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-label="label"
      :aria-describedby="id"
      :aria-expanded="tip.shown.value ? 'true' : 'false'"
      :aria-controls="id"
      data-testid="card-help"
      @click.stop="tip.onInfoClick"
    >
      ?
    </button>
    <Teleport to="body">
      <span
        :id="id"
        ref="bubble"
        role="tooltip"
        :hidden="!tip.shown.value"
        class="pointer-events-none fixed z-[9999] w-max rounded-lg border border-slate-200 bg-white px-3 py-2 text-small font-normal normal-case tracking-normal text-slate-700 shadow-lg"
        :style="{ left: `${pos.left}px`, top: `${pos.top}px`, maxWidth: 'min(20rem, calc(100vw - 16px))' }"
        :data-side="pos.side"
        data-testid="card-help-text"
        ><slot
      /></span>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useTip } from '@/composables/useTip';
import { placeTip } from '@/lib/tipPlace';

withDefaults(
  defineProps<{
    /** The "?"'s name for a screen reader: HelpTip's words by default. */
    label?: string;
  }>(),
  { label: 'What does this mean?' }
);

const id = `cardhelp-${useId()}`;
const tip = useTip();
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLElement | null>(null);
const bubble = ref<HTMLElement | null>(null);
const pos = ref<{ left: number; top: number; side: 'above' | 'below' }>({ left: 0, top: 0, side: 'above' });

function place(): void {
  const t = trigger.value;
  const b = bubble.value;
  if (!t || !b) return;
  pos.value = placeTip(t.getBoundingClientRect(), { width: b.offsetWidth, height: b.offsetHeight }, {
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
/** While shown: Esc anywhere, a tap elsewhere, and a scroll or resize moves it with its "?". */
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
</script>
