// First: swap a storage the browser blocks for one in memory, before any module reads it (storageGuard.ts).
import './lib/storageGuard.install';
// Then: a player ID out of the address bar before anything (the counter, the app) reads it (urlPlayerId.ts).
import './lib/urlPrivacy.install';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import VueTippy from 'vue-tippy';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/translucent.css';

import App from './App.vue';
import { installAppErrorLog } from './lib/appErrorLog';
import './index.css';

const app = createApp(App);
// Errors nothing caught: one tagged line each, no ID (lib/appErrorLog.ts).
installAppErrorLog(app);
const pinia = createPinia();

app.use(pinia);
app.use(VueTippy, {
  defaultProps: {
    theme: 'translucent',
    delay: [0, 0],
  },
});
app.mount('#app');
