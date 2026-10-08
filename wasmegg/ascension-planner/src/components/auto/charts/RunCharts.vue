<!--
  The run's charts. The heat map is always the starting view (constant cost, any run size). The
  dots are opt-in: "Show the dots" draws the point chart at the detail the player picks, and
  "Back to the heat map" disposes it (and, past CHART_AUTO_LIMIT chains, frees the point list).
  While a run goes, dots are capped at LIVE_DOT_LIMIT; the bigger choices appear once it ends.
-->
<template>
  <!-- Hidden by default and unmounted while hidden: the store builds no chart data until it is shown. -->
  <div v-if="!store.chartShown" class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
    <button
      type="button"
      class="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
      @click="store.setChartShown(true)"
    >
      Show the chart
    </button>
    <span class="text-[11px] text-slate-500">Draws the heat map of every chain priced so far</span>
  </div>
  <div v-else class="space-y-3">
    <div v-if="hideLink" class="flex justify-end">
      <button
        type="button"
        class="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
        @click="store.setChartShown(false)"
      >
        Hide
      </button>
    </div>
    <template v-if="!showDots">
      <RunHeatMap :heat="store.heat" />
      <div
        v-if="store.pricedCount > 0"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
      >
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
          @click="openDots"
        >
          Show the dots
        </button>
        <DetailPicker />
      </div>
    </template>
    <template v-else>
      <div class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
          @click="closeDots"
        >
          Back to the heat map
        </button>
        <DetailPicker />
      </div>
      <SearchShapeChart
        :points="store.pricedChains"
        :best-chain="store.bestChain"
        :live="store.isRunning"
        :max-points="maxPoints"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { CHART_AUTO_LIMIT, MAX_DRAWN_POINTS } from '@/lib/chartThin';
import SearchShapeChart from './SearchShapeChart.vue';
import RunHeatMap from './RunHeatMap.vue';

withDefaults(defineProps<{ hideLink?: boolean }>(), { hideLink: true });

const SIZES = [2_000, 5_000, 20_000];
const LIVE_DOT_LIMIT = MAX_DRAWN_POINTS;
const STORE_KEY = 'autoap.dotDetail';

type Detail = number | 'all';

function loadDetail(): Detail {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === 'all') return 'all';
    const n = Number(v);
    if (SIZES.includes(n)) return n;
  } catch {
    /* storage blocked: fall through */
  }
  return MAX_DRAWN_POINTS;
}
function saveDetail(d: Detail): void {
  try {
    localStorage.setItem(STORE_KEY, String(d));
  } catch {
    /* ignore */
  }
}

const store = useChainSearchStore();
const detail = ref<Detail>(loadDetail());
// Every run starts on the heat map. The store clears `heat` when a run starts or a saved one opens.
const showDots = ref(false);
watch(
  () => store.heat === null,
  empty => {
    if (empty) showDots.value = false;
  }
);

const total = computed(() => store.pricedCount);
/** Detail choices on offer: the sizes under the run's size, and "every chain" once it has finished. */
const options = computed<{ value: Detail; label: string }[]>(() => {
  const out: { value: Detail; label: string }[] = SIZES.filter(
    s => s < total.value && (!store.isRunning || s <= LIVE_DOT_LIMIT)
  ).map(s => ({ value: s, label: s.toLocaleString() }));
  if (!store.isRunning || total.value <= LIVE_DOT_LIMIT)
    out.push({ value: 'all', label: `every chain (${total.value.toLocaleString()})` });
  return out;
});
/** What is really drawn: a stored choice that is not on offer (e.g. "all" mid-run) is clamped. */
const effective = computed<Detail>(() => {
  const d = detail.value;
  if (store.isRunning) return typeof d === 'number' ? Math.min(d, LIVE_DOT_LIMIT) : LIVE_DOT_LIMIT;
  return d;
});
const maxPoints = computed(() => (effective.value === 'all' ? Infinity : effective.value));
const drawn = computed(() => Math.min(total.value, maxPoints.value));
const warn = computed(() => drawn.value >= CHART_AUTO_LIMIT);

function openDots(): void {
  showDots.value = true;
  if (total.value > CHART_AUTO_LIMIT) store.drawCharts();
}
function closeDots(): void {
  showDots.value = false;
  store.releaseCharts();
}

// The select, shared by both views.
const DetailPicker = defineComponent({
  setup() {
    return () =>
      h('div', { class: 'flex flex-wrap items-center gap-2 text-[11px] text-slate-500' }, [
        h('span', 'Dots to draw'),
        h(
          'select',
          {
            class: 'rounded border border-slate-300 bg-white pl-1.5 pr-7 py-1 text-[11px] text-slate-700',
            value: String(selectedValue.value),
            onChange: (e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              detail.value = v === 'all' ? 'all' : Number(v);
              saveDetail(detail.value);
            },
          },
          options.value.map(o =>
            h('option', { value: String(o.value), selected: String(o.value) === String(selectedValue.value) }, o.label)
          )
        ),
        store.isRunning && total.value > LIVE_DOT_LIMIT
          ? h('span', `Bigger choices appear when the run finishes.`)
          : null,
        warn.value
          ? h(
              'span',
              { class: 'w-full text-amber-700 font-semibold' },
              `Drawing ${drawn.value.toLocaleString()} dots can make the page slow or crash it on some computers; 5,000 shows the shape well.`
            )
          : null,
      ]);
  },
});

/** The option the select shows: the stored choice, or the closest one on offer. */
const selectedValue = computed<Detail>(() => {
  const vals = options.value.map(o => o.value);
  if (vals.includes(effective.value)) return effective.value;
  if (typeof effective.value === 'number' && effective.value >= total.value && vals.includes('all')) return 'all';
  const nums = vals.filter((v): v is number => typeof v === 'number');
  if (typeof effective.value === 'number') {
    const under = nums.filter(n => n <= (effective.value as number));
    if (under.length) return under[under.length - 1];
  }
  return vals[vals.length - 1] ?? 'all';
});
</script>
