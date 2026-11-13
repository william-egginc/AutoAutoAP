<!--
  My runs' "Your eggs" (spec myruns-now v3, section 3), from the loaded save: each virtue egg's TE and how far to
  its next (the egg being laid: when, at the save's rate; each other egg: when, after a shift to it, lib/nextTeEgg.ts,
  26 Oct 2026), and the farm's facts. The silos are estimated to now
  (lib/farmNow.ts): time left, or empty since when. "All planned shifts" counts the
  saved plan's shifts after the save and prices them with the shift-cost formula at today's soul eggs
  (lib/shiftCost.ts), worded by lib/soulEggs.ts `plannedShiftsWords` ("41 shifts" / "will cost about 2.3s soul eggs (at
  today's prices), about 18 of them build-up shifts (estimated)", ux34-a), the same figures as Right now's soul eggs
  line; without a saved timeline it can't tell. With the instant answer's shifts only (26 Oct 2026) it
  counts the shifts listed plus each fresh ascension's build-up shifts, estimated (lib/openingShifts.ts, 27 Oct 2026),
  and says so.
  THE CLOCK TIME (ux34-a): under each egg's line its day and time in the browser's format, from now (lib/nextTeEgg.ts
  `eggClockLines`), in "next TE".
  NEXT TE | TO GOAL (28 Oct 2026, pieha; each view only its own lines, spec-myruns-fix2, 13 Nov 2026): a two-way
  switch. "next TE": if you switched to the egg now, its next TE, nothing else. "to goal": the followed plan's goal once
  above the eggs (lib/nextTeEgg.ts `eggGoalLines`) and each egg's goal time on the plan, the end of its last stint
  (lib/eggGoalTimes.ts, spec-myruns-goal); a plan that can't say per egg (table only, no replay) keeps the plan line. Every line carries its kind (data-line,
  lib/yourEggsWords.ts) and lib/nextTeEgg.ts `eggViewLines` picks them. Remembered in this browser; "next TE" by
  default; no switch without a plan.
-->
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4" data-testid="now-eggs">
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-body font-bold text-slate-500">Your eggs · from your save</p>
      <div
        v-if="hasGoal"
        class="ml-auto inline-flex rounded-lg border border-slate-300 overflow-hidden"
        role="group"
        aria-label="Show for each egg"
        data-testid="now-eggs-view"
      >
        <button
          v-for="o in VIEWS"
          :key="o.value"
          type="button"
          class="min-h-[44px] px-3 text-body"
          :class="view === o.value ? 'bg-indigo-600 text-white font-bold' : 'bg-white text-slate-700 hover:bg-slate-50'"
          :aria-pressed="view === o.value ? 'true' : 'false'"
          :data-view="o.value"
          @click="pick(o.value)"
        >
          {{ o.label }}
        </button>
      </div>
    </div>
    <!-- The plan's goal, the same for every egg: once for the block (spec-uxpass item 5, 8 Nov 2026). -->
    <p v-if="goalOnce" class="mt-1.5 text-body tabular-nums text-slate-600 break-words" data-testid="now-eggs-goal-once" :data-line="EGG_LINE.goalPlan">{{ goalOnce }}</p>
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
      <div v-for="e in eggs" :key="e.egg" data-testid="now-egg">
        <p class="text-body" :class="e.current ? 'font-bold text-slate-900' : 'text-slate-700'">
          {{ virtueEggName(e.egg) }} {{ e.te }} TE
        </p>
        <div class="h-1.5 rounded bg-slate-100 overflow-hidden my-1" role="img" :aria-label="`${Math.round(e.progress * 100)}% to the next TE`">
          <div class="h-1.5 bg-indigo-500" :style="{ width: `${Math.round(e.progress * 100)}%` }" />
        </div>
        <p
          v-for="l in linesOf(e)"
          :key="l.kind"
          class="text-body tabular-nums break-words"
          :class="LINE_STYLE[l.kind]?.cls ?? 'text-slate-600'"
          :data-testid="LINE_STYLE[l.kind]?.testid"
          :data-line="l.kind"
        >
          {{ l.text }}
        </p>
      </div>
    </div>
    <!-- "estimated from your save" once; how, and which save, behind the "?" (UX fluff review 2, item R16). DRAFT. -->
    <p v-if="afterShift && shownView === 'next'" class="mt-1.5 flex items-center gap-1.5 text-small text-slate-500 break-words" data-testid="now-eggs-after-shift-note">
      After a shift: estimated from your save.{{ ' ' }}<HelpTip>{{ afterShift.note }}</HelpTip>
    </p>
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
import { computed, ref } from 'vue';
import { formatNumber } from '@/lib/format';
import { virtueEggName } from '@/lib/virtueEggs';
import { formatSiloTime } from 'lib/planners/stores/silos';
import { type EggLine, type FarmFacts } from '@/lib/farmFacts';
import { siloNow, siloNowWords } from '@/lib/farmNow';
import HelpTip from '@/components/auto/HelpTip.vue';
import { eggViewLines, readEggsView, writeEggsView, type EggsView, type EggViewLine } from '@/lib/nextTeEgg';
import { EGG_LINE, type EggLineKind } from '@/lib/yourEggsWords';
import { plannedShiftsWords } from '@/lib/soulEggs';

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
  /** Each egg the player isn't on: its next TE after a shift to it now, by egg, and the note on where from
   *  (lib/nextTeEgg.ts). An egg left out (at the TE cap, no data) says how far it is to its next TE instead. */
  afterShift?: { lines: Record<string, string>; note: string } | null;
  /** The followed plan's goal line, the same for every egg (lib/nextTeEgg.ts `eggGoalLines`); empty or absent: no plan,
   *  no switch. */
  goalLines?: Record<string, string> | null;
  /** By view and egg (lib/nextTeEgg.ts `eggClockLines`): `next` each egg's next TE day and time from now; `goal` each
   *  egg's plan line (a planned shift to it, on it now, or none in the plan's next shifts). */
  clockLines?: { next: Record<string, string>; goal: Record<string, string> } | null;
  /** Each egg's goal time on the followed plan (lib/eggGoalTimes.ts `planEggGoalLines`); null or absent: the plan
   *  can't say per egg, and "to goal" shows `clockLines.goal`. */
  goalTimes?: Record<string, EggViewLine> | null;
  /** The view to start on (specs); absent: the one remembered in this browser. */
  view?: EggsView;
}>();

