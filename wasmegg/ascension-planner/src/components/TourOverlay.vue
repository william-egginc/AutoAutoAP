<!--
  The live overlay on a tour picture (spec-tour-v4, 16 Nov 2026, Jordan: "when the next slide uses the same page picture,
  keep the picture and SLIDE the ring, arrow and magnifier to the new target; only fade when the picture itself changes").
  Over a clean page picture: the dim (the ring's own huge shadow, cut off by this box), the ring, an enlarged copy of the
  thing when it is one small thing (`sprite`), a light ring round the top tab the thing lives under (`tabs`: an undimmed
  patch of the same picture, so the tab shows through the dim), and one arrow. Every number is in the picture's own pixels
  and drawn as a percentage, so the box scales with the picture. Elements stay mounted and move with a CSS transition
  (320 ms; none under prefers-reduced-motion). Pictures with several targets stay baked and have no overlay.
  Made from lib/tourSlides.ts (numbers by ~/code/aaap-tools/harness-r7/simpler/tour/make-tour-images-v4.mjs).
-->
<template>
  <div class="tov absolute inset-0 overflow-hidden rounded-xl" aria-hidden="true" data-testid="tour-overlay">
    <div class="tov-move tov-ring absolute" :style="box(overlay.ring)" data-testid="tour-ring"></div>
    <div
      class="tov-move tov-tab absolute"
      :style="{ ...box(tab), opacity: overlay.tabs.length ? 1 : 0, backgroundImage: `url(${base})`, backgroundSize: `${(overlay.cw / tab.w) * 100}% ${(overlay.ch / tab.h) * 100}%`, backgroundPosition: `${place(tab.x, overlay.cw - tab.w)}% ${place(tab.y, overlay.ch - tab.h)}%` }"
      data-testid="tour-tab-ring"
    ></div>
    <img
      v-if="spriteSrc"
      :src="spriteSrc"
      alt=""
      class="tov-move tov-sprite absolute max-w-none"
      :style="{ ...box(spriteRect), opacity: overlay.sprite ? 1 : 0 }"
      data-testid="tour-sprite"
    />
    <img
      v-if="insetSrc"
      :src="insetSrc"
      alt=""
      class="tov-move tov-inset absolute max-w-none"
      :style="{ ...box(insetRect), opacity: overlay.inset ? 1 : 0 }"
      data-testid="tour-inset"
    />
    <div
      v-if="insetSrc"
      class="tov-move tov-inset-ring absolute"
      :style="{ ...box(insetRing), opacity: overlay.inset ? 1 : 0 }"
      data-testid="tour-inset-ring"
    ></div>
    <svg
      class="tov-move absolute"
      :style="arrowStyle"
      :viewBox="`0 0 ${arrowW} 40`"
      data-testid="tour-arrow"
      :data-dir="overlay.arrow.dir"
    >
      <path :d="`M${arrowW - 4} 20 H 18`" stroke="#4f46e5" stroke-width="6" stroke-linecap="round" fill="none" />
      <path d="M4 20 L 22 6 V 34 Z" fill="#4f46e5" stroke="#4f46e5" stroke-width="3" stroke-linejoin="round" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SlideOverlay, TourRect } from '@/lib/tourSlides';

const props = defineProps<{
  overlay: SlideOverlay;
  /** The picture under it (for the undimmed tab patch). */
  base: string;
}>();

const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(3)}%`;
const box = (r: TourRect) => ({ left: pct(r.x, props.overlay.cw), top: pct(r.y, props.overlay.ch), width: pct(r.w, props.overlay.cw), height: pct(r.h, props.overlay.ch) });
/** background-position for a patch at `at` of `room` (0 when it fills the picture). */
const place = (at: number, room: number) => (room <= 0 ? 0 : ((at / room) * 100).toFixed(3));

// The tab ring and the enlarged copy stay mounted when a slide has none (they fade out where they were), so a move
// from a slide with one to a slide with none does not jump.
const lastTab = ref<TourRect>(props.overlay.tabs[0] ?? { x: 0, y: 0, w: 1, h: 1 });
watch(() => props.overlay.tabs[0], t => { if (t) lastTab.value = t; });
const tab = computed(() => props.overlay.tabs[0] ?? lastTab.value);
const lastSprite = ref<{ src: string; rect: TourRect } | null>(props.overlay.sprite ? { src: props.overlay.sprite, rect: props.overlay.rect } : null);
watch(() => props.overlay.sprite, s => { if (s) lastSprite.value = { src: s, rect: props.overlay.rect }; }, { flush: 'sync' });
watch(() => props.overlay.rect, r => { if (props.overlay.sprite) lastSprite.value = { src: props.overlay.sprite, rect: r }; }, { flush: 'sync' });
const spriteSrc = computed(() => props.overlay.sprite ?? lastSprite.value?.src ?? null);
const spriteRect = computed(() => (props.overlay.sprite ? props.overlay.rect : (lastSprite.value?.rect ?? props.overlay.rect)));

// The tab-row inset (a thing whose top tab is out of the picture) stays mounted too and fades.
const lastInset = ref(props.overlay.inset);
watch(() => props.overlay.inset, i => { if (i) lastInset.value = i; });
const inset = computed(() => props.overlay.inset ?? lastInset.value);
const insetSrc = computed(() => inset.value?.sprite ?? null);
const insetRect = computed(() => inset.value?.rect ?? props.overlay.rect);
const insetRing = computed(() => inset.value?.ring ?? props.overlay.rect);

// The arrow: drawn pointing left (its tip at (4, 20)) and turned about its tip; the turn takes the short way round.
const ROT = { left: 0, up: 90, right: 180, down: 270 } as const;
const angle = ref<number>(ROT[props.overlay.arrow.dir]);
watch(
  () => props.overlay.arrow.dir,
  d => {
    const delta = ((((ROT[d] - angle.value) % 360) + 540) % 360) - 180;
    angle.value += delta;
  }
);
const arrowW = computed(() => props.overlay.arrow.len + 8);
const arrowStyle = computed(() => {
  const a = props.overlay.arrow;
  return {
    left: pct(a.x - 4, props.overlay.cw),
    top: pct(a.y - 20, props.overlay.ch),
    width: pct(a.len + 8, props.overlay.cw),
    height: pct(40, props.overlay.ch),
    transformOrigin: `${((4 / (a.len + 8)) * 100).toFixed(3)}% 50%`,
    transform: `rotate(${angle.value}deg)`,
    filter: 'drop-shadow(0 2px 3px rgba(15,23,42,.45))',
  };
});
</script>

<style scoped>
.tov-ring {
  box-sizing: border-box;
  border: 3px solid #4f46e5;
  border-radius: 12px;
  box-shadow: 0 0 0 100vmax rgba(15, 23, 42, 0.58);
}
.tov-tab {
  box-sizing: border-box;
  border: 2px solid #a5b4fc;
  border-radius: 12px;
  background-origin: border-box;
  background-clip: border-box;
  background-repeat: no-repeat;
}
.tov-inset {
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.45);
}
.tov-inset-ring {
  box-sizing: border-box;
  border: 2px solid #a5b4fc;
  border-radius: 9px;
}
.tov-sprite {
  border-radius: 10px;
}
.tov-move {
  transition: left 320ms cubic-bezier(0.4, 0, 0.2, 1), top 320ms cubic-bezier(0.4, 0, 0.2, 1), width 320ms cubic-bezier(0.4, 0, 0.2, 1),
    height 320ms cubic-bezier(0.4, 0, 0.2, 1), transform 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .tov-move {
    transition: none;
  }
}
</style>
