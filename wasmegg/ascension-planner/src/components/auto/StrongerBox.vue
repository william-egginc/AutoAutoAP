<!--
  The Fast / Exact content of the search panel (SearchPanel.vue, 22 Oct 2026; was the "Stronger check" box
  with its own Light / Fast / Exact / Very high bar, 12 Oct): what the option picked does, how long it
  takes, what it finds and what it promises and doesn't (one fold, 26 Oct 2026), Very high's tick box inside
  Exact (lib/veryHigh.ts), then the search around the instant answer (the default slot: Fastest's Nearby routes search
  at that effort, By a date's routes around the answer), its controls and results. Light's status and
  results are at the top of the panel now (LightStatus.vue).
-->
<template>
  <section class="space-y-3" data-testid="stronger-box">
    <!-- The option picked (Fast or Exact), in three plain lines: what it does, how long, what it can and
         can't find; then, amber like the other promise boxes, what it promises and what it doesn't. One fold,
         "What this does" (lib/panelFold.ts `whatItDoes`; 26 Oct 2026: it and "What this does and does not
         promise" said the same things twice), each point once. Folded by default. -->
    <PanelFold
      section="whatItDoes"
      title="What this does"
      :running="running"
      class="rounded-xl border border-slate-200 bg-white px-3"
    >
      <dl class="mt-1 mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] leading-relaxed" data-testid="level-note">
        <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">What it does</dt>
        <dd class="text-slate-800">{{ current.does }}</dd>
        <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">How long</dt>
        <dd class="text-slate-800" data-testid="level-how-long">{{ estimates?.[level]?.line ?? current.time }}</dd>
        <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">What it finds</dt>
        <dd class="text-slate-800">{{ current.finds }}</dd>
      </dl>
      <div
        class="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
        data-testid="stronger-promise"
      >
        <p class="font-black uppercase tracking-wide text-[9px] text-amber-800">What it promises and what it doesn't</p>
        <!-- What the option picked promises, and only that (the user, 12 Oct: no lines that don't apply). -->
        <ul class="mt-1 pl-4 list-disc space-y-0.5 leading-relaxed" data-testid="promise-lines">
          <li v-for="(line, k) in promises" :key="k">{{ line }}</li>
        </ul>
      </div>
    </PanelFold>
    <!-- Very high: a tick box inside Exact (lib/veryHigh.ts). Switched off, a pointer to Custom instead, and
         a run that used it (a stored or linked `thorough` run) says so. -->
    <template v-if="isExact">
      <label
        v-if="SHOW_VERY_HIGH"
        class="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-[12px]"
        data-testid="very-high-box"
      >
        <input
          type="checkbox"
          class="mt-0.5 rounded border-slate-400 text-indigo-600"
          :checked="level === 'thorough'"
          :disabled="running"
          data-testid="very-high-tick"
          @change="setVeryHigh(($event.target as HTMLInputElement).checked)"
        />
        <span
          ><b>Exact (wider)</b
          ><span v-if="estimates?.thorough" class="text-slate-500">{{ ' ' }}· {{ estimates.thorough.short }} here</span
          ><span class="text-slate-500">{{ ' ' }}· if you're curious</span><br /><span
            class="text-slate-500"
            data-testid="very-high-what"
            >{{ VERY_HIGH_WHAT[goal] }}</span
          ></span
        >
      </label>
      <p v-else class="text-[11px] text-slate-600" data-testid="very-high-off">
        <span v-if="level === 'thorough'" class="font-bold" data-testid="used-very-high">This run used Exact (wider).{{ ' ' }}</span
        >For a full sweep, use Custom.
      </p>
    </template>
    <slot name="summary" />
    <!-- The search of the routes near the instant answer's, its controls and results. No heading of its own
         (26 Oct 2026): the panel's intro already says what it does. -->
    <div class="pt-2 border-t border-slate-100">
      <slot :level="level" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PanelFold from './PanelFold.vue';
import { NAMES } from '@/lib/siteNav';
import { EFFORT_NOTES } from '@/search/effort';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useStrongerStore, type LevelEstimate, type StrongerLevel } from '@/stores/stronger';
import { rememberChoice } from '@/lib/searchOption';
import { SHOW_VERY_HIGH } from '@/lib/veryHigh';

const props = defineProps<{
  /** 'fastest': Fast, Exact (Very high inside) as the Nearby routes search's effort. 'date': the same,
   *  as wider boxes around the instant answer. */
  goal: 'fastest' | 'date';
  /** A search in this box is running: Very high's box can't change. */
  running?: boolean;
  /** What each search level would cost on THIS computer (its workers and speed): `short` on the option,
   *  `line` as How long. FastestRoute.vue and DeadlinePanel.vue work them out. */
  estimates?: Partial<Record<StrongerLevel, LevelEstimate>>;
}>();

const store = useChainSearchStore();
const stronger = useStrongerStore();

type NearbyLevel = Exclude<StrongerLevel, 'light'>;
interface LevelText {
  id: NearbyLevel;
  does: string;
  time: string;
  finds: string;
}
/** Exact's first words: a wider search, not the exact price (Jordan, 22 Oct: the name sits next to Check exactly). */
const EXACT_FIRST = 'A wider search than Fast; its times are priced the same way, with the full simulator.';
/** Each level in plain words, per screen: what it does, how long, what it can and can't find. */
const levels = computed<LevelText[]>(() =>
  props.goal === 'fastest'
    ? [
        {
          id: 'quick',
          does: `${NAMES.smart}. Starting from the instant answer's route, it moves one stop at a time, up to 8 TE either way, until nothing gets faster. Then it gives the other numbers of ascensions in your limits a quick try.`,
          time: `${EFFORT_NOTES.quick.typicalTime}`,
          finds: "A faster route close to the instant answer's. It can miss one where several stops have to move together, or one far from the instant answer's.",
        },
        {
          id: 'normal',
          does: `${EXACT_FIRST} Fast, plus moving neighbouring stops in pairs. Then it tries one ascension more or fewer.`,
          time: EFFORT_NOTES.normal.typicalTime,
          finds: "Also routes where two stops have to move together. It can still miss one where three or more stops have to move together, or one far from the instant answer's. In players' runs so far it rarely found more than Fast did.",
        },
        {
          id: 'thorough',
          does: `${EXACT_FIRST} Exact (wider): Fast and pairs, plus moving three neighbouring stops together.`,
          time: EFFORT_NOTES.thorough.typicalTime,
          finds: "The strongest search near the instant answer. In players' runs so far it never found more than Exact did.",
        },
      ]
    : [
        {
          id: 'quick',
          does: `${NAMES.smart}. For each number of ascensions the instant answer has, it tries every route with each early stop up to 3 TE either side of the answer's route. Long routes get fewer, and it narrows if the search would take too long. Each last stop is found to the exact TE.`,
          time: 'Sized to stay under about 25 minutes (a cap, not a measurement); yours is below.',
          finds: "The highest TE near the instant answer's routes.",
        },
        {
          id: 'normal',
          does: `${EXACT_FIRST} The same as Fast, with one more TE either side of each early stop (up to 4).`,
          time: 'Sized to stay under about 2 hours (a cap, not a measurement); yours is below.',
          finds: 'A wider net around the same routes.',
        },
        {
          id: 'thorough',
          does: `${EXACT_FIRST} Exact (wider): the same as Fast, with two more TE either side of each early stop (up to 5).`,
          time: 'Sized to stay under about 8 hours (a cap, not a measurement); yours is below.',
          finds: 'The widest net near the instant answer.',
        },
      ]
);
/** Light is no longer picked: it shows as Fast. */
const level = computed<NearbyLevel>(() => (stronger.level === 'light' ? 'quick' : stronger.level));
const isExact = computed(() => level.value === 'normal' || level.value === 'thorough');

/** Very high's one sentence, per screen (notes/veryhigh-vs-exact.md, 22 Oct 2026). */
const VERY_HIGH_WHAT: Record<'fastest' | 'date', string> = {
  fastest:
    'Also tries every group of three stops together. This takes 3 to 10 times longer, and on the runs we have it has not yet found a faster route than Exact.',
  date: "Two more TE either side of each early stop instead of one, the widest net near the instant answer; no player's run by a date has used it yet, so nothing measures what it adds.",
};

/** Very high's box (shown only while lib/veryHigh.ts has it on): Exact's level, remembered on this screen. */
function setVeryHigh(on: boolean): void {
  if (props.running) return;
  const l: NearbyLevel = on ? 'thorough' : 'normal';
  stronger.level = l;
  if (props.goal === 'fastest') store.effort = l;
  rememberChoice(props.goal === 'fastest' ? 'fastest' : 'by-date', { option: 'exact', veryHigh: on });
}

/**
 * What the option picked promises and what it doesn't, on this screen: the amber part of "What this does". Only
 * what the three lines above don't already say (26 Oct 2026: each point once). These took over the lines of the
 * amber box that sat under the search's results (the user, 12 Oct: one promise box, not two). Do not soften them.
 */
const PRICED = 'Every route it shows is priced with the full simulator on your save, so its times are your own.';
const STOP = 'You can stop it at any point and keep the best route it found so far.';
const TIMING = "The times come from players' runs and your computer's own speed. Keep this tab in front: a hidden tab runs several times slower.";
const promises = computed<string[]>(() => {
  if (props.goal === 'date')
    return [
      PRICED,
      `It can miss a route whose early stops are further away. It is never a proven best: ${NAMES.full} proves the best only inside the boxes you set.`,
      "No search up to 13 Oct beat the instant answer's TE by a date, but that rests on only 2 like-for-like runs from one save, so a search here will often confirm it.",
      TIMING,
      STOP,
    ];
  return [
    `${PRICED} With awake hours set (in Setup), each prestige and each egg shift waits for your awake hours, and the CSV counts the waits per ascension.`,
    "It starts from the instant answer's route (or the one you picked) and never scans every route, so a poor start can leave it near a poor answer.",
    `It is a strong nearby answer, never a proven best: ${NAMES.full} proves the best only inside the boxes you set. Its accuracy figures come from 3 accounts, and only one of them has a proven best to check against.`,
    "In players' runs before 23 Oct, on about 5 accounts, a short search (Fast) often found a route at least a day sooner than the instant answer's. Treat that as an upper bound: part of the gap was how the old instant answer was priced, and it has not been measured again since. Going bigger rarely added more. That sample is small.",
    TIMING,
    `${STOP} A refresh is safe: its progress is saved and carries on without re-simulating anything.`,
  ];
});
const current = computed(() => levels.value.find(l => l.id === level.value) ?? levels.value[0]);
</script>
