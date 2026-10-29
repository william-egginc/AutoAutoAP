<!--
  A very large run's full CSV on its way to the collector's private store (store `sendFullCsv`,
  search/bigCsvUpload.ts): made, then uploaded by parts in the background after the run's final send.
  Nothing when there is none (most runs, or a collector without the store).
  Once kept, the same .csv.gz is still on this computer: "Download the full CSV" saves it as run-full.csv.gz
  (composables/useFullCsvGz.ts), or one line says it is gone.
-->
<template>
  <div v-if="s" class="w-full space-y-2">
    <p
      class="text-body"
      :class="s.state === 'failed' ? 'font-bold text-amber-700' : 'text-slate-500'"
      data-testid="big-csv-status"
    >
      {{ s.message }}<span v-if="s.state === 'building' || s.state === 'uploading'"> {{ progress }}</span>
    </p>
    <template v-if="s.state === 'done'">
      <button
        v-if="onDisk"
        type="button"
        class="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-body font-bold hover:bg-slate-50"
        data-testid="full-csv-gz"
        @click="save(s.total)"
      >
        {{ fullCsvGzButton(s.bytes ?? s.total) }}
      </button>
      <p v-else-if="onDisk === false" class="text-body text-slate-500" data-testid="full-csv-gone">
        {{ fullCsvGone() }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { spillSizeText } from '@/lib/legSpillText';
import { fullCsvGone, fullCsvGzButton, useFullCsvGz } from '@/composables/useFullCsvGz';

const store = useChainSearchStore();
const s = computed(() => store.bigCsvState);
const progress = computed(() => {
  const x = s.value;
  if (!x) return '';
  return x.total ? `${spillSizeText(x.done)} of ${spillSizeText(x.total)}` : spillSizeText(x.done);
});

const { onDisk, check, forget, save } = useFullCsvGz();
// Kept: is the file it uploaded (`total` bytes) still here? Anything else: not known.
watch(
  () => (s.value?.state === 'done' ? s.value.total : null),
  total => (total === null ? forget() : void check(total)),
  { immediate: true }
);
</script>
