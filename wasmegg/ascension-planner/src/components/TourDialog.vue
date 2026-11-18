<!--
  What the first-visit tour v2's modal shows (spec-firsttour2, 9 Nov 2026): the WELCOME box (a heading, one sentence,
  Take the tour / Skip / Load my save, Remind me later) and then, in the same box, the SLIDESHOW: one picture per step
  (lib/tourSlides.ts: a sample account's screen with everything but the step's part greyed out), the step line, the title,
  a caption that says everything without the picture, Back / Next (Done on the last) and the Skip row. A modal dialog
  (aria-modal); TourModal.vue puts it on the page, makes the app behind inert and traps focus. The picture is asked for
  only here, in the slides: a <picture> fetches one set (phone below 640 px), lazily. Words: lib/firstTourWords.ts.
-->
<template>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-title"
    aria-describedby="tour-body"
    class="w-full rounded-2xl bg-white shadow-2xl"
    :class="phase === 'welcome' ? 'max-w-[30rem] px-5 pt-5 pb-2 sm:px-7 sm:pt-7' : 'flex max-h-[calc(100dvh-1rem)] max-w-[47.5rem] flex-col px-2 pt-2 pb-1 sm:max-h-[calc(100dvh-3rem)] sm:px-5 sm:pt-4'"
    data-testid="tour-dialog"
  >
    <template v-if="phase === 'welcome'">
      <p class="label text-indigo-700">{{ FIRST_TOUR_WELCOME.label }}</p>
      <h2 id="tour-title" ref="titleEl" tabindex="-1" class="mt-1 text-headline font-black text-slate-900 focus:outline-none">
        {{ FIRST_TOUR_WELCOME.title }}
      </h2>
      <p id="tour-body" class="mt-2 text-body text-slate-700">{{ FIRST_TOUR_WELCOME.body }}</p>
      <div class="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          ref="takeEl"
          type="button"
          class="min-h-[52px] flex-1 rounded-xl bg-indigo-600 px-4 text-body font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          data-testid="tour-take"
          @click="emit('take')"
        >
          {{ FIRST_TOUR_WELCOME.take }}
        </button>
        <button
          type="button"
          class="min-h-[52px] flex-1 rounded-xl border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          data-testid="tour-welcome-skip"
          @click="emit('skip')"
        >
          {{ FIRST_TOUR_WELCOME.skip }}
        </button>
      </div>
      <button
        type="button"
        class="mt-2 min-h-[52px] w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-body font-bold text-indigo-800 hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        data-testid="tour-load"
        @click="emit('load')"
      >
        {{ FIRST_TOUR_WELCOME.load }}
      </button>
      <label class="mt-1 inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-body text-slate-700">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-slate-400 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
          :checked="remind"
          data-testid="tour-remind"
          @change="emit('update:remind', ($event.target as HTMLInputElement).checked)"
        />
        {{ FIRST_TOUR_REMIND }}
      </label>
    </template>

    <template v-else-if="slide">
      <!-- The picture. When the next slide uses the SAME page picture (lib/tourSlides.ts sharesPicture) the picture stays and the
           overlay (ring, arrow, copy, tab ring: TourOverlay.vue) slides to the new target; only when the picture itself changes
           does the new one fade in over the one before (lib/tourFade.ts; both off under prefers-reduced-motion), the one before
           kept under it for FADE_MS as a copy (empty alt, hidden from a screen reader). -->
      <!-- A short window (17 Nov 2026, 1280x573): the box is never taller than the window. The picture and the words scroll
           inside it; the step's Back / Next and the Skip row stay pinned under them. -->
      <div ref="scrollEl" class="min-h-0 flex-1 overflow-y-auto" data-testid="tour-scroll">
      <div
        class="tour-pic relative mx-auto"
        :style="{ '--r-d': slide.desk.width / slide.desk.height, '--r-p': slide.phone.width / slide.phone.height }"
        data-testid="tour-pic"
      >
        <picture
          v-if="prev"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0"
          data-testid="tour-picture-prev"
        >
          <source media="(max-width: 639px)" :srcset="prev.phone.src" :width="prev.phone.width" :height="prev.phone.height" />
          <img
            :src="prev.desk.src"
            :width="prev.desk.width"
            :height="prev.desk.height"
            alt=""
            class="block h-auto w-full rounded-xl border border-slate-200 bg-slate-700"
          />
          <template v-if="prev.overlay">
            <TourOverlay class="hidden sm:block" :overlay="prev.overlay.desk" :base="prev.desk.src" />
            <TourOverlay class="sm:hidden" :overlay="prev.overlay.phone" :base="prev.phone.src" />
          </template>
        </picture>
        <picture :key="slide.desk.src + slide.phone.src" :class="prev ? 'tour-fade-in' : ''">
          <source media="(max-width: 639px)" :srcset="slide.phone.src" :width="slide.phone.width" :height="slide.phone.height" />
          <img
            :src="slide.desk.src"
            :width="slide.desk.width"
            :height="slide.desk.height"
            :alt="words ? words.alt : FIRST_TOUR_ALT[slide.id as TourStepId]"
            loading="lazy"
            decoding="async"
            class="block h-auto w-full rounded-xl border border-slate-200 bg-slate-700"
            data-testid="tour-picture"
          />
        </picture>
        <div v-if="slide.overlay" :key="`o${slide.desk.src}${slide.phone.src}`" :class="prev ? 'tour-fade-in' : ''" class="pointer-events-none absolute inset-0">
          <TourOverlay class="hidden sm:block" :overlay="slide.overlay.desk" :base="slide.desk.src" />
          <TourOverlay class="sm:hidden" :overlay="slide.overlay.phone" :base="slide.phone.src" />
        </div>
      </div>
      <div class="px-1.5 pt-2 sm:px-0.5 sm:pt-3">
        <p class="label text-indigo-700 tabular-nums" data-testid="tour-step">{{ firstTourLabel(index + 1, total) }}</p>
        <h2 id="tour-title" ref="titleEl" tabindex="-1" class="mt-0.5 text-title font-bold text-slate-900 focus:outline-none">
          {{ words ? words.title : FIRST_TOUR_STEPS[slide.id as TourStepId].title }}
        </h2>
        <div id="tour-body" class="mt-1 space-y-1">
          <p class="text-body text-slate-700">{{ words ? words.body : FIRST_TOUR_STEPS[slide.id as TourStepId].body }}</p>
          <p v-if="last" class="text-small text-slate-600">{{ mode === 'full' ? FULL_TOUR_CLOSING : FIRST_TOUR_CLOSING }}</p>
          <!-- The first tour's last card points on to the longer one (never on the full tour's own). -->
          <button
            v-if="last && mode !== 'full'"
            type="button"
            class="inline-flex min-h-[44px] items-center rounded px-1 text-body font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            data-testid="tour-full"
            @click="emit('full')"
          >
            {{ FULL_TOUR_FROM_FIRST }} ›
          </button>
        </div>
      </div>
      </div>
      <div class="shrink-0 px-1.5 sm:px-0.5" data-testid="tour-footer">
        <div class="mt-2 flex min-w-0 items-center justify-between gap-2">
          <!-- Up to 24 slides a dot each; the full tour's 42 would push Back and Next out of the box at about 1000 px, so past that one
               thin bar fills as the tour goes (the step line above says where, in words). -->
          <span v-if="total <= 24" class="hidden min-w-0 items-center gap-1.5 sm:flex" aria-hidden="true">
            <span
              v-for="k in total"
              :key="k"
              class="block h-2 rounded-full"
              :class="k - 1 === index ? 'w-5 bg-indigo-600' : 'w-2 bg-slate-300'"
            ></span>
          </span>
          <span v-else class="block h-1.5 min-w-0 max-w-[16rem] flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true" data-testid="tour-progress">
            <span class="block h-full rounded-full bg-indigo-600" :style="{ width: `${((index + 1) / total) * 100}%` }"></span>
          </span>
          <span class="ml-auto flex shrink-0 gap-2">
            <button
              v-if="index > 0"
              type="button"
              class="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              data-testid="tour-back"
              @click="emit('back')"
            >
              {{ FIRST_TOUR_BACK }}
            </button>
            <button
              type="button"
              class="min-h-[44px] min-w-[44px] rounded-lg bg-indigo-600 px-4 text-body font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              data-testid="tour-next"
              @click="last ? emit('done') : emit('next')"
            >
              {{ last ? FIRST_TOUR_DONE : FIRST_TOUR_NEXT }}
            </button>
          </span>
        </div>
        <div class="mt-2 flex flex-wrap items-center justify-between gap-x-3 border-t border-slate-200">
          <label v-if="mode !== 'full'" class="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-body text-slate-700">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-slate-400 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
              :checked="remind"
              data-testid="tour-remind"
              @change="emit('update:remind', ($event.target as HTMLInputElement).checked)"
            />
            {{ FIRST_TOUR_REMIND }}
          </label>
          <button
            type="button"
            class="inline-flex min-h-[44px] items-center rounded px-1 text-body font-bold text-slate-600 underline underline-offset-2 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            data-testid="tour-skip"
            @click="emit('skip')"
          >
            {{ FIRST_TOUR_SKIP }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import TourOverlay from '@/components/TourOverlay.vue';
import { FADE_MS, shouldFade } from '@/lib/tourFade';
import type { TourSlide } from '@/lib/tourSlides';
import type { TourStepId } from '@/lib/firstTour';
import type { FullTourSlide } from '@/lib/fullTourSlides';
import { FULL_TOUR_CLOSING, FULL_TOUR_FROM_FIRST } from '@/lib/fullTourWords';
import {
  FIRST_TOUR_ALT,
  FIRST_TOUR_BACK,
  FIRST_TOUR_CLOSING,
  FIRST_TOUR_DONE,
  FIRST_TOUR_NEXT,
  FIRST_TOUR_REMIND,
  FIRST_TOUR_SKIP,
  FIRST_TOUR_STEPS,
  FIRST_TOUR_WELCOME,
  firstTourLabel,
} from '@/lib/firstTourWords';

const props = defineProps<{
  phase: 'welcome' | 'slides';
  remind: boolean;
  /** The slide shown (0-based) and how many there are. */
  index: number;
  total: number;
  slide?: TourSlide | FullTourSlide | null;
  /** 'full': the full tour (lib/fullTour.ts): its own words, no Remind me later, no pointer to itself. */
  mode?: 'first' | 'full';
  /** The full tour's title, body and alt text (lib/fullTourWords.ts); absent: the first tour's, by the slide's id. */
  words?: { title: string; body: string; alt: string } | null;
}>();
const emit = defineEmits<{
  take: [];
  skip: [];
  load: [];
  back: [];
  next: [];
  done: [];
  full: [];
  'update:remind': [value: boolean];
}>();
const last = computed(() => props.index >= props.total - 1);

// The slide before, kept for FADE_MS under the new one (a crossfade; none for the first slide or under reduced motion).
const prev = ref<TourSlide | FullTourSlide | null>(null);
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
watch(
  () => props.slide,
  (now, before) => {
    if (fadeTimer) clearTimeout(fadeTimer);
    // Fade only when the PICTURE changes: slides sharing one picture keep it and slide the overlay (TourOverlay.vue).
    prev.value = before && shouldFade(before.desk.src + before.phone.src, now ? now.desk.src + now.phone.src : null, reducedMotion()) ? before : null;
    if (prev.value) fadeTimer = setTimeout(() => (prev.value = null), FADE_MS + 40);
  }
);
onBeforeUnmount(() => {
  if (fadeTimer) clearTimeout(fadeTimer);
});

const titleEl = ref<HTMLElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
// A new slide starts at its top (the box scrolls only in a window too short even for the shrunk picture).
watch(() => props.index, () => { if (scrollEl.value) scrollEl.value.scrollTop = 0; });
const takeEl = ref<HTMLElement | null>(null);
defineExpose({
  focusTake: () => takeEl.value?.focus(),
  focusTitle: () => titleEl.value?.focus(),
});
</script>

<style scoped>
/* The picture is never taller than what is left of the window after the words and the buttons (about 21rem), but never under
   16rem wide: its shape is kept, so the ring and arrow (percentages of it) stay on their target. */
.tour-pic {
  max-width: max(16rem, calc((100dvh - 21rem) * var(--r-p)));
}
@media (min-width: 640px) {
  .tour-pic {
    max-width: max(16rem, calc((100dvh - 21rem) * var(--r-d)));
  }
}
.tour-fade-in {
  display: block;
  animation: tour-fade-in 200ms ease-out both;
}
@keyframes tour-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tour-fade-in {
    animation: none;
  }
}
</style>
