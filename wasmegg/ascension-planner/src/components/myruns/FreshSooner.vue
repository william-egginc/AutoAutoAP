<!--
  Right now's "Starting fresh would be sooner" (spec-r7verify, 1 Nov 2026; lib/freshSooner.ts, composables/useNowPage.ts
  `freshLine` / `fastestFollowed`): the forced build-up followed ends more than an hour after a fresh start, so the line
  says by how much with both dates, and "Switch to Fastest" follows Fastest for this ascension only (Setup unchanged).
  While that holds, a quieter line says so, with Undo. Plain data in, `switch` out. Words DRAFT (lib/freshSoonerWords.ts).
-->
<template>
  <div v-if="line" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="now-fresh-sooner">
    <p :id="lineId" class="text-body text-amber-900 max-w-prose tabular-nums">{{ line }}</p>
    <button
      type="button"
      :aria-describedby="lineId"
      class="min-h-[44px] min-w-[44px] rounded-xl border border-indigo-600 bg-white px-3 py-1.5 text-body text-indigo-900 hover:bg-indigo-50"
      data-testid="now-switch-fastest"
      @click="emit('switch', true)"
    >
      {{ SWITCH_TO_FASTEST }}
    </button>
  </div>
  <div v-else-if="followed" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="now-fastest-followed">
    <p :id="followedId" class="text-small text-slate-600 max-w-prose">{{ FASTEST_FOLLOWED_LINE }}</p>
    <button
      type="button"
      :aria-describedby="followedId"
      class="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-small text-slate-700 hover:bg-slate-50"
      data-testid="now-undo-fastest"
      @click="emit('switch', false)"
    >
      {{ UNDO_FASTEST }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { FASTEST_FOLLOWED_LINE, SWITCH_TO_FASTEST, UNDO_FASTEST } from '@/lib/freshSoonerWords';

defineProps<{
  /** "Starting fresh would end this ascension … sooner: … vs …." in the card's zone; '' or absent: no line. */
  line?: string;
  /** Fastest is followed for this ascension: the quieter line with Undo. */
  followed?: boolean;
}>();
const emit = defineEmits<{ switch: [on: boolean] }>();
/** One of each on the page (Right now's). */
const lineId = 'now-fresh-line';
const followedId = 'now-fastest-line';
</script>
