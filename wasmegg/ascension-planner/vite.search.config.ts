import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Bundles scripts/fastsearch.ts (and the worker thread it starts, scripts/node-worker.ts) into
 * Node-runnable ESM files.
 *
 * Node 24 strips TypeScript natively, but it will not resolve the `@/` and `lib`
 * aliases the app's source uses everywhere, and there is no vite-node binary in
 * this workspace. Running the source through vite in SSR mode reuses the app's
 * own module resolution, so the harness imports the exact same simulation code
 * the browser build does - which is the whole point of the exercise.
 *
 * ssr.noExternal is set so workspace packages get bundled rather than left as
 * bare imports Node would fail to resolve at runtime.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      lib: fileURLToPath(new URL('../../lib', import.meta.url)),
      ui: fileURLToPath(new URL('../../ui', import.meta.url)),
    },
  },
  ssr: {
    noExternal: true,
    target: 'node',
  },
  build: {
    ssr: true,
    outDir: 'dist-search',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      // Two entries: the command line, and the worker thread it runs searches on (scripts/node-worker.ts),
      // which has to be its own file because a worker thread is started from a path.
      input: {
        fastsearch: 'scripts/fastsearch.ts',
        'chain-worker': 'scripts/node-worker.ts',
        // The precomputed-ascension table (scripts/precompute.ts).
        precompute: 'scripts/precompute.ts',
      },
      output: { entryFileNames: '[name].js' },
    },
  },
});
