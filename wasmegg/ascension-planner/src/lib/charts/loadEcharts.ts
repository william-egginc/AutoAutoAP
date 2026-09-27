/**
 * The echarts setup (./echarts.ts), fetched on first use instead of shipped in every page's
 * first download.
 *
 * WHY. echarts plus zrender is about 40% of the JavaScript both pages share, and neither page draws a
 * chart in its first second: the Explorer has to fetch its runs first, and the planner's charts sit
 * in panels behind a loaded backup. Loading it with the rest of the page made every visit wait for a
 * chart library before showing anything at all.
 *
 * ONE REQUEST, SHARED. Every chart on a page awaits the same promise, so ten charts cost one fetch.
 * A failure is not kept here, so a chart mounted later asks again; whether the browser then really
 * refetches is up to it (Chrome remembers a failed module URL until the page reloads, which is why
 * EChart.vue offers a reload rather than retrying).
 *
 * Only EChart.vue should call this, plus a page that knows it will draw charts and wants the fetch
 * started early (explorer/main.ts). Type-only imports of './echarts' stay where they are: they vanish
 * at build time and do not pull the library back into the page.
 */
export type EchartsModule = typeof import('./echarts');

let pending: Promise<EchartsModule> | null = null;

export function loadEcharts(): Promise<EchartsModule> {
  if (!pending) {
    pending = import('./echarts').catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
