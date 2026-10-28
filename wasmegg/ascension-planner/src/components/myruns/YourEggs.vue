<!--
  My runs' "Your eggs" (spec myruns-now v3, section 3), from the loaded save: each virtue egg's TE and how far to
  its next (the egg being laid: when, at the save's rate; each other egg: when, after a shift to it, lib/nextTeEgg.ts,
  26 Oct 2026), and the farm's facts. The silos are estimated to now
  (lib/farmNow.ts): time left, or empty since when. "All planned shifts" counts the
  saved plan's shifts after the save and prices them with the shift-cost formula at today's soul eggs
  (lib/shiftCost.ts); without a saved timeline it can't tell. With the instant answer's shifts only (26 Oct 2026) it
  counts the shifts listed plus each fresh ascension's build-up shifts, estimated (lib/openingShifts.ts, 27 Oct 2026),
  and says so.
-->
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4" data-testid="now-eggs">
    <p class="text-body font-bold text-slate-500">Your eggs · from your save</p>
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
      <div v-for="e in eggs" :key="e.egg" data-testid="now-egg">
        <p class="text-body" :class="e.current ? 'font-bold text-slate-900' : 'text-slate-700'">
          {{ virtueEggName(e.egg) }} {{ e.te }} TE
        </p>
        <div class="h-1.5 rounded bg-slate-100 overflow-hidden my-1" role="img" :aria-label="`${Math.round(e.progress * 100)}% to the next TE`">
          <div class="h-1.5 bg-indigo-500" :style="{ width: `${Math.round(e.progress * 100)}%` }" />
        </div>
        <p v-if="shiftLine(e.egg)" class="text-body tabular-nums text-slate-600 break-words" data-testid="now-egg-after-shift">{{ shiftLine(e.egg) }}</p>
        <p v-else class="text-body text-slate-500">{{ nextLine(e) }}</p>
      </div>
    </div>
    <p v-if="afterShift" class="mt-1.5 text-small text-slate-500 break-words" data-testid="now-eggs-after-shift-note">{{ afterShift.note }}</p>
    <div class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div v-for="f in tiles" :key="f.label" class="rounded-lg bg-slate-50 px-2.5 py-1.5 text-small" :data-testid="`now-fact-${f.id}`">
        <p class="label text-slate-500">{{ f.label }}</p>
        <p class="font-bold text-slate-800">{{ f.value }}</p>
        <p v-if="f.note" class="text-body text-slate-500">{{ f.note }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '@/lib/format';
import { virtueEggName } from '@/lib/virtueEggs';
import { formatSiloTime } from '@/stores/silos';
import { nextTeLine, type EggLine, type FarmFacts } from '@/lib/farmFacts';
import { siloNow, siloNowWords } from '@/lib/farmNow';

const props = defineProps<{
  eggs: EggLine[];
  facts: FarmFacts | null;
  shiftsDone: number;
  nextShiftCost: number | null;
  /** `partial`: counted from the instant answer's shifts, which leave out each fresh ascension's first hours.
   *  `opening`: of `count`, the fresh ascensions' build-up shifts added as an estimate (lib/openingShifts.ts). */
  plannedShifts: { count: number; cost: number; partial?: boolean; opening?: number } | null;
  clothedEquipped: number | null;
  clothedEarnings: number | null;
  now: number;
  saveSeconds: number;
  /** The planner's time zone, for "empty since" (the browser's when not given). */
  zone?: string;
  /** Each egg the player isn't on: "next TE in ~2d 4h after you shift here", by egg, and the note on where from
   *  (lib/nextTeEgg.ts). It stands in for the egg's "N% to the next TE · after a shift" line; an egg left out (at the
   *  TE cap, no data) keeps that line. */
  afterShift?: { lines: Record<string, string>; note: string } | null;
}>();

/** lib/farmFacts.ts `nextTeLine`: capped at about 10 years ("not at this rate"). */
function nextLine(e: EggLine): string {
  return nextTeLine(e, props.now, props.saveSeconds);
}

/** The egg's next TE after a shift to it; '' says nothing (the egg being laid, at the TE cap, no data). */
function shiftLine(egg: string): string {
  return props.afterShift?.lines[egg] ?? '';
}

/**
 * The silos estimated to now (lib/farmNow.ts, item 6): how much time away is left, or since when they are empty, from
 * the save's farm and the time since. The same silo model as the catch-up (lib/saveAge.ts `siloSeconds`). No hab fill.
 */
const silosTile = computed(() => {
  const f = props.facts;
  if (!f) return { id: 'silos', label: 'Silos', value: '—', note: 'no virtue farm in this save' };
  const s = siloNow({ siloSeconds: f.siloMinutes * 60, saveSeconds: props.saveSeconds, stepSeconds: f.stepSeconds, nowSeconds: props.now });
  if (!s) return { id: 'silos', label: 'Silos', value: `${formatSiloTime(f.siloMinutes)} away`, note: '' };
  const w = siloNowWords(s, props.saveSeconds, props.now, props.zone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  return { id: 'silos', label: 'Silos', value: w.value, note: w.note };
});

const se = (n: number) => `${formatNumber(n, 1)} soul eggs`;
const tiles = computed(() => [
  { id: 'shifts', label: 'Shifts done', value: String(props.shiftsDone), note: '' },
  { id: 'next-cost', label: 'Next shift cost', value: props.nextShiftCost != null ? se(props.nextShiftCost) : '—', note: '' },
  props.plannedShifts
    ? {
        id: 'planned',
        label: 'All planned shifts',
        value: `${props.plannedShifts.count} shift${props.plannedShifts.count === 1 ? '' : 's'} · about ${se(props.plannedShifts.cost)}`,
        note: props.plannedShifts.opening
          ? `at today's soul eggs · includes about ${props.plannedShifts.opening} build-up shifts (estimated)`
          : props.plannedShifts.partial
            ? "at today's soul eggs · the shifts listed, without each new ascension's first hours"
            : "at today's soul eggs",
      }
    : { id: 'planned', label: 'All planned shifts', value: "Can't tell", note: 'no saved plan with its timeline' },
  silosTile.value,
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
