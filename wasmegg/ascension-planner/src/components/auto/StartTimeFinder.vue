<!--
  "When should I start?" One route priced from every hour of the next week (stores/chainSearch.ts
  `findBestStart`), so a player can see whether waiting to begin catches the weekly sales and finishes
  sooner. The answer belongs to the route shown: another route's legs line up with the sales
  differently, so it is worked out again for each route.
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">When should I start?</h3>
    <p class="text-[11px] text-slate-600 leading-relaxed">
      Prices <span class="font-bold">{{ chain.join(' ') }}</span> as a fresh start at every
      {{ stepMinutes === 60 ? 'hour' : `${stepMinutes / 60} hours` }} of the next week<template
        v-if="store.scheduleEnabled"
      >
        you're awake</template
      >, and shows which start finishes first. Research sales come round weekly, so starting a few hours later can
      finish days sooner. The answer is for this route only: a different route lines up with the sales differently.
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <label class="text-[11px] text-slate-600 flex items-center gap-2">
        <span class="font-bold text-slate-700">Try a start every</span>
        <select
          v-model.number="stepMinutes"
          :disabled="store.busy"
          class="rounded-md border-slate-300 py-1 text-[11px] font-bold text-slate-800"
        >
          <option :value="60">hour</option>
          <option :value="120">2 hours</option>
          <option :value="180">3 hours</option>
        </select>
      </label>
      <span class="text-[11px] text-slate-500">about {{ estimateLabel }} on {{ store.workerBudget }} workers</span>
      <button
        v-if="!store.startSweepRunning"
        type="button"
        :disabled="store.busy || !chain.length"
        class="ml-auto px-4 py-2 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
        @click="store.findBestStart(chain, { stepMinutes })"
      >
        Find the best time to start
      </button>
      <button
        v-else
        type="button"
        class="ml-auto px-4 py-2 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"
        @click="store.stopStartSweep()"
      >
        Stop
      </button>
    </div>

    <div v-if="sweep && store.startSweepRunning" class="space-y-1">
      <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div class="h-full bg-indigo-500 transition-all" :style="{ width: `${pct}%` }"></div>
      </div>
      <p class="text-[11px] text-slate-500">{{ sweep.done }} of {{ sweep.total }} start times priced</p>
    </div>

    <template v-if="best && sweep && !store.startSweepRunning">
      <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1">
        <p class="text-[10px] font-black uppercase tracking-widest text-emerald-800">Best start in the next week</p>
        <p class="text-base font-black text-emerald-900">{{ show(best.start) }}</p>
        <p class="text-[11px] text-emerald-900 leading-relaxed">
          Reaches the end of the route {{ show(best.finish as number)
          }}<template v-if="soonest && soonest !== best"
            >, {{ gainLabel }} than starting at the first time tried ({{ show(soonest.start) }}, done
            {{ show(soonest.finish as number) }})</template
          ><template v-else>: starting right away is already the best</template>.
        </p>
        <p v-if="quickest" class="text-[11px] text-emerald-900 leading-relaxed">
          <span class="font-bold">Quickest run:</span> starting {{ show(quickest.start) }} takes
          {{ daysOf(quickest) }} days; the slowest start in the week takes {{ daysOf(slowest!) }}, so the hour you start
          can change the run by {{ spreadLabel }}.
        </p>
      </div>

      <!-- The week at a glance: how long the run takes from each start, against the quickest. -->
      <div class="overflow-x-auto">
        <table class="text-[10px] tabular-nums border-separate" style="border-spacing: 2px">
          <thead>
            <tr>
              <th></th>
              <th v-for="h in hours" :key="h" class="font-bold text-slate-400 px-0.5">{{ hourLabel(h) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in grid" :key="d.label">
              <th class="pr-2 text-left font-bold text-slate-500 whitespace-nowrap">{{ d.label }}</th>
              <td
                v-for="(c, i) in d.cells"
                :key="i"
                class="w-6 h-5 rounded"
                :style="{ background: c ? cellColor(c.late) : 'transparent' }"
                :title="cellTitle(c)"
              ></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-[10px] text-slate-500">
        Each square is a start time. Darker green is a quicker run from that start; grey is the slowest in the week.
        Hover a square for how long it takes and when it finishes. Empty squares are hours you're asleep.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { showDateTime, showHour } from '@/lib/displayTime';
import { sweepSeconds, workerSecondsPerChain } from '@/search/speed';
import { formatHours } from '@/search/exhaustive';

const props = defineProps<{ chain: number[] }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();
const stepMinutes = ref(60);

const tz = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
const show = (s: number) => showDateTime(s, tz.value);

/** Starts to try: every step of a week (fewer when awake hours are set, not known until it runs). */
const planned = computed(() => Math.ceil((7 * 24 * 60) / stepMinutes.value));
const estimateLabel = computed(() =>
  formatHours(sweepSeconds(planned.value, store.workerBudget, workerSecondsPerChain(props.chain.length)) / 3600)
);

/** The sweep on screen, when it's for this route. */
const sweep = computed(() =>
  store.startSweep && store.startSweep.chain.join(',') === props.chain.join(',') ? store.startSweep : null
);
const pct = computed(() => (sweep.value?.total ? Math.round((100 * sweep.value.done) / sweep.value.total) : 0));
const priced = computed(() => (sweep.value?.results ?? []).filter(r => r.finish !== null));
const best = computed(() =>
  priced.value.length ? priced.value.reduce((a, b) => ((b.finish as number) < (a.finish as number) ? b : a)) : null
);
/** The start whose run takes least time, and the one that takes most: the hour's own effect. */
const byLength = computed(() =>
  [...priced.value].sort((a, b) => (a.finish as number) - a.start - ((b.finish as number) - b.start))
);
const quickest = computed(() => byLength.value[0] ?? null);
const slowest = computed(() => byLength.value[byLength.value.length - 1] ?? null);
const spreadHours = computed(() =>
  quickest.value && slowest.value
    ? ((slowest.value.finish as number) -
        slowest.value.start -
        ((quickest.value.finish as number) - quickest.value.start)) /
      3600
    : 0
);
const spreadLabel = computed(() => lateLabel(spreadHours.value));
function daysOf(r: { start: number; finish: number | null }): string {
  return (((r.finish as number) - r.start) / 86400).toFixed(1);
}
/** The first start tried: what "just start now" gives. */
const soonest = computed(() => priced.value[0] ?? null);
const gainLabel = computed(() => {
  if (!best.value || !soonest.value) return '';
  const d = ((soonest.value.finish as number) - (best.value.finish as number)) / 3600;
  return `${lateLabel(d)} sooner`;
});
function lateLabel(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

/** Hours of the day across the grid (the step's), and one row per day. */
/** The step the sweep on screen used (the dropdown may have moved since). */
const gridStep = computed(() => (sweep.value?.step ?? stepMinutes.value * 60) / 3600);
const hours = computed(() => Array.from({ length: Math.round(24 / gridStep.value) }, (_, i) => i * gridStep.value));
function hourLabel(h: number): string {
  return showHour(h).replace(':00', '');
}
const grid = computed(() => {
  const rows = new Map<
    string,
    { label: string; cells: ({ start: number; finish: number | null; late: number | null } | null)[] }
  >();
  const quickestSecs = quickest.value ? (quickest.value.finish as number) - quickest.value.start : null;
  const step = gridStep.value;
  for (const r of sweep.value?.results ?? []) {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: tz.value,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(r.start * 1000));
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    const label = `${get('weekday')} ${get('month')} ${get('day')}`;
    const hour = Number(get('hour')) % 24;
    const col = Math.floor(hour / step);
    if (!rows.has(label)) rows.set(label, { label, cells: Array.from({ length: hours.value.length }, () => null) });
    rows.get(label)!.cells[col] = {
      start: r.start,
      finish: r.finish,
      late: r.finish === null || quickestSecs === null ? null : (r.finish - r.start - quickestSecs) / 3600,
    };
  }
  return [...rows.values()];
});
function cellTitle(c: { start: number; finish: number | null; late: number | null } | null): string {
  if (!c) return '';
  if (c.late === null || c.finish === null) return `${show(c.start)}: couldn't be priced`;
  const days = ((c.finish - c.start) / 86400).toFixed(1);
  const vs = c.late < 0.05 ? 'the quickest' : `${lateLabel(c.late)} longer than the quickest`;
  return `Start ${show(c.start)}: takes ${days} days (${vs}), done ${show(c.finish)}`;
}
/** Green for the quickest run, fading to grey at the slowest start in the week. */
function cellColor(late: number | null): string {
  if (late === null) return '#fecaca';
  const t = Math.min(1, Math.max(0, late / Math.max(1, spreadHours.value)));
  const light = Math.round(30 + t * 55);
  const sat = Math.round(60 - t * 55);
  return `hsl(152 ${sat}% ${light}%)`;
}
</script>
