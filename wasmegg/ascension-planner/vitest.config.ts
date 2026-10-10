import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Component specs (src/components/**/*.spec.ts) render single-file components on the server
  // (vue/server-renderer), so no DOM library is needed.
  plugins: [vue()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // The search core (src/search/*) reaches the workspace packages the app itself uses —
      // `lib/artifacts` pulls in `lib`'s Inventory/colleggtible tables. vite.config.ts resolves
      // these through tsconfig paths + pnpm workspace links; vitest needs them spelled out, the same
      // way vite.search.config.ts does for the Node harness.
      lib: new URL('../../lib', import.meta.url).pathname,
      ui: new URL('../../ui', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    // collector/ is a standalone Cloudflare Worker with no build step, so its tests live next to
    // it and are plain .js. They run here rather than in a separate command so `pnpm test` is
    // still the one thing that has to pass.
    include: ['src/**/*.{test,spec}.ts', 'collector/**/*.spec.js'],
    // No collector unless a spec names one (`__AAP_SUBMIT_URL__`). Vitest reads the gitignored
    // .env.local like the dev server does, so a checkout with VITE_SUBMIT_URL set gave every store
    // the real collector: each finished run in a spec then kept a result for sending, built after
    // the spec had ended, and it landed in the next spec's storage (deadlineTE's kept-result spec
    // found two and timed out). It also left the real collector one missing fetch stub away.
    env: { VITE_SUBMIT_URL: '' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    },
  },
});
