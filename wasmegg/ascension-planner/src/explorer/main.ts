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
import '../index.css';

createApp(ChainExplorer).mount('#app');
