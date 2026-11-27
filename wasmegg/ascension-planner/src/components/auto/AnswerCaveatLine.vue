<!--
  The one caveat line under an answer, with every caveat in full behind a closed "Why? ›" (lib/answerCaveat.ts;
  Jordan, 25 Oct 2026). A native disclosure: the line itself is the summary, so the whole line opens it (44 px on
  phones). Nothing to fold: the line alone.

  `effect` (the instant card only, Jordan 12 Nov 2026): the gear warning cut to what it does to the dates ("Up to about
  5 days later than shown.", lib/instantCardWords.ts gearEffectLine), in amber; the line and the Why list, word for
  word, behind the card's "?" (CardHelp.vue). Fastest's, By a date's and the chain search's result cards pass none.
-->
<template>
  <p v-if="caveat && effect" class="text-body text-amber-900" data-testid="answer-caveat">
    <span data-testid="answer-caveat-line">{{ effect }}</span
    >{{ ' '
    }}<CardHelp
      ><span class="block">{{ caveat.line }}</span
      ><span v-for="(t, i) in caveat.more" :key="i" class="mt-1 block">{{ t }}</span></CardHelp
    >
  </p>
  <div v-else-if="caveat" class="text-body text-amber-900" data-testid="answer-caveat">
    <details v-if="caveat.more.length" data-testid="answer-caveat-why">
      <summary
        class="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[44px] sm:min-h-0 py-2.5 sm:py-0"
        data-testid="answer-caveat-summary"
      >
        <span data-testid="answer-caveat-line">{{ caveat.line }}</span
        >{{ ' '
        }}<span class="font-bold text-amber-800 underline decoration-dotted underline-offset-2 whitespace-nowrap"
          >Why? ›</span
        >
      </summary>
      <ul class="mt-1 space-y-1 text-small text-slate-700 list-disc pl-4" data-testid="answer-caveat-more">
        <li v-for="(t, i) in caveat.more" :key="i">{{ t }}</li>
      </ul>
    </details>
    <p v-else data-testid="answer-caveat-line">{{ caveat.line }}</p>
  </div>
</template>

<script setup lang="ts">
import type { AnswerCaveat } from '@/lib/answerCaveat';
import CardHelp from './CardHelp.vue';

defineProps<{
  caveat: AnswerCaveat | null;
  /** The instant card's effect line (see above); absent or null: the line and its Why? › as before. */
  effect?: string | null;
}>();
</script>
