<!--
  The first-visit tour's card (spec-firsttour, 8 Nov 2026): the step line, the title (the dialog's name, focused when
  the card opens and on Back / Next), one or two sentences, Back / Next (Done on the last), and the Skip row with
  "Remind me later". A NON-MODAL dialog: the page stays usable, as every step asks the player to use it. Placed and
  shown by FirstTour.vue. Words: lib/firstTourWords.ts (DRAFT).
-->
<template>
  <div
    role="dialog"
    aria-labelledby="first-tour-title"
    aria-describedby="first-tour-body"
    class="rounded-2xl border border-indigo-200 bg-white px-4 pt-3 pb-1 shadow-xl"
    data-testid="first-tour"
  >
    <p class="label text-indigo-700 tabular-nums" data-testid="first-tour-label">{{ label }}</p>
    <h2 id="first-tour-title" ref="titleEl" tabindex="-1" class="mt-0.5 text-title font-bold text-slate-900 focus:outline-none">
      {{ title }}
    </h2>
    <div id="first-tour-body" class="mt-1 space-y-1">
      <p class="text-body text-slate-700">{{ body }}</p>
      <p v-if="closing" class="text-small text-slate-500">{{ closing }}</p>
    </div>
    <div class="mt-2 flex justify-end gap-2">
      <button
        v-if="!first"
        type="button"
        class="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        data-testid="first-tour-back"
        @click="emit('back')"
      >
        {{ FIRST_TOUR_BACK }}
      </button>
      <button
        type="button"
        class="min-h-[44px] min-w-[44px] rounded-lg bg-indigo-600 px-4 text-body font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        data-testid="first-tour-next"
        @click="last ? emit('done') : emit('next')"
      >
        {{ last ? FIRST_TOUR_DONE : FIRST_TOUR_NEXT }}
      </button>
    </div>
    <div class="mt-2 flex flex-wrap items-center justify-between gap-x-3 border-t border-slate-200">
      <label class="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-body text-slate-700">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-slate-400 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
          :checked="remind"
          data-testid="first-tour-remind"
          @change="emit('update:remind', ($event.target as HTMLInputElement).checked)"
        />
        {{ FIRST_TOUR_REMIND }}
      </label>
      <button
        type="button"
        class="inline-flex min-h-[44px] items-center px-1 text-body font-bold text-slate-600 underline underline-offset-2 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        data-testid="first-tour-skip"
        @click="emit('skip')"
      >
        {{ FIRST_TOUR_SKIP }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  FIRST_TOUR_BACK,
  FIRST_TOUR_DONE,
  FIRST_TOUR_NEXT,
  FIRST_TOUR_REMIND,
  FIRST_TOUR_SKIP,
} from '@/lib/firstTourWords';

defineProps<{
  label: string;
  title: string;
  body: string;
  closing?: string;
  first: boolean;
  last: boolean;
  remind: boolean;
}>();
const emit = defineEmits<{
  back: [];
  next: [];
  done: [];
  skip: [];
  'update:remind': [value: boolean];
}>();

const titleEl = ref<HTMLElement | null>(null);
/** Focus the title (the card opened, or Back / Next). */
function focusTitle(): void {
  titleEl.value?.focus({ preventScroll: true });
}
defineExpose({ focusTitle });
</script>
