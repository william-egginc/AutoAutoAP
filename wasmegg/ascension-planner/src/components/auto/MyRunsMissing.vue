<!--
  My runs' "A run of yours isn't here?" (16 Oct 2026): type the id of a run on the board (its first
  characters are enough) and read, in plain words, why it is or isn't listed as yours (lib/myRuns.ts
  `whyNotMine`): another browser's code under another name, a different timezone or gear, a TE above the
  save's, or no code in this browser at all. A tester's newest runs were missing and nothing said why.
  Nothing is fetched: it reads the rows LeaderboardPanel already has.
-->
<template>
  <details class="rounded-lg border border-slate-200 bg-white/60 px-3 py-2 text-body" data-testid="my-runs-missing">
    <!-- 44 px tall on a phone (ux review 26 Oct, row 12: it was 264×15), as it was from sm up. -->
    <summary class="min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0 cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500" data-testid="my-runs-missing-summary">
      A run of yours isn’t here?
    </summary>
    <div class="mt-2 space-y-2">
      <p class="text-slate-500 leading-relaxed">
        Type its id (the first 8 characters are enough; it is in the run’s CSV link on the {{ NAMES.compare }}) and this
        says why it isn’t counted as yours.
      </p>
      <input
        v-model="typed"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="e.g. 1a2b3c4d"
        aria-label="The run’s id"
        class="w-40 rounded-lg border-slate-300 text-body tabular-nums py-1.5"
        data-testid="my-runs-missing-id"
      />
      <div v-if="answers.length" class="space-y-2" aria-live="polite">
        <div
          v-for="a in answers"
          :key="a.id"
          class="rounded-md bg-slate-50 px-2 py-1.5"
          data-testid="my-runs-missing-answer"
        >
          <p v-if="a.label" class="tabular-nums font-bold text-slate-600">{{ a.label }}</p>
          <p v-for="(line, i) in a.lines" :key="i" class="text-slate-600 leading-relaxed">{{ line }}</p>
        </div>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BoardRow } from '@/lib/leaderboardRank';
import { rowsById, whyNotMine, type LookAlike } from '@/lib/myRuns';
import { NAMES } from '@/lib/siteNav';

const props = defineProps<{
  /** Every row the board has: the public ones and this browser's own (/mine). */
  rows: BoardRow[];
  lookAlike: LookAlike;
  /** The loaded save's account key, null without a save. */
  saveKey: string | null;
  /** This site in this browser holds a code for the account. */
  hasCode: boolean;
  /** What is typed to start with (specs). */
  initialId?: string;
}>();

const typed = ref(props.initialId ?? '');

const answers = computed(() => {
  const q = typed.value.trim();
  if (q.length < 6) return [];
  const ctx = { ...props.lookAlike, saveKey: props.saveKey, hasCode: props.hasCode };
  const found = rowsById(props.rows, q);
  if (!found.length) return [{ id: '', label: '', lines: whyNotMine(null, ctx) }];
  return found.map(r => ({
    id: r.id as string,
    label: `${(r.id as string).slice(0, 8)} · ${r.chain.join(' ')}`,
    lines: whyNotMine(r, ctx),
  }));
});
</script>
