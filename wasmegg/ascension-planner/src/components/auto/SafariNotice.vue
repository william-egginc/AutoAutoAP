<!--
  Safari only, beside the Start button of the long runs (an hour or more, or a Custom run with no estimate: lib/safariNotice.ts). Safari reports no memory figures at all, so
  the page cannot warn before Safari runs out -- and what running out looks like there is a white
  page with the workers still going, which one player watched for an hour before reloading.
-->
<template>
  <div v-if="isSafari && shown" class="p-3 rounded-xl border border-sky-200 bg-sky-50 text-body text-sky-900">
    <span class="font-bold">Long run in Safari?</span>
    If the page goes white, Safari has stopped drawing it but the search is probably still running: don’t close the
    tab. Use <span class="font-bold">{{ workers }} workers or fewer</span> (this Mac has {{ store.machineThreads }}),
    turn off page-changing extensions for this site, keep the Mac plugged in and awake, and keep this window open, not
    minimized. Progress is saved as it goes, so a reload carries on where it stopped.
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { DEFAULT_WORKER_CAP } from '@/search/batch';
import { showSafariNotice } from '@/lib/safariNotice';
import type { SearchOption } from '@/lib/searchOption';

const props = defineProps<{
  /** The run's estimate the screen shows, seconds (null or absent: none known). */
  estimateSeconds?: number | null;
  option?: SearchOption;
}>();
const shown = computed(() => showSafariNotice(props.estimateSeconds, props.option));

const store = useChainSearchStore();

/** Safari on the Mac or iPad, not Chrome/Edge/Firefox (which all say "Safari" too). */
const isSafari =
  typeof navigator !== 'undefined' &&
  /safari/i.test(navigator.userAgent) &&
  !/chrome|chromium|crios|fxios|edg|android/i.test(navigator.userAgent);

/** About 60% of the cores, and never more than the default's cap (search/batch.ts DEFAULT_WORKER_CAP):
 *  each worker is its own heap, and Safari squeezes the whole tab. */
const workers = computed(() => Math.max(1, Math.min(DEFAULT_WORKER_CAP, Math.ceil(store.machineThreads * 0.6))));
</script>
