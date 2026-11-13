<!--
  More's "Final target TE" box (Fast/Exact's in ChainSearchPanel.vue, Custom's in InsanePanel.vue; 13 Nov 2026, Jordan's
  side via the orchestrator): kept, but on the store's one rule. What is typed is a draft (targetTe.ts) that goes through
  store.commitFinalTE on Enter or leaving the box, never per keystroke; a refused value shows the store's words under the
  box and the box goes back to the kept value. Disabled while a search runs, as before. The look is the caller's
  (`inputClass`); the root takes the caller's class (its width).
-->
<template>
  <span class="flex flex-col gap-1">
    <input
      :id="id"
      :value="d.draft.value"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      enterkeyhint="done"
      autocomplete="off"
      maxlength="6"
      :aria-label="ariaLabel"
      :aria-invalid="d.error.value ? 'true' : 'false'"
      :aria-describedby="d.error.value ? msgId : undefined"
      :disabled="store.isRunning"
      :class="inputClass"
      data-testid="final-target-input"
      @input="d.onInput(($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="d.commit()"
      @keydown.esc="d.revert()"
      @blur="d.commit()"
    />
    <span aria-live="polite" class="empty:hidden">
      <span v-if="d.error.value" :id="msgId" class="block text-small font-bold text-rose-700 normal-case tracking-normal" data-testid="final-target-msg">
        {{ d.error.value }}
      </span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { useId } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useTargetDraft } from './targetTe';

defineProps<{
  /** The input's own classes (each panel keeps its look). */
  inputClass?: string;
  id?: string;
  /** Only where no <label> wraps or names the box. */
  ariaLabel?: string;
}>();

const store = useChainSearchStore();
const msgId = `final-target-msg-${useId()}`;
const d = useTargetDraft({ current: () => store.finalTE, commit: n => store.commitFinalTE(n) });
</script>
