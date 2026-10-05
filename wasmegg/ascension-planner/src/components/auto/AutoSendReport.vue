<!--
  How the last automatic send went (Find and share), for a panel that didn't do the sending itself.

  Runs outlive their panel now: the planner's tabs close it whenever the player looks elsewhere, and
  the run finishes and sends from the panel that started it. The panel opened afterwards is a new
  one that never heard the answer, so a failed send was silent (review, 30 Sept). The sending panel
  records the outcome in the store (chainSearch `lastAutoSend`) and this shows it; the sending panel
  keeps its own fuller report, so it hides this.
-->
<template>
  <p
    v-if="report"
    class="rounded-lg border px-3 py-2 text-[11px]"
    :class="
      !report.ok
        ? 'bg-red-50 border-red-200 text-red-800'
        : /\bbut\b/.test(report.text)
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
    "
  >
    <b>{{ report.ok ? 'Submitted automatically.' : "The automatic submit didn't go through." }}</b> {{ report.text }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';

const props = defineProps<{ kind: 'smart' | 'full' | 'by-date' }>();
const store = useChainSearchStore();

const report = computed(() => {
  const r = store.lastAutoSend;
  return r && r.kind === props.kind && !store.busy ? r : null;
});
</script>
