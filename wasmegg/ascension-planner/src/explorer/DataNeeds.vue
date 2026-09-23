<!--
  "We could use more data for:" -- the gaps in the corpus, worked out from the loaded rows, each with
  the sweep that fills it, how many chains that is from the viewer's TE, and roughly how long it
  takes on three sizes of machine. The coverage rules and the timing model are in needs.ts.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-end gap-3">
      <label class="space-y-1">
        <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Your TE now</span>
        <input
          v-model.number="teNow"
          type="number"
          min="1"
          max="489"
          class="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]"
        />
      </label>
      <p class="text-[10px] text-slate-400 max-w-md">
        The bands below are fitted to this: the first one starts just above your TE. Times are estimates from the
        speeds other players' runs recorded; the planner's Re-benchmark button measures your own machine.
      </p>
    </div>

    <p v-if="!needs.length" class="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
      Nothing on the list right now: every gap has enough accounts. New kinds of question will show up here as they
      come up.
    </p>

    <p v-else class="text-[12px] font-bold text-slate-800">We could use more data for:</p>

    <ol class="space-y-2">
      <li
        v-for="need in rowsWithCost"
        :key="need.id"
        class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-[12px] font-bold text-slate-900">{{ need.title }}</span>
          <span class="text-[10px] font-semibold text-slate-500">
            {{ need.have }} of {{ need.want }} accounts · who: {{ need.who }}
          </span>
        </div>
        <p class="text-[11px] text-slate-600 leading-relaxed">{{ need.why }}</p>
        <p class="text-[11px] text-slate-700">
          Run <b>{{ need.presetLabel }}</b> in the planner's Insane panel, per-checkpoint bands
          <code class="rounded bg-white px-1 text-[10px]">{{ need.bands }}</code>, minimum gap {{ need.minGap }}.
          <template v-if="need.runs > 1"> Twice.</template>
          <template v-if="need.note"> {{ need.note }}</template>
        </p>
        <div v-if="need.chains > 0" class="grid gap-1 sm:grid-cols-4 text-[11px]">
          <div class="rounded bg-white px-2 py-1">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Chains</div>
            <div class="font-bold text-slate-800">
              {{ (need.chains * need.runs).toLocaleString() }}<template v-if="need.runs > 1"> ({{ need.runs }} runs)</template>
            </div>
          </div>
          <div v-for="t in need.times" :key="t.id" class="rounded bg-white px-2 py-1">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">{{ t.label }} · {{ t.detail }}</div>
            <div class="font-bold text-slate-800">about {{ t.text }}</div>
          </div>
        </div>
        <p v-else class="text-[10px] font-semibold text-amber-700">
          This preset has no chains from {{ teNow }} TE: its bands sit at or below where you already are.
        </p>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CollectorRow } from './collector';
import { COMPUTE_TIERS, dataNeeds, estimateSeconds, formatEstimate, presetBandsFor, presetChains } from './needs';
import { SWEEP_PRESETS } from './upload';

const props = defineProps<{ rows: CollectorRow[] }>();

const TE_KEY = 'chain-explorer:te-now';
function readTE(): number {
  try {
    const v = Number(localStorage.getItem(TE_KEY));
    return Number.isFinite(v) && v > 0 && v < 490 ? v : 180;
  } catch {
    return 180;
  }
}
const teNow = ref(readTE());
watch(teNow, v => {
  try {
    if (Number.isFinite(v) && v > 0) localStorage.setItem(TE_KEY, String(v));
  } catch {
    /* private window: the default next time is fine */
  }
});

const needs = computed(() => dataNeeds(props.rows));

const rowsWithCost = computed(() =>
  needs.value.map(need => {
    const preset = SWEEP_PRESETS.find(p => p.id === need.preset)!;
    const te = Number.isFinite(teNow.value) && teNow.value > 0 ? teNow.value : 180;
    const { chains, ascensions } = presetChains(need.preset, te);
    return {
      ...need,
      presetLabel: preset.label,
      bands: presetBandsFor(need.preset, te),
      minGap: preset.minGap,
      chains,
      times: COMPUTE_TIERS.map(t => ({
        id: t.id,
        label: t.label,
        detail: t.detail,
        text: formatEstimate(estimateSeconds(chains * need.runs, ascensions, t)),
      })),
    };
  })
);
</script>