const VIEWS: { value: EggsView; label: string }[] = [
  { value: 'next', label: 'next TE' },
  { value: 'goal', label: 'to goal' },
];
const view = ref<EggsView>(props.view ?? readEggsView());
const hasGoal = computed(() => !!props.goalLines && Object.keys(props.goalLines).length > 0);
/** The view shown: "next TE" when there is no plan (no switch), whatever was remembered. */
const shownView = computed<EggsView>(() => (hasGoal.value ? view.value : 'next'));
/** The plan's goal line, the same for every egg, said once above the eggs; '' outside "to goal". */
const goalOnce = computed(() => {
  if (shownView.value !== 'goal' || !props.eggs.length) return '';
  return props.goalLines?.[props.eggs[0].egg] ?? '';
});
function pick(v: EggsView): void {
  view.value = v;
  writeEggsView(v);
}

/** Each kind's look and test id (the ids the page specs and the harness already read). */
const LINE_STYLE: Partial<Record<EggLineKind, { cls: string; testid?: string }>> = {
  [EGG_LINE.nextAtSaveRate]: { cls: 'text-slate-500' },
  [EGG_LINE.nextAfterShift]: { cls: 'text-slate-600', testid: 'now-egg-after-shift' },
  [EGG_LINE.nextProgress]: { cls: 'text-slate-500' },
  [EGG_LINE.nextClock]: { cls: 'text-slate-500', testid: 'now-egg-when' },
  [EGG_LINE.goalShift]: { cls: 'text-slate-600', testid: 'now-egg-to-goal' },
  [EGG_LINE.goalOnEgg]: { cls: 'text-slate-600', testid: 'now-egg-to-goal' },
  [EGG_LINE.goalNoShift]: { cls: 'text-slate-500', testid: 'now-egg-to-goal' },
  [EGG_LINE.goalEggAt]: { cls: 'text-slate-600', testid: 'now-egg-to-goal' },
  [EGG_LINE.goalEggBy]: { cls: 'text-slate-600', testid: 'now-egg-to-goal' },
  [EGG_LINE.goalEggByAbout]: { cls: 'text-slate-600', testid: 'now-egg-to-goal' },
  [EGG_LINE.goalEggDone]: { cls: 'text-slate-500', testid: 'now-egg-to-goal' },
};

/** The egg's lines for the view shown (lib/nextTeEgg.ts `eggViewLines`). */
function linesOf(e: EggLine): EggViewLine[] {
  return eggViewLines(shownView.value, e, {
    now: props.now,
    saveSeconds: props.saveSeconds,
    afterShift: props.afterShift?.lines ?? null,
    clockLines: props.clockLines ?? null,
    goalTimes: props.goalTimes ?? null,
  });
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
  // Not "estimated from your save of …" a third time on the card (UX fluff review 2, item R17).
  return { id: 'silos', label: 'Silos', value: w.value, note: w.short };
});

const se = (n: number) => `${formatNumber(n, 1)} soul eggs`;
const tiles = computed(() => [
  { id: 'shifts', label: 'Shifts done', value: String(props.shiftsDone), note: '' },
  { id: 'next-cost', label: 'Next shift cost', value: props.nextShiftCost != null ? se(props.nextShiftCost) : '—', note: '' },
  props.plannedShifts
    ? { id: 'planned', label: 'All planned shifts', ...plannedShiftsWords(props.plannedShifts) }
    : { id: 'planned', label: 'All planned shifts', value: "Can't tell", note: 'no saved plan with its timeline' },
  silosTile.value,
  { id: 'habs', label: 'Habs', value: props.facts ? `${Math.round(props.facts.habFull * 100)}% full` : '—', note: '' },
  {
    id: 'clothed',
    label: 'Clothed TE',
    value:
      props.clothedEarnings != null
        ? `${Math.round(props.clothedEarnings)}${
            // Not when it is the same number ("326 (equipped 326)"; spec-tidy).
            props.clothedEquipped != null && Math.round(props.clothedEquipped) !== Math.round(props.clothedEarnings)
              ? ` (equipped ${Math.round(props.clothedEquipped)})`
              : ''
          }`
        : '—',
    note: props.clothedEarnings != null ? 'with your earnings set' : '',
  },
]);
</script>
