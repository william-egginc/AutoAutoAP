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
    :class="phase === 'welcome' ? 'max-w-[30rem] px-5 pt-5 pb-2 sm:px-7 sm:pt-7' : 'max-w-[47.5rem] px-2 pt-2 pb-1 sm:px-5 sm:pt-4'"
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
      <picture>
        <source media="(max-width: 639px)" :srcset="slide.phone.src" :width="slide.phone.width" :height="slide.phone.height" />
        <img
          :src="slide.desk.src"
          :width="slide.desk.width"
          :height="slide.desk.height"
          :alt="FIRST_TOUR_ALT[slide.id]"
          loading="lazy"
          decoding="async"
          class="block h-auto w-full rounded-xl border border-slate-200 bg-slate-700"
          data-testid="tour-picture"
        />
      </picture>
      <div class="px-1.5 pt-2 sm:px-0.5 sm:pt-3">
        <p class="label text-indigo-700 tabular-nums" data-testid="tour-step">{{ firstTourLabel(index + 1, total) }}</p>
        <h2 id="tour-title" ref="titleEl" tabindex="-1" class="mt-0.5 text-title font-bold text-slate-900 focus:outline-none">
          {{ FIRST_TOUR_STEPS[slide.id].title }}
        </h2>
        <div id="tour-body" class="mt-1 space-y-1">
          <p class="text-body text-slate-700">{{ FIRST_TOUR_STEPS[slide.id].body }}</p>
          <p v-if="last" class="text-small text-slate-500">{{ FIRST_TOUR_CLOSING }}</p>
        </div>
        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5" aria-hidden="true">
            <span
              v-for="k in total"
              :key="k"
              class="block h-2 rounded-full"
              :class="k - 1 === index ? 'w-5 bg-indigo-600' : 'w-2 bg-slate-300'"
            ></span>
          </span>
          <span class="flex gap-2">
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
          <label class="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-body text-slate-700">
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
import { computed, ref } from 'vue';
import type { TourSlide } from '@/lib/tourSlides';
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
  slide?: TourSlide | null;
}>();
const emit = defineEmits<{
  take: [];
  skip: [];
  load: [];
  back: [];
  next: [];
  done: [];
  'update:remind': [value: boolean];
}>();
const last = computed(() => props.index >= props.total - 1);

const titleEl = ref<HTMLElement | null>(null);
const takeEl = ref<HTMLElement | null>(null);
defineExpose({
  focusTake: () => takeEl.value?.focus(),
  focusTitle: () => titleEl.value?.focus(),
});
</script>
