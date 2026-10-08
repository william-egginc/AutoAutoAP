<!--
  "The routes to try": the chain-row editor shared by the Full sweep (its added chains, Chain 2 on)
  and Highest TE by a date (every chain). One row per chain: its number, the Ascensions box, Suggest a
  space and Remove; the box of bands with the band checker under it (BandCheckNotice.vue); the row's
  count or what is wrong with it; Suggest a space's two sliders (SpaceSliders.vue), independent per
  chain unless the screen offers "move every chain's sliders together" (`linkable`) and it is ticked.
  Then "+ Add another chain", with the screen's own extras beside it (`footer`).

  The screen owns the rows and every rule about them (what Suggest a space fills in, what a slider
  moves, what counts): this draws them and says what was asked (events). What genuinely differs goes
  in props and slots:
    - the Full sweep: up to 12 ascensions, its Chain 1 drawn by the screen above these rows
      (`firstNumber` 2), rows can all be removed, the band checker knows each row's count, and its
      "Suggest would fill in N chains" line under the sliders (`row-after`);
    - By a date: up to 8 ascensions, at least one row, "Suggest a space tries" before the sliders,
      the link option, the instant answer and Science notes (`row-notes`), the step-wider-than-±
      warning (`row-after`) and the shared "Last stop" box (`footer`).
  A screen's Simple mode (batch 3) can leave this out with v-if: nothing else depends on it.
-->
<template>
  <div>
    <div v-for="(row, k) in rows" :key="k" class="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Chain {{ k + firstNumber }}</span>
        <label class="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Ascensions
          <input
            :value="row.asc"
            type="number"
            min="1"
            :max="maxAsc"
            :disabled="disabled"
            class="w-16 rounded-md border-slate-300 text-xs font-bold text-slate-800 disabled:opacity-50"
            @input="emit('asc', k, asNumber(($event.target as HTMLInputElement).value))"
          />
        </label>
        <button
          type="button"
          :disabled="disabled || row.asc < 2"
          class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white disabled:opacity-40"
          @click="emit('suggest', k)"
        >
          Suggest a space
        </button>
        <button
          v-if="rows.length > minRows"
          type="button"
          :disabled="disabled"
          class="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600 disabled:opacity-40"
          @click="emit('remove', k)"
        >
          Remove
        </button>
      </div>
      <input
        v-if="row.asc >= 2"
        :value="row.text"
        type="text"
        :disabled="disabled"
        :placeholder="placeholder"
        class="w-full rounded-lg border-slate-300 text-sm font-mono-premium font-bold text-slate-800 disabled:opacity-50"
        @input="emit('text', k, ($event.target as HTMLInputElement).value)"
      />
      <BandCheckNotice
        v-if="row.asc >= 2"
        :text="row.text"
        :current-t-e="currentTE"
        :final-t-e="finalTE"
        :ascensions="checkAscensions ? row.asc : undefined"
        :disabled="disabled"
        @use="t => emit('text', k, t)"
      />
      <span class="block text-[10px]" :class="problems[k] ? 'text-rose-600' : 'text-slate-500'">
        {{ problems[k] || summaries[k] }}
      </span>
      <slot name="row-notes" :row="row" :k="k" />
      <SpaceSliders
        v-if="row.asc >= 2 && sliders[k]"
        :width-ix="sliders[k].widthIx"
        :step-ix="sliders[k].stepIx"
        :half-width="sliders[k].halfWidth"
        :step="sliders[k].step"
        :from-card="sliders[k].fromCard"
        :from-simple="sliders[k].fromSimple"
        :lead="sliderLead"
        :disabled="disabled"
        @width="v => emit('slider', k, 'widthIx', v)"
        @step="v => emit('slider', k, 'stepIx', v)"
      >
        <label v-if="linkable && rows.length > 1" class="flex items-center gap-1.5 cursor-pointer">
          <input v-model="linked" type="checkbox" class="rounded border-slate-300 text-slate-700" />
          move every chain's sliders together
        </label>
      </SpaceSliders>
      <slot name="row-after" :row="row" :k="k" />
    </div>
    <div class="flex flex-wrap" :class="footerClass">
      <button
        type="button"
        :disabled="disabled"
        class="px-3 py-1.5 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        @click="emit('add')"
      >
        + Add another chain
      </button>
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import BandCheckNotice from './BandCheckNotice.vue';
import SpaceSliders from './SpaceSliders.vue';
import type { RowSliderView } from '@/composables/useRowSliders';

withDefaults(
  defineProps<{
    rows: readonly { asc: number; text: string }[];
    /** Per row, in order; a row without one shows no sliders. */
    sliders: readonly (RowSliderView | null | undefined)[];
    /** Per row: what is wrong with it ('' when nothing), shown red in place of the summary. */
    problems: readonly string[];
    summaries: readonly string[];
    disabled: boolean;
    currentTE: number;
    finalTE: number;
    maxAsc: number;
    placeholder: string;
    /** The first row's number: 2 on the Full sweep, whose Chain 1 is drawn above. */
    firstNumber?: number;
    /** Remove shows while there are more rows than this. */
    minRows?: number;
    /** The band checker also checks each row's ascension count. */
    checkAscensions?: boolean;
    sliderLead?: string;
    /** Offer "move every chain's sliders together" (with more than one row). */
    linkable?: boolean;
    footerClass?: string;
  }>(),
  {
    firstNumber: 1,
    minRows: 0,
    checkAscensions: false,
    sliderLead: '',
    linkable: false,
    footerClass: 'items-center gap-3',
  }
);
const linked = defineModel<boolean>('linked', { default: false });
const emit = defineEmits<{
  asc: [k: number, asc: number];
  text: [k: number, text: string];
  suggest: [k: number];
  remove: [k: number];
  add: [];
  slider: [k: number, key: 'widthIx' | 'stepIx', ix: number];
}>();

/** What `v-model.number` would store: the number when the box reads as one, else the text. */
function asNumber(v: string): number {
  const n = parseFloat(v);
  return (Number.isNaN(n) ? v : n) as number;
}
</script>
