<!--
  "Send my CSV too" and "Also send diagnostics", the two extras that go with a shared result. The same
  two boxes under Find and submit (FindBar.vue) and under Share this result on all three screens, on
  one set of choices (composables/useShareExtras.ts), so ticking one place ticks the other.
-->
<template>
  <div class="space-y-1.5">
    <label class="flex items-start gap-3 cursor-pointer text-[11px] text-indigo-900/80">
      <input v-model="sendCsv" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
      <span>
        <span class="font-bold">Send my CSV too</span>: every route this search found, best first (the same file as
        Download CSV)<template v-if="csvDetail"> {{ csvDetail }}</template
        >. It is compressed before it leaves your machine. Untick it to send the headline alone.
      </span>
    </label>
    <label class="flex items-start gap-3 cursor-pointer text-[11px] text-indigo-900/80">
      <input v-model="sendDiagnostics" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
      <span>
        <span class="font-bold">Also send diagnostics</span>: memory readings, how many workers ran, any crash or
        carry-on, and your browser and system. One line of numbers in the CSV's header; no player ID and no save.
      </span>
    </label>
    <label
      v-if="sendDiagnostics"
      class="flex items-start gap-3 cursor-pointer text-[11px] text-indigo-900/70 ml-6"
      data-testid="diagnostics-default"
    >
      <input v-model="diagnosticsByDefault" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
      <span>Tick this by default from now on</span>
    </label>
    <p v-if="sendDiagnostics && !sendCsv" class="text-[11px] font-semibold text-amber-700 ml-6">
      Diagnostics travel inside the CSV, so they can't be sent while "Send my CSV too" is unticked.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useShareExtras } from '@/composables/useShareExtras';

defineProps<{ csvDetail?: string }>();
const { sendCsv, sendDiagnostics, diagnosticsByDefault } = useShareExtras();
</script>
