<!--
  The memory warning for the instant answer during a search: pressing Work it out again, Work it out
  anyway or Check exactly / Check all again while a Smart search, Full sweep or By a date run is going
  asks first. InstantRoute.vue shows it directly under the button that was pressed (9 Oct review: it
  sat at the top of the card, by the "Saved from…" note, while the button pressed was lower down).
  One component for every spot; the parent decides which spot and what each choice does.
-->
<template>
  <div
    class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 space-y-2"
    role="alert"
    data-testid="instant-warning"
    :data-at="at"
  >
    <p>
      A search is running. {{ check ? 'Checking exactly' : 'Working out the instant answer' }} now runs extra workers
      alongside it, which uses more memory and could crash the search on a big run.
    </p>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <button
        type="button"
        class="font-black uppercase tracking-widest text-[10px] text-amber-900 underline"
        data-testid="instant-warning-once"
        @click="emit('go')"
      >
        Run it anyway
      </button>
      <button
        type="button"
        class="font-black uppercase tracking-widest text-[10px] text-amber-900 underline"
        data-testid="instant-warning-remember"
        @click="emit('remember')"
      >
        Don't ask again, just warn me
      </button>
      <button
        type="button"
        class="font-black uppercase tracking-widest text-[10px] text-slate-500 underline"
        data-testid="instant-warning-cancel"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WarnAt } from '@/search/instantDeferral';

defineProps<{
  /** Check exactly / Check all again asked (else Work it out again / anyway). */
  check?: boolean;
  /** Which button asked: for tests and the page's own checks. */
  at: WarnAt;
}>();
// Not `once`: Vue reads an `onOnce` listener as the `.once` modifier of an event named '' and the
// card failed to render at all (found in the browser, 9 Oct).
const emit = defineEmits<{ go: []; remember: []; cancel: [] }>();
</script>
