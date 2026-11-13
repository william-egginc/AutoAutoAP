<!--
  The target box on Chain Finder > Target TE, right under the "Target TE | By a date" switch (spec-targette, Jordan's OK
  12 Nov 2026, Joo's layout): "Reach [490] TE as soon as possible". It is store.finalTE, the one remembered target (this
  browser and online Setup), the same as More's "Final target TE" boxes. Your TE + 1 up to 490; the target changes on
  Enter or leaving the box (targetTe.ts), never per keystroke. Not on By a date, which is fixed at 490.
-->
<template>
  <div class="flex flex-col items-center gap-1 text-center" data-region="target" data-testid="target-te">
    <div class="flex items-center justify-center gap-2 text-body text-slate-700">
      <label for="target-te-input" class="font-bold">{{ TARGET_TE_WORDS.before }}</label>
      <input
        id="target-te-input"
        :value="d.draft.value"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        enterkeyhint="done"
        autocomplete="off"
        maxlength="6"
        :aria-label="TARGET_TE_WORDS.label"
        :aria-invalid="d.error.value ? 'true' : 'false'"
        :aria-describedby="describedBy"
        :disabled="store.isRunning"
        class="w-20 min-h-[44px] sm:min-h-0 rounded-lg text-center text-base sm:text-body font-bold tabular-nums text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        :class="d.error.value ? 'border-rose-500' : 'border-slate-300'"
        data-testid="target-te-input"
        @input="d.onInput(($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="d.commit()"
        @keydown.esc="d.revert()"
        @blur="d.commit()"
      />
      <span>{{ TARGET_TE_WORDS.after }}</span>
    </div>
    <div aria-live="polite" class="empty:hidden">
      <p v-if="d.error.value" id="target-te-msg" class="text-small font-bold text-rose-700" data-testid="target-te-msg">
        {{ TARGET_TE_WORDS.invalid(range, store.finalTE) }}
      </p>
      <!-- Until the game expert answers whether the tables are right below 490 (TARGET_TE_WORDS.checkedMost). -->
      <p v-else-if="store.finalTE !== TARGET_TE_MAX" id="target-te-note" class="text-small text-slate-500" data-testid="target-te-note">
        {{ TARGET_TE_WORDS.checkedMost }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { TARGET_TE_WORDS } from '@/lib/targetTeWords';
import { TARGET_TE_MAX, targetRange, useTargetDraft } from './targetTe';

const store = useChainSearchStore();
const range = computed(() => targetRange(store.currentTE));
const d = useTargetDraft({
  current: () => store.finalTE,
  range: () => range.value,
  running: () => store.isRunning,
  set: n => {
    store.finalTE = n;
  },
});
/** The message while it shows, else the note while it shows. */
const describedBy = computed(() =>
  d.error.value ? 'target-te-msg' : store.finalTE !== TARGET_TE_MAX ? 'target-te-note' : undefined
);
</script>
