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
          <button v-if="tile.sure.action" type="button" class="font-bold underline" @click="emit('open', actionOpen)">
            {{ tile.sure.action === 'check' ? 'Check exactly ›' : 'Run Fast ›' }}
          </button>
        </span>
      </div>
      <p v-if="tile.olderSave" class="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[12px] text-amber-900" data-testid="now-tile-older">
        Older save than the one you loaded.
        <button type="button" class="font-bold underline" @click="emit('open', screenOpen)">Work it out again ›</button>
      </p>
      <p v-if="standing" class="mt-1 border-t border-slate-100 pt-1.5 text-[13px] text-slate-700" data-testid="now-tile-standing">
        {{ standingLabel }}: <b>{{ standing }}</b>
      </p>
      <button type="button" class="self-start mt-1 text-[13px] font-bold text-indigo-700 underline" @click="emit('routes')">
        See the routes ›
      </button>
    </template>
    <template v-else>
      <p class="text-[13px] text-slate-600" data-testid="now-tile-empty">Not worked out for this save yet.</p>
      <button
        type="button"
        class="self-start mt-1 rounded-lg border border-indigo-300 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50"
        @click="emit('open', screenOpen)"
      >
        {{ goal === 'date' ? 'Open Egg Day' : 'Open Fastest' }}
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { dateAt } from '@/lib/eventWhen';
import { spareWords, whenAgo } from '@/lib/nowWords';
import { howWords, saveGapWords, secondaryLabel, sourceWords, type Tile } from '@/lib/savedTiles';
import { secondaryLine } from '@/lib/currentAnswer';
import { formatDate } from '@/lib/leaderboardRank';
import type { MyRunsOpen } from '@/lib/myRunsDashboard';

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
const headline = computed(() => {
  if (!a.value) return '';
  if (props.goal === 'date') return `${a.value.endTE} TE`;
  return formatDate(a.value.end * 1000, props.zone, { month: 'short', day: 'numeric', year: 'numeric' });
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
    formatDate(t * 1000, props.zone, { month: 'short', day: 'numeric', year: 'numeric' })
  );
});
const screenOpen = computed<MyRunsOpen>(() =>
  props.goal === 'date' ? { auto: 'by-date', byDate: { eggDay: true } } : { auto: 'fastest', depth: 'smart', target: props.target }
);
const actionOpen = computed<MyRunsOpen>(() =>
  props.tile.sure?.action === 'fast'
    ? { auto: 'fastest', depth: 'smart', tab: 'nearby', target: props.target, level: 'quick' }
    : screenOpen.value
);
</script>
