<!--
  The answer, the same way on both depths of Fastest route (the unified layout, phase 3): the
  route, how long it takes and when it lands, and the same row of things to do with it. Its main
  button is "Simulate this plan", the instant answer's name for the same action (glossary, 25 Oct 2026:
  it was "Build this plan"; the fill-only button was "Just fill it in"). Smart search
  and the Full sweep each had their own card with its own buttons ("Use this chain and build the
  plan", "Build this plan in the Auto Planner") in different places on the page.

  The route stays readable during a run -- it's the best so far, and always usable -- and the actions
  appear once the run stops. What each search wants to add (its guarantee, a contradiction it
  found) goes in the default slot.
-->
<template>
  <ResultCardFrame :still-going="running && days > 0">
    <template #heading>
      <template v-if="lastRun && !running">Your last run · {{ lastRun }}</template
      ><template v-else>{{ running ? 'Best so far' : 'Fastest found' }}</template
      ><template v-if="claim && !running">: {{ claim }}</template>
    </template>
    <template #headline>
      <!-- The finish date leads, the day count and ascensions under it (UX fluff review 2, 5 Nov 2026, item C0: with
           the date on top, "Compare runs by finish date" had nothing left to say). -->
      <div class="text-title font-bold text-slate-900 tabular-nums" data-testid="finish-date">
        <template v-if="days > 0">{{ endLabel }}</template><template v-else>pricing<AnimatedDots /></template>
      </div>
      <div v-if="days > 0" class="text-small font-bold text-emerald-800 tabular-nums">
        {{ days.toFixed(1) }} days{{ ' ' }}·{{ ' ' }}{{ chain.length }} {{ chain.length === 1 ? 'ascension' : 'ascensions' }}
      </div>
      <div v-if="source" class="text-small font-bold text-emerald-700/80">{{ source }}</div>
      <div class="tabular-nums text-body font-bold text-slate-900 break-words">
        {{ chain.join(' → ') }}
      </div>
      <!-- One meta line: when it ran, on which save, what it was priced with (lib/lastRunLine.ts `runMetaLine`; was
           the ran line here and "Priced with …" under the details, items C1 and C4). -->
      <p v-if="meta && !running" class="text-small text-emerald-900/80" data-testid="run-meta">{{ meta }}</p>
    </template>

    <slot />

    <template v-if="!running && days > 0" #actions>
      <!-- Follow this route (Jordan, 23 Oct 2026): this result, for Right now and saved online. First, then Simulate this
           plan: one order wherever the pair is shown (Allan, 9 Nov 2026). -->
      <FollowButton
        v-if="follow"
        primary
        :chain="chain"
        :goal-key="follow.goalKey"
        from="saved"
        :source="follow.source"
        :finish="follow.finish"
        :end-t-e="follow.endTE"
        :plan-start="follow.planStart"
        :deadline="follow.deadline ?? null"
      />
      <!-- What it opens is the button's tip (Tip.vue, lib/tipWords.ts TIP_SIMULATE); the line under the row that said it is
           gone (C6). -->
      <Tip :text="TIP_SIMULATE" name="Simulate this plan" v-slot="{ describedby }">
        <button
          :aria-describedby="describedby"
          type="button"
          :disabled="busy"
          :class="PRIMARY_BUTTON"
          @click="emit('build')"
        >
          Simulate this plan
        </button>
      </Tip>
      <button
        v-if="canFill"
        type="button"
        :class="SECONDARY_BUTTON"
        @click="emit('fill')"
      >
        Fill in Target TEs only
      </button>
      <button
        type="button"
        :class="SECONDARY_BUTTON"
        @click="toShare"
      >
        Share ↓
      </button>
      <!-- The CSV, the Excel file and the diagnostics under one Download ▾ (C5, C8). -->
      <DownloadMenu :items="downloads" testid="fastest-download" @pick="download" />
      <!-- The one Save, with its optional name (C7b: Saved for later's "Save this run" was a second Save for the
           same run). -->
      <CardSaveRow
        v-if="canSave"
        label="Save run"
        name-label="Name for this run (optional)"
        :saving="saving"
        :saved="saved"
        testid="fastest-save"
        @save="name => emit('save', name)"
      />
      <span v-if="note" class="text-small font-bold text-emerald-800">{{ note }}</span>
    </template>
  </ResultCardFrame>
</template>

<script setup lang="ts">
import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import Tip from '@/components/Tip.vue';
import { TIP_SIMULATE } from '@/lib/tipWords';
import { scrollToShownId } from '@/lib/searchTab';
import ResultCardFrame from './ResultCardFrame.vue';
import FollowButton from '../FollowButton.vue';
import type { ResultFollow } from '@/lib/follow';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './resultCardStyle';
import { csvButton, xlsxButton } from './csvButton';
import DownloadMenu, { type DownloadItem } from './DownloadMenu.vue';
import CardSaveRow from './CardSaveRow.vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    chain: number[];
    days: number;
    finalTE: number;
    /** "Feb 15, 2029, 9:22 PM", in the plan's timezone. */
    endLabel: string;
    running: boolean;
    /** What the finished answer is: "the best of every route in this space", and so on. */
    claim?: string;
    busy?: boolean;
    canFill?: boolean;
    canSave?: boolean;
    /** The CSV has every route's per-ascension detail (store `csvHasEveryRoute`): its button says so. */
    csvEvery?: boolean;
    /** Offer the same table as an .xlsx beside it (store `xlsxOffered`: under the row cap; emits `xlsx`). */
    xlsx?: boolean;
    saving?: boolean;
    /** The run is in Saved runs (store `currentRunSaved`, the flag Save this run below reads): the button says "Saved ✓"
     *  (DRAFT words, as Save this run's; pressing it again refreshes that entry, never a second one). L2, spec-r7qa. */
    saved?: boolean;
    /** Where the answer came from, when it wasn't this depth: the two share one store, so the
     *  Smart search screen shows a Full sweep's result until Smart search runs, and vice versa. */
    source?: string;
    /** A line after the buttons: what the last click did. */
    note?: string;
    /** Not from a run in this visit on these settings: when it was found ("Oct 11, 2026, 4:15 PM"),
     *  and the heading says "Your last run · ..." ('' for a live one). */
    lastRun?: string;
    /** "Custom, Nov 3 at 12:22 pm, on your save of Nov 3 at 11:19 am · awake hours 8 am to 11 pm, 9 no-prestige days":
     *  when it ran, on which save and with the run's own settings (lib/lastRunLine.ts `runMetaLine`). */
    meta?: string;
    /** Custom: Download diagnostics under Download ▾ (emits `diagnostics`). */
    diagnostics?: boolean;
    /** "Follow this route" for the finished result (lib/follow.ts `ResultFollow`); absent: no button. */
    follow?: ResultFollow | null;
  }>(),
  {
    claim: '',
    source: '',
    busy: false,
    canFill: false,
    canSave: false,
    csvEvery: false,
    xlsx: false,
    saving: false,
    saved: false,
    note: '',
    lastRun: '',
    meta: '',
    diagnostics: false,
    follow: null,
  }
);
const emit = defineEmits<{ build: []; fill: []; csv: []; xlsx: []; diagnostics: []; save: [name: string] }>();
/** The CSV button, named for what the file holds (csvButton.ts). */
const csv = computed(() => csvButton(props.csvEvery));
const xlsxLabel = xlsxButton();
/** Download ▾'s items: the CSV, the Excel file when offered, the diagnostics on Custom. DRAFT (Words) for the last. */
const downloads = computed<DownloadItem[]>(() => [
  { key: 'csv', text: csv.value.text.replace(/ ↓$/, ''), title: csv.value.title, testid: 'fastest-csv' },
  ...(props.xlsx ? [{ key: 'xlsx', text: xlsxLabel.text.replace(/ ↓$/, ''), title: xlsxLabel.title, testid: 'fastest-xlsx' }] : []),
  ...(props.diagnostics
    ? [
        {
          key: 'diagnostics',
          text: 'Download diagnostics (no save data, no player ID)',
          title: 'A small JSON file of what this run was given: backup age, TE, research and loadout. Attach it when you report a result that looks wrong',
          testid: 'fastest-diagnostics',
        },
      ]
    : []),
]);
function download(key: string): void {
  if (key === 'csv') emit('csv');
  else if (key === 'xlsx') emit('xlsx');
  else if (key === 'diagnostics') emit('diagnostics');
}

/** Each panel's Share this result section carries id="share-this-result"; both search tabs are on the
 *  page (SearchPanel.vue), so the one laid out is this card's. */
function toShare(): void {
  scrollToShownId('share-this-result');
}
</script>
