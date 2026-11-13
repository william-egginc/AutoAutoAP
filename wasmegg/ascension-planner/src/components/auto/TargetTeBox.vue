<!--
  The target box on Chain Finder > Target TE, first in Target TE's one card, "The target" (FastestRoute.vue; spec-targette, Jordan's OK
  12 Nov 2026, Joo's layout; left-aligned in the card like By a date's date choice, 13 Nov 2026): "Reach [490] TE as soon as possible". It is store.finalTE, the one remembered target (this
  browser and online Setup), the same as More's "Final target TE" boxes. Your TE + 1 up to 490; the target changes on
  Enter or leaving the box (targetTe.ts), never per keystroke, through the store's own guard (chainSearch.ts
  `commitFinalTE`). Not on By a date, which is fixed at 490.
-->
<template>
  <div class="flex flex-col items-start gap-1 text-left" data-region="target" data-testid="target-te">
    <div class="flex items-center justify-start gap-2 text-body text-slate-700">
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
        :aria-describedby="d.error.value ? 'target-te-msg' : undefined"
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
        {{ d.error.value }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { TARGET_TE_WORDS } from '@/lib/targetTeWords';
import { useTargetDraft } from './targetTe';

const store = useChainSearchStore();
const d = useTargetDraft({ current: () => store.finalTE, commit: n => store.commitFinalTE(n) });
</script>
