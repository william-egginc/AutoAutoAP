/**
 * Entry point for the Chain Explorer page.
 *
 * NO PINIA, and that is the point. Everything this page draws comes from two public HTTP endpoints,
 * so it needs none of the planner's stores, no save file and no player id -- which is what lets it
 * be a plain static bundle that runs anywhere. The chart components it borrows
 * (`components/charts/EChart.vue`, `components/auto/charts/SearchShapeChart.vue`) take their data
 * as props and touch no store, so sharing them costs nothing. Adding a store-bound component here
 * would break the page with an "activePinia" throw, which Vue swallows into a blank subtree, so
 * keep this entry as thin as it is.
 */
import { createApp } from 'vue';

import ChainExplorer from './ChainExplorer.vue';
import { prefetchAll } from './collector';
import { loadEcharts } from '@/lib/charts/loadEcharts';
import '../index.css';

// Both before mounting, so neither waits for the first render.
//  - The run list: usually already in flight from explorer.html; this adopts it, or starts it. See
//    collector.ts `prefetchAll`.
//  - The chart library, which every chart here needs and which is no longer part of this bundle
//    (lib/charts/loadEcharts.ts). Starting it now lets it download while the run list is fetched
//    and folded, instead of after the first chart has mounted. A failure is left to the charts,
//    which say so and offer a reload.
prefetchAll();
loadEcharts().catch(() => {});

createApp(ChainExplorer).mount('#app');
