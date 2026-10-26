<!--
  One of My runs' two saved-answer tiles (spec myruns-now v3, section 4; lib/savedTiles.ts): the best answer
  already worked out for the loaded save, when it was calculated and from which save, How sure (lib/howSure.ts)
  and where it stands on the board. Nothing is worked out here: the buttons open the screen that does.
-->
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-1" :data-testid="`now-tile-${goal}`">
    <p class="text-[11px] font-black uppercase tracking-widest text-slate-500">{{ title }} · saved answer</p>
    <template v-if="a">
      <p class="text-xl font-black text-slate-900">{{ headline }}</p>
      <p class="text-[13px] text-slate-600">
        {{ sub }} · <span class="font-mono font-bold text-slate-800" :title="a.chain.join(' ')">{{ route }}</span>
      </p>
      <p class="text-[12px] text-slate-500" data-testid="now-tile-when">
        Calculated {{ whenAgo(a.calculatedAt / 1000, now, zone) }}<template v-if="a.saveSeconds">
          · from your save of {{ dateAt(a.saveSeconds, now, zone) }}<template v-if="tile.saveGapSeconds"
            >, <span data-testid="now-tile-save-gap">{{ saveGapWords(tile.saveGapSeconds) }}</span></template
          ></template
        >
        · {{ howWords(a) }}<template v-if="sourceWords(a)"> · {{ sourceWords(a) }}</template>
      </p>
      <!-- A better answer of this save priced with other hours: secondary, named (fix 22, lib/currentAnswer.ts). -->
      <p v-if="tile.secondary" class="text-[12px] text-slate-500" data-testid="now-tile-secondary">
        {{ secondaryText }} (calculated {{ dateAt(tile.secondary.calculatedAt / 1000, now, zone) }} · {{ howWords(tile.secondary) }})
      </p>
      <div v-if="tile.sure" class="mt-1 rounded-lg px-2.5 py-1.5 text-[13px]" :class="SURE[tile.sure.level]" data-testid="now-tile-sure">
        <b>How sure: {{ LEVEL[tile.sure.level] }}</b>
        <span class="block">
          {{ cap(tile.sure.reason) }}.
          <button v-if="tile.sure.action && !runFastAbove" type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold underline" @click="emit('open', actionOpen)">
            Run Fast ›
          </button>
        </span>
      </div>
      <p v-if="tile.olderSave" class="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[12px] text-amber-900" data-testid="now-tile-older">
        Older save than the one you loaded.
        <button type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold underline" @click="emit('open', screenOpen)">Work it out again ›</button>
      </p>
      <p v-if="standing" class="mt-1 border-t border-slate-100 pt-1.5 text-[13px] text-slate-700" data-testid="now-tile-standing">
        {{ standingLabel }}: <b>{{ standing }}</b>
      </p>
      <button type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 self-start mt-1 text-[13px] font-bold text-indigo-700 underline" @click="emit('routes')">
        See the routes ›
      </button>
    </template>
    <template v-else>
      <!-- Answers kept, none in time (lib/eggDayRule.ts): said plainly; the nearest is shown, marked, never the answer. -->
      <template v-if="tile.late">
        <p class="text-[13px] text-slate-700" data-testid="now-tile-no-route-in-time">{{ lateWords }}</p>
        <p v-if="tile.late.answer" class="text-[12px] text-slate-500" data-testid="now-tile-late">
          {{ tile.late.answer.endTE }} TE ·
          <span class="font-mono" :title="tile.late.answer.chain.join(' ')">{{ tile.late.answer.chain.join(' ') }}</span> ·
          {{ lateMark }}
        </p>
      </template>
      <p v-else class="text-[13px] text-slate-600" data-testid="now-tile-empty">Not worked out for this save yet.</p>
      <button
        type="button"
        class="self-start mt-1 rounded-lg border border-indigo-300 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50"
        @click="emit('open', screenOpen)"
      >
        {{ goal === 'date' ? (open ? `Open ${NAMES.byDate}` : 'Open Egg Day') : `Open ${fastestName(target)}` }}
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { dateAt, dayWords } from '@/lib/eventWhen';
import { spareWords, whenAgo } from '@/lib/nowWords';
import { howWords, saveGapWords, secondaryLabel, sourceWords, type Tile } from '@/lib/savedTiles';
import { secondaryLine } from '@/lib/currentAnswer';
import { NAMES, fastestName } from '@/lib/siteNav';
import { lateMarker, noRouteInTimeWords } from '@/lib/eggDayRule';
import type { MyRunsOpen } from '@/lib/myRunsDashboard';
import { fastOpen } from '@/lib/recalc';

const props = defineProps<{
  tile: Tile;
  goal: 'fastest' | 'date';
  title: string;
  /** Fastest's target. */
  target: number;
  now: number;
  zone: string;
  /** "3rd of 12 named players", '' for none. */
  standing: string;
  standingLabel: string;
  /** Another date than Egg Day (the goal picked on Right now, 24 Oct 2026): its screen. Absent: Egg Day's. */
  open?: MyRunsOpen | null;
  /** Right now's Run Fast button is on the page for this same goal: How sure gives no second one (ux review
   *  26 Oct, row 15: one Run Fast on My runs). */
  runFastAbove?: boolean;
}>();
const emit = defineEmits<{ open: [to: MyRunsOpen]; routes: [] }>();

const LEVEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const SURE = {
  high: 'bg-emerald-50 text-emerald-900',
  medium: 'bg-amber-50 text-amber-900',
  low: 'bg-rose-50 text-rose-900',
} as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const a = computed(() => props.tile.answer);
/** Egg Day's tile, or another date's (`open`, picked on Right now's switch). */
const lateWords = computed(() => noRouteInTimeWords(props.open ? 'date' : 'eggday', props.tile.late?.seconds ?? null));
const lateMark = computed(() => lateMarker(props.open ? 'date' : 'eggday'));
const headline = computed(() => {
  if (!a.value) return '';
  if (props.goal === 'date') return `${a.value.endTE} TE`;
  return dayWords(a.value.end, props.zone);
});
const sub = computed(() => {
  if (!a.value) return '';
  if (props.goal === 'date') return a.value.spareHours != null ? `${spareWords(a.value.spareHours)} spare` : 'by the date';
  const n = a.value.chain.length;
  return `${n} ascension${n === 1 ? '' : 's'}`;
});
/** The route: in full up to five stops, else its first three and the last. */
const route = computed(() => {
  const c = a.value?.chain ?? [];
  return c.length > 5 ? `${c.slice(0, 3).join(' ')} … ${c[c.length - 1]}` : c.join(' ');
});
const secondaryText = computed(() => {
  const b = props.tile.secondary;
  if (!b) return '';
  return secondaryLine(secondaryLabel(b), { goal: props.goal, ...b }, t =>
    dayWords(t, props.zone)
  );
});
const screenOpen = computed<MyRunsOpen>(() =>
  props.open ?? (props.goal === 'date' ? { auto: 'by-date', byDate: { eggDay: true } } : { auto: 'fastest', depth: 'smart', target: props.target })
);
const actionOpen = computed<MyRunsOpen>(() => fastOpen(screenOpen.value));
</script>
