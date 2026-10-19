<!--
  "Your routes at a glance" (Q9, 18 Oct 2026): the account's routes as points, one goal at a time, from what My runs
  already holds (the board rows LeaderboardPanel hands up, the runs and answers saved on this device). Nothing is
  fetched or priced (lib/routeScatter.ts). Inline SVG, no chart library.

  x: ascensions or finish date. y: a race's days to finish; a date's TE reached or hours to spare. Colour is the
  search level (one blue, Light lightest to Exhaustive darkest), shape is where the run is from; the best is ringed.
  Hover, tap or the arrow keys (the picture takes focus) show a route and its numbers; the summary sentence and
  "The same routes as a list" carry the same data without the picture. Folded; closed on a phone.
-->
<template>
  <details
    :open="open"
    class="rounded-2xl border border-slate-200 bg-white p-4"
    data-testid="my-runs-scatter"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary class="cursor-pointer text-[11px] font-black uppercase tracking-widest text-slate-500">
      Your routes at a glance<span class="ml-2 font-semibold normal-case tracking-normal text-slate-500">{{
        countWords
      }}</span>
    </summary>

    <div class="mt-3 space-y-2">
      <p v-if="!built.goals.length" class="text-[12px] text-slate-600" data-testid="my-runs-scatter-empty">
        {{
          rows === null && !savedCount
            ? 'Your runs are still loading.'
            : 'No routes of yours yet: runs you send or save show here.'
        }}
      </p>
      <template v-else>
        <!-- The controls: one row above the picture. -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]" data-testid="my-runs-scatter-controls">
          <label class="flex items-center gap-1.5">
            <span class="text-slate-500">Goal</span>
            <select
              v-model="goalKey"
              class="rounded-lg border-slate-200 py-1 pl-2 pr-7 text-[12px] font-bold text-slate-700"
              data-testid="my-runs-scatter-goal"
            >
              <option v-for="g in built.goals" :key="g.key" :value="g.key">{{ g.label }} ({{ g.count }})</option>
            </select>
          </label>
          <div role="group" aria-label="Across" class="flex gap-1">
            <button
              v-for="x in X_CHOICES"
              :key="x"
              type="button"
              :class="pill(xAxis === x)"
              :aria-pressed="xAxis === x"
              :data-testid="`my-runs-scatter-x-${x}`"
              @click="xAxis = x"
            >
              {{ X_NAMES[x] }}
            </button>
          </div>
          <div v-if="view.goal?.kind === 'date'" role="group" aria-label="Up" class="flex gap-1">
            <button
              v-for="y in Y_CHOICES"
              :key="y"
              type="button"
              :class="pill(yAxis === y)"
              :aria-pressed="yAxis === y"
              :data-testid="`my-runs-scatter-y-${y}`"
              @click="yAxis = y"
            >
              {{ Y_NAMES[y] }}
            </button>
          </div>
        </div>

        <p class="text-[12px] text-slate-700 leading-relaxed" data-testid="my-runs-scatter-summary">{{ summary }}</p>

        <div v-if="view.shown.length" class="relative" data-testid="my-runs-scatter-plot">
          <svg
            :viewBox="`0 0 ${W} ${H}`"
            class="block w-full h-auto select-none rounded-lg bg-[#fcfcfb] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            role="img"
            tabindex="0"
            :aria-label="`${summary} Use the arrow keys to step through the routes.`"
            @keydown="onKey"
            @pointerleave="!pinned && (active = null)"
          >
            <!-- Grid and axes: hairlines, recessive. -->
            <g>
              <line
                v-for="t in yTicks"
                :key="`gy${t}`"
                :x1="L"
                :x2="W - R"
                :y1="py(t)"
                :y2="py(t)"
                stroke="#e1e0d9"
                stroke-width="1"
              />
              <line :x1="L" :x2="W - R" :y1="H - B" :y2="H - B" stroke="#c3c2b7" stroke-width="1" />
              <text
                v-for="t in yTicks"
                :key="`ty${t}`"
                :x="L - 6"
                :y="py(t) + 3.5"
                text-anchor="end"
                font-size="10"
                fill="#898781"
                style="font-variant-numeric: tabular-nums"
              >
                {{ tickText(t, view.y, zone) }}
              </text>
              <text
                v-for="t in xTicks"
                :key="`tx${t}`"
                :x="px(t)"
                :y="H - B + 14"
                text-anchor="middle"
                font-size="10"
                fill="#898781"
                style="font-variant-numeric: tabular-nums"
              >
                {{ tickText(t, view.x, zone) }}
              </text>
              <text :x="(L + W - R) / 2" :y="H - 4" text-anchor="middle" font-size="10" fill="#52514e">
                {{ X_NAMES[view.x] }}
              </text>
              <text :x="L" :y="10" font-size="10" fill="#52514e">{{ Y_NAMES[view.y] }}</text>
            </g>
            <!-- The points, worst first so the best are drawn on top. -->
            <g v-for="d in drawn" :key="d.p.id" :data-from="d.p.from" :data-level="d.p.level">
              <rect
                v-if="d.p.from === 'saved'"
                :x="d.x - 4.5"
                :y="d.y - 4.5"
                width="9"
                height="9"
                :transform="`rotate(45 ${d.x} ${d.y})`"
                :fill="LEVEL_COLOURS[d.p.level]"
                stroke="#fcfcfb"
                stroke-width="2"
              />
              <circle
                v-else
                :cx="d.x"
                :cy="d.y"
                r="4.5"
                :fill="d.p.from === 'maybe' ? '#fcfcfb' : LEVEL_COLOURS[d.p.level]"
                :stroke="d.p.from === 'maybe' ? LEVEL_COLOURS[d.p.level] : '#fcfcfb'"
                stroke-width="2"
              />
              <circle
                v-if="active === d.p.id"
                :cx="d.x"
                :cy="d.y"
                r="8"
                fill="none"
                stroke="#4f46e5"
                stroke-width="2"
              />
              <!-- The hit area: bigger than the mark. -->
              <circle
                :cx="d.x"
                :cy="d.y"
                r="12"
                fill="transparent"
                class="cursor-pointer"
                @pointerenter="!pinned && (active = d.p.id)"
                @click="tap(d.p.id)"
              />
            </g>
            <g v-if="bestDrawn" pointer-events="none" data-testid="my-runs-scatter-best">
              <circle :cx="bestDrawn.x" :cy="bestDrawn.y" r="9" fill="none" stroke="#0b0b0b" stroke-width="1.5" />
              <text
                :x="bestDrawn.x + (bestDrawn.x > W - 60 ? -12 : 12)"
                :y="bestDrawn.y - 8"
                :text-anchor="bestDrawn.x > W - 60 ? 'end' : 'start'"
                font-size="10"
                font-weight="700"
                fill="#0b0b0b"
              >
                Best
              </text>
            </g>
          </svg>

          <!-- The card for the route under the pointer, tapped or stepped to. Text only (escaped). -->
          <div
            v-if="activeCard"
            class="pointer-events-none absolute z-10 max-w-[18rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-snug text-slate-600 shadow-lg"
            :style="activeCard.style"
            data-testid="my-runs-scatter-card"
          >
            <p class="font-mono-premium font-bold text-slate-900 break-words">{{ activeCard.lines[0] }}</p>
            <p v-for="(l, k) in activeCard.lines.slice(1)" :key="k">{{ l }}</p>
          </div>
          <p class="sr-only" aria-live="polite">{{ activeCard ? activeCard.lines.join('. ') : '' }}</p>
        </div>

        <!-- The key: colour is the level, shape is where the run is from. -->
        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600"
          data-testid="my-runs-scatter-key"
        >
          <span v-for="l in levelsShown" :key="l" class="flex items-center gap-1">
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="4.5" :fill="LEVEL_COLOURS[l]" /></svg
            >{{ levelName(l) }}
          </span>
          <span v-for="f in fromsShown" :key="f" class="flex items-center gap-1">
            <svg width="12" height="12" aria-hidden="true">
              <rect
                v-if="f === 'saved'"
                x="2.5"
                y="2.5"
                width="7"
                height="7"
                transform="rotate(45 6 6)"
                fill="#52514e"
              />
              <circle
                v-else
                cx="6"
                cy="6"
                r="4"
                :fill="f === 'maybe' ? '#fff' : '#52514e'"
                stroke="#52514e"
                stroke-width="1.5"
              /></svg
            >{{ fromName(f) }}
          </span>
          <span class="flex items-center gap-1">
            <svg width="14" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="none" stroke="#0b0b0b" stroke-width="1.5" /></svg
            >Best
          </span>
        </div>
        <p v-for="n in notes" :key="n" class="text-[11px] text-slate-500" data-testid="my-runs-scatter-note">{{ n }}</p>

        <details
          class="rounded-lg border border-slate-100 p-2"
          data-testid="my-runs-scatter-list"
          @toggle="listOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary class="cursor-pointer text-[11px] font-bold text-indigo-700">The same routes as a list</summary>
          <div v-if="listOpen" class="mt-2 overflow-x-auto">
            <table class="min-w-full text-left text-[11px] text-slate-700">
              <thead class="text-slate-500">
                <tr>
                  <th class="py-1 pr-3 font-bold">Route</th>
                  <th class="py-1 pr-3 font-bold">Ascensions</th>
                  <th v-if="view.goal?.kind === 'race'" class="py-1 pr-3 font-bold">Days</th>
                  <template v-else>
                    <th class="py-1 pr-3 font-bold">TE</th>
                    <th class="py-1 pr-3 font-bold">Spare</th>
                  </template>
                  <th class="py-1 pr-3 font-bold">Finish</th>
                  <th class="py-1 pr-3 font-bold">Level</th>
                  <th class="py-1 font-bold">From</th>
                </tr>
              </thead>
              <tbody style="font-variant-numeric: tabular-nums">
                <tr v-for="p in view.shown" :key="p.id" class="border-t border-slate-100">
                  <td class="py-1 pr-3 font-mono-premium whitespace-nowrap">{{ p.chain.join(' → ') }}</td>
                  <td class="py-1 pr-3">{{ p.asc }}</td>
                  <td v-if="view.goal?.kind === 'race'" class="py-1 pr-3">
                    {{ p.days != null ? p.days.toFixed(1) : '' }}
                  </td>
                  <template v-else>
                    <td class="py-1 pr-3">{{ p.te }}</td>
                    <td class="py-1 pr-3">{{ p.spareHours != null ? `${p.spareHours.toFixed(1)} h` : '' }}</td>
                  </template>
                  <td class="py-1 pr-3 whitespace-nowrap">{{ p.finish != null ? whenText(p.finish, zone) : '' }}</td>
                  <td class="py-1 pr-3">{{ levelName(p.level) }}</td>
                  <td class="py-1">{{ fromName(p.from) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <p class="text-[11px] text-slate-500">Every run is also in Your runs below, with its filters.</p>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { BoardRow } from '@/lib/leaderboardRank';
import {
  FROM_ORDER,
  LEVEL_COLOURS,
  LEVEL_ORDER,
  X_NAMES,
  Y_NAMES,
  ascTicks,
  buildScatter,
  dateTicks,
  defaultGoal,
  fromName,
  levelName,
  niceTicks,
  pointLines,
  scatterNotes,
  scatterSummary,
  scatterView,
  tickText,
  whenText,
  xOf,
  yOf,
  type SavedAnswerLike,
  type SavedRunLike,
  type ScatterX,
  type ScatterY,
} from '@/lib/routeScatter';

const props = withDefaults(
  defineProps<{
    rows: BoardRow[] | null;
    savedRuns?: readonly SavedRunLike[];
    savedAnswers?: readonly SavedAnswerLike[];
    eggDayAt: number;
    eggDayYear: number;
    zone: string;
    /** Open from the start (specs); otherwise open on a wide screen, closed on a phone. */
    startOpen?: boolean;
  }>(),
  { savedRuns: () => [], savedAnswers: () => [], startOpen: false }
);

const X_CHOICES: ScatterX[] = ['asc', 'finish'];
const Y_CHOICES: ScatterY[] = ['te', 'spare'];
const W = 640;
const H = 300;
const L = 44;
const R = 16;
const T = 18;
const B = 34;

const open = ref(props.startOpen);
onMounted(() => {
  if (props.startOpen || typeof window === 'undefined' || !window.matchMedia) return;
  open.value = !window.matchMedia('(max-width: 639px)').matches;
});
const listOpen = ref(false);

const savedCount = computed(() => props.savedRuns.length + props.savedAnswers.length);
const built = computed(() =>
  buildScatter({
    rows: props.rows,
    savedRuns: props.savedRuns,
    savedAnswers: props.savedAnswers,
    eggDayAt: props.eggDayAt,
    eggDayYear: props.eggDayYear,
    zone: props.zone,
  })
);
const goalKey = ref<string | null>(null);
// The goal with the most points, until the player picks one that still has points.
watch(
  () => built.value.goals,
  goals => {
    if (!goalKey.value || !goals.some(g => g.key === goalKey.value)) goalKey.value = defaultGoal(goals);
  },
  { immediate: true }
);
const xAxis = ref<ScatterX>('asc');
const yAxis = ref<ScatterY>('te');
const view = computed(() =>
  scatterView(built.value.goals, built.value.points, goalKey.value, xAxis.value, yAxis.value)
);
const summary = computed(() => scatterSummary(view.value, props.zone));
const notes = computed(() => scatterNotes(view.value, built.value.missed));
const countWords = computed(() => {
  const n = built.value.points.length;
  if (!built.value.goals.length) return props.rows === null && !savedCount.value ? ' · loading' : ' · none yet';
  return ` (${n} ${n === 1 ? 'route' : 'routes'}, ${built.value.goals.length} ${built.value.goals.length === 1 ? 'goal' : 'goals'})`;
});

const pill = (on: boolean) =>
  `rounded-lg border px-2.5 py-1 text-[12px] font-bold ${
    on
      ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
  }`;

// ------------------------------------------------------------------------------------------- scales

const xs = computed(() => view.value.shown.map(p => xOf(p, view.value.x) as number));
const ys = computed(() => view.value.shown.map(p => yOf(p, view.value.y) as number));
const xDomain = computed<[number, number]>(() => {
  const lo = Math.min(...xs.value);
  const hi = Math.max(...xs.value);
  if (view.value.x === 'asc') return [lo - 0.5, hi + 0.5];
  const pad = Math.max((hi - lo) * 0.05, 3_600_000);
  return [lo - pad, hi + pad];
});
const yDomain = computed<[number, number]>(() => {
  const lo = Math.min(...ys.value);
  const hi = Math.max(...ys.value);
  const pad = Math.max((hi - lo) * 0.08, view.value.y === 'te' ? 1 : 0.1);
  return [lo - pad, hi + pad];
});
const px = (v: number) => {
  const [a, b] = xDomain.value;
  return L + ((v - a) / (b - a || 1)) * (W - L - R);
};
const py = (v: number) => {
  const [a, b] = yDomain.value;
  return H - B - ((v - a) / (b - a || 1)) * (H - B - T);
};
const xTicks = computed(() => {
  const [a, b] = xDomain.value;
  return view.value.x === 'asc' ? ascTicks(Math.ceil(a), Math.floor(b)) : dateTicks(a, b);
});
const yTicks = computed(() => {
  const [a, b] = yDomain.value;
  const t = niceTicks(a, b, 5);
  return view.value.y === 'te' ? t.filter(v => Number.isInteger(v)) : t;
});

/** A small steady nudge across for routes on the same ascension count, so equal points don't hide each other. */
function jitter(id: string): number {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.36;
}
const drawn = computed(() =>
  view.value.shown
    .map(p => ({
      p,
      x: px((xOf(p, view.value.x) as number) + (view.value.x === 'asc' ? jitter(p.id) : 0)),
      y: py(yOf(p, view.value.y) as number),
    }))
    .reverse()
);
const bestDrawn = computed(() => drawn.value.find(d => d.p.id === view.value.best?.id) ?? null);
const levelsShown = computed(() => LEVEL_ORDER.filter(l => view.value.shown.some(p => p.level === l)));
const fromsShown = computed(() => FROM_ORDER.filter(f => view.value.shown.some(p => p.from === f)));

// ------------------------------------------------------------------------------- hover, tap, keys

const active = ref<string | null>(null);
const pinned = ref(false);
watch(view, () => {
  active.value = null;
  pinned.value = false;
});
function tap(id: string): void {
  if (pinned.value && active.value === id) {
    pinned.value = false;
    active.value = null;
    return;
  }
  active.value = id;
  pinned.value = true;
}
/** Left and right step through the routes across the picture; Escape lets go. */
function onKey(e: KeyboardEvent): void {
  const order = [...drawn.value].sort((a, b) => a.x - b.x || a.y - b.y);
  if (!order.length) return;
  if (e.key === 'Escape') {
    active.value = null;
    pinned.value = false;
    return;
  }
  const step =
    e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!step && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  const at = order.findIndex(d => d.p.id === active.value);
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? order.length - 1
        : at < 0
          ? step > 0
            ? 0
            : order.length - 1
          : Math.min(order.length - 1, Math.max(0, at + step));
  active.value = order[next].p.id;
  pinned.value = true;
}
const activeCard = computed(() => {
  const d = drawn.value.find(x => x.p.id === active.value);
  const goal = view.value.goal;
  if (!d || !goal) return null;
  const left = (d.x / W) * 100;
  const top = (d.y / H) * 100;
  const style: Record<string, string> = {
    top: `calc(${top}% + 12px)`,
    ...(left > 55 ? { right: `calc(${100 - left}% + 8px)` } : { left: `calc(${left}% + 8px)` }),
  };
  if (top > 60) {
    delete style.top;
    style.bottom = `calc(${100 - top}% + 12px)`;
  }
  return { lines: pointLines(d.p, goal, props.zone, d.p.id === view.value.best?.id), style };
});
</script>
