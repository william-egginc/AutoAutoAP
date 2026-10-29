// Bundles instant_json.ts with the planner's own aliases (vite SSR, as vite.search.config.ts does).
// Reads the planner dir from PLANNER_DIR; writes only to ./dist. Run: node build.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const planner = path.resolve((process.env.PLANNER_DIR || '').replace(/^~/, os.homedir()));
if (!process.env.PLANNER_DIR) throw new Error('set PLANNER_DIR to wasmegg/ascension-planner');
const req = createRequire(path.join(planner, 'package.json'));
const { build } = await import(pathToFileURL(req.resolve('vite')).href);
const pkgDir = n => path.dirname(req.resolve(n + '/package.json'));
await build({
  configFile: false,
  publicDir: false, // do not copy the planner's public folder (tables) into dist
  root: planner,
  logLevel: 'warn',
  resolve: {
    alias: {
      '@scripts': path.join(planner, 'scripts'),
      '@': path.join(planner, 'src'),
      lib: path.join(planner, '../../lib'),
      ui: path.join(planner, '../../ui'),
      vue: pkgDir('vue'),
      pinia: pkgDir('pinia'),
    },
  },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: true,
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: { input: { instant_json: path.join(here, 'instant_json.ts') }, output: { entryFileNames: '[name].mjs' } },
  },
});
console.log('built dist/instant_json.mjs');
