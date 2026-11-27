<!--
  The instant answer's file couldn't be had (InstantRoute.vue `noTable`): the card that says so, never nothing
  (Jordan, 23 Oct 2026: By a date on egg-beta lost the whole box with no word why). Two reasons:
    - the file is missing, cut short, a web page in its place, stalled, or no connection: "The instant answer
      couldn't be loaded." with Retry (QA break-it #5);
    - the file is a newer version than this page reads ("precomputed table version N is not supported": the
      site was updated while the tab was open): "An older version of this page is open: reload it to get the
      instant answer." with Reload.
  Under it, what to do meanwhile (NoInstantAnswer.vue: By a date's quick estimate, or Fastest's pointer to it).
-->
<template>
  <NoInstantAnswer :heading="older ? TABLE_OLDER_PAGE : TABLE_LOAD_FAILED" @by-date="emit('by-date')">
    <template v-if="$slots.default" #default><slot /></template>
  </NoInstantAnswer>
  <div class="flex flex-wrap items-center gap-2">
    <button
      v-if="older"
      type="button"
      class="min-h-[44px] px-4 rounded-lg border border-emerald-300 bg-white text-body font-bold text-emerald-800 hover:bg-emerald-50"
      data-testid="instant-reload"
      @click="reload"
    >
      Reload
    </button>
    <button
      v-else
      type="button"
      class="min-h-[44px] px-4 rounded-lg border border-emerald-300 bg-white text-body font-bold text-emerald-800 hover:bg-emerald-50"
      data-testid="instant-retry"
      @click="emit('retry')"
    >
      Retry
    </button>
  </div>
</template>

<script setup lang="ts">
import NoInstantAnswer from './NoInstantAnswer.vue';
import { TABLE_LOAD_FAILED, TABLE_OLDER_PAGE } from '@/search/tableFetch';

defineProps<{
  /** The file is a newer version than this page reads (tableFetch.ts `tableNewerThanPage`). */
  older: boolean;
}>();
const emit = defineEmits<{ retry: []; 'by-date': [] }>();
function reload(): void {
  location.reload();
}
</script>
