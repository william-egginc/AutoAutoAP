<!--
  My runs' "Your eggs" (spec myruns-now v3, section 3), from the loaded save: each virtue egg's TE and how far to
  its next (the egg being laid: when, at the save's rate), and the farm's facts. "All planned shifts" counts the
  saved plan's shifts after the save and prices them with the shift-cost formula at today's soul eggs
  (lib/shiftCost.ts); without a saved timeline it can't tell.
-->
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4" data-testid="now-eggs">
    <p class="text-[11px] font-black uppercase tracking-widest text-slate-500">Your eggs · from your save</p>
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
      <div v-for="e in eggs" :key="e.egg" data-testid="now-egg">
        <p class="text-[13px]" :class="e.current ? 'font-black text-slate-900' : 'text-slate-700'">
          {{ virtueEggName(e.egg) }} {{ e.te }} TE
        </p>
        <div class="h-1.5 rounded bg-slate-100 overflow-hidden my-1" role="img" :aria-label="`${Math.round(e.progress * 100)}% to the next TE`">
          <div class="h-1.5 bg-indigo-500" :style="{ width: `${Math.round(e.progress * 100)}%` }" />
        </div>
        <p class="text-[11px] text-slate-500">{{ nextLine(e) }}</p>
      </div>
    </div>
    <div class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div v-for="f in tiles" :key="f.label" class="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px]" :data-testid="`now-fact-${f.id}`">
        <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">{{ f.label }}</p>
        <p class="font-bold text-slate-800">{{ f.value }}</p>
        <p v-if="f.note" class="text-[11px] text-slate-500">{{ f.note }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '@/lib/format';
import { relativeWords } from '@/lib/eventWhen';
import { virtueEggName } from '@/lib/virtueEggs';
import { formatSiloTime } from '@/stores/silos';
import type { EggLine, FarmFacts } from '@/lib/farmFacts';

const props = defineProps<{
  eggs: EggLine[];
  facts: FarmFacts | null;
  shiftsDone: number;
  nextShiftCost: number | null;
  plannedShifts: { count: number; cost: number } | null;
  clothedEquipped: number | null;
  clothedEarnings: number | null;
  now: number;
  saveSeconds: number;
}>();

function nextLine(e: EggLine): string {
  // Only the egg being laid gets a time; the others' next TE comes after a shift (never timed "at the final rate").
  if (!e.current) return `${Math.round(e.progress * 100)}% to the next TE · after a shift`;
  if (e.nextInSeconds == null) return `${Math.round(e.progress * 100)}% to the next TE`;
  const left = e.nextInSeconds - Math.max(0, props.now - props.saveSeconds);
  return left <= 0 ? 'next TE likely reached since your save' : `next TE ${relativeWords(left)} at your save's rate`;
}

const se = (n: number) => `${formatNumber(n, 1)} soul eggs`;
const tiles = computed(() => [
  { id: 'shifts', label: 'Shifts done', value: String(props.shiftsDone), note: '' },
  { id: 'next-cost', label: 'Next shift cost', value: props.nextShiftCost != null ? se(props.nextShiftCost) : '—', note: '' },
  props.plannedShifts
    ? {
        id: 'planned',
        label: 'All planned shifts',
        value: `${props.plannedShifts.count} shift${props.plannedShifts.count === 1 ? '' : 's'} · about ${formatNumber(props.plannedShifts.cost, 1)}`,
        note: "at today's soul eggs",
      }
    : { id: 'planned', label: 'All planned shifts', value: "Can't tell", note: 'no saved plan with its timeline' },
  {
    id: 'silos',
    label: 'Silos',
    value: props.facts ? `${formatSiloTime(props.facts.siloMinutes)} away` : '—',
    note: props.facts ? '' : 'no virtue farm in this save',
  },
  { id: 'habs', label: 'Habs', value: props.facts ? `${Math.round(props.facts.habFull * 100)}% full` : '—', note: '' },
  {
    id: 'clothed',
    label: 'Clothed TE',
    value:
      props.clothedEarnings != null
        ? `${Math.round(props.clothedEarnings)}${props.clothedEquipped != null ? ` (equipped ${Math.round(props.clothedEquipped)})` : ''}`
        : '—',
    note: props.clothedEarnings != null ? 'with your earnings set' : '',
  },
]);
</script>
