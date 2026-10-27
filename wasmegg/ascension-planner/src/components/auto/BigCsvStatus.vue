<!--
  A very large run's full CSV on its way to the collector's private store (store `sendFullCsv`,
  search/bigCsvUpload.ts): made, then uploaded by parts in the background after the run's final send.
  Nothing when there is none (most runs, or a collector without the store).
-->
<template>
  <p
    v-if="s"
    class="w-full text-body"
    :class="s.state === 'failed' ? 'font-bold text-amber-700' : 'text-slate-500'"
    data-testid="big-csv-status"
  >
    {{ s.message }}<span v-if="s.state === 'building' || s.state === 'uploading'"> {{ progress }}</span>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { spillSizeText } from '@/lib/legSpillText';

const store = useChainSearchStore();
const s = computed(() => store.bigCsvState);
const progress = computed(() => {
  const x = s.value;
  if (!x) return '';
  return x.total ? `${spillSizeText(x.done)} of ${spillSizeText(x.total)}` : spillSizeText(x.done);
});
</script>
