<template>
  <!-- `echart-frame` (src/index.css) clips: a tooltip is positioned inside this box, and on a phone
       its first placement (before echarts measures and flips it) can hang past the screen edge and
       leave the whole page scrolling sideways. Styled there rather than in a <style> block here,
       which would ship as one more render-blocking stylesheet on both pages. -->
  <div class="echart-frame" :style="{ width: '100%', height }" :aria-busy="state === 'loading'">
    <div ref="containerRef" class="h-full w-full" />
    <div
      v-if="state !== 'ready'"
      class="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-50 text-[11px] text-slate-400"
    >
      <span v-if="state === 'loading'">Loading chart…</span>
      <span v-else class="px-4 text-center">
        This chart could not load.
        <button type="button" class="font-semibold text-slate-600 underline" @click="reloadPage">
          Reload the page
        </button>
        to try again.
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue';
import type { ChartOption, ECharts } from '@/lib/charts/echarts';
import { loadEcharts, type EchartsModule } from '@/lib/charts/loadEcharts';

const props = withDefaults(
  defineProps<{
    option: ChartOption;
    height?: string;
  }>(),
  {
    height: '320px',
  }
);

const containerRef = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);
/** `loading` until the library arrives; a placeholder of the chart's own height holds its place so
 *  the page does not jump when the canvas appears. */
const state = ref<'loading' | 'ready' | 'failed'>('loading');
let resizeObserver: ResizeObserver | null = null;
let unmounted = false;

onMounted(async () => {
  let lib: EchartsModule;
  try {
    lib = await loadEcharts();
  } catch (error) {
    // Almost always a deploy that replaced the file this tab was built against, or no network. No
    // in-place retry: browsers remember a failed module URL, so asking again fails the same way
    // without even sending a request; a reload is what actually fetches it again.
    console.error('Chart library failed to load:', error);
    if (!unmounted) state.value = 'failed';
    return;
  }
  // The chart may have been removed while the library was on its way (a tab switch, a filter).
  if (unmounted || !containerRef.value) return;

  const instance = lib.echarts.init(containerRef.value);
  chart.value = instance;
  // `props.option` is read NOW, not when loading began, so an option that changed while the library
  // was loading is the one drawn; the watcher below takes every change after this.
  instance.setOption(props.option);
  state.value = 'ready';

  // The modal this lives in can resize (window resize, tab switch reflow) without the chart's own
  // element ever unmounting, so a plain onMounted-time size read isn't enough — keep the canvas in
  // sync with its container for the component's whole lifetime.
  resizeObserver = new ResizeObserver(() => chart.value?.resize());
  resizeObserver.observe(containerRef.value);
});

watch(
  () => props.option,
  option => {
    // notMerge: this component always receives a fully-formed option from its caller (built fresh
    // by a computed), so merging against the previous option would leave stale series/markPoint
    // data around when a variant disappears from the comparison.
    chart.value?.setOption(option, { notMerge: true });
  }
);

function reloadPage(): void {
  location.reload();
}

onBeforeUnmount(() => {
  unmounted = true;
  resizeObserver?.disconnect();
  resizeObserver = null;
  chart.value?.dispose();
  chart.value = null;
});
</script>
