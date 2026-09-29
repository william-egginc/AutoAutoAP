<!--
  Safari only, beside the Start button of the long runs. Safari reports no memory figures at all, so
  the page cannot warn before Safari runs out -- and what running out looks like there is a white
  page with the workers still going, which one player watched for an hour before reloading.
-->
<template>
  <div v-if="isSafari" class="p-3 rounded-xl border border-sky-200 bg-sky-50 text-[11px] text-sky-900 leading-relaxed">
    <span class="font-black uppercase tracking-wide">Long runs in Safari.</span>
    Safari doesn't tell pages how much memory they're using, so this page can't warn you before it runs short. If the
    page goes white mid-run, Safari has stopped drawing it, but the workers may still be running: check Activity
    Monitor. For runs longer than a few hours:
    <span class="font-bold">use {{ workers }} workers or fewer</span> (this machine has {{ store.machineThreads }}),
    turn off extensions that change web pages for this site (Safari › Settings › Extensions), keep the window open
    rather than minimised, and keep the Mac plugged in and awake. Progress is saved every minute or two, so after a
    reload you can carry on from where it stopped.
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';

const store = useChainSearchStore();

/** Safari on the Mac or iPad, not Chrome/Edge/Firefox (which all say "Safari" too). */
const isSafari =
  typeof navigator !== 'undefined' &&
  /safari/i.test(navigator.userAgent) &&
  !/chrome|chromium|crios|fxios|edg|android/i.test(navigator.userAgent);

/** About 60% of the cores: each worker is its own heap, and Safari squeezes the whole tab. */
const workers = computed(() => Math.max(1, Math.ceil(store.machineThreads * 0.6)));
</script>
