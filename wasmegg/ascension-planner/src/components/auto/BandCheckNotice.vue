<!--
  "Did you mean...?" under a band box. Reads the text with the band checker and lists what looks off,
  each with a one-click fix when there is an obvious one. Shows nothing for a clean box. It only
  suggests: pressing a button puts the fixed text in the box, and the player can still edit it.
-->
<template>
  <div v-if="issues.length" class="space-y-1.5" role="status">
    <p
      v-for="(issue, i) in issues"
      :key="i"
      class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900 leading-relaxed"
    >
      <span>{{ issue.message }}</span>
      <button
        v-if="issue.fix"
        type="button"
        :disabled="disabled"
        class="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-800 hover:bg-amber-100 disabled:opacity-40"
        @click="emit('use', issue.fix)"
      >
        Use {{ issue.fix }}
      </button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { checkBandText } from '@/search/bandCheck';
import { getActivePinia } from 'pinia';
import { useChainSearchStore } from '@/stores/chainSearch';

const props = defineProps<{
  text: string;
  currentTE: number;
  finalTE: number;
  /** The ascension count this box is meant to make, when it has one. */
  ascensions?: number;
  disabled?: boolean;
}>();
const emit = defineEmits<{ (e: 'use', text: string): void }>();

// The First ascension setting, for the "your TE now" message. Without a store (a component test
// rendering this alone) the message speaks of the default.
const store = getActivePinia() ? useChainSearchStore() : null;
const issues = computed(() =>
  checkBandText(props.text, {
    currentTE: props.currentTE,
    finalTE: props.finalTE,
    ascensions: props.ascensions,
    firstAscension: store?.firstAscension,
  })
);
</script>
