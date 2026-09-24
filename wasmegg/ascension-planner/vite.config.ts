import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';

/**
 * `version.json`: each page's hashed entry script, `{"index":"assets/index-BGv8tSVu.js",...}`.
 *
 * An open tab polls this to learn that a newer build is live (src/composables/useNewVersion.ts).
 * It is ~90 bytes where the page's HTML is ~1.2 KB, so a tab can check every minute for less than
 * it used to spend every five. The entry names are content hashes, so a rebuild that changed no
 * code writes the same file and no tab is told to reload for nothing.
 */
function versionFile(): Plugin {
  return {
    name: 'aap-version-file',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entries: Record<string, string> = {};
      for (const out of Object.values(bundle)) {
        if (out.type === 'chunk' && out.isEntry) entries[out.name] = out.fileName;
      }
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(entries) });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // vite.config.ts is evaluated before vite loads .env files, so `process.env` here holds only
  // what the shell exported -- a VITE_PREVIEW_HOSTS written into .env.local would be invisible.
  // loadEnv reads those files explicitly, so one .env.local configures both the build (VITE_*
  // inlined into the bundle) and `vite preview` (the hostnames below). A real shell variable
  // still wins, so a one-off `VITE_PREVIEW_HOSTS=... pnpm serve` keeps working.
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };

  return {
    // Where the built pages will be SERVED from, which is not always where they are built.
    //
    // Netlify serves this at /ascension-planner/, which is why that is the default and why it is
    // hardcoded historically. A GitHub Pages copy lives at /<repo>/ instead, and a page built with
    // the wrong base loads no JS at all -- every asset 404s and the tab shows the "Loading..."
    // fallback forever, which looks like a broken build rather than a path mistake. So it is an
    // env var: `VITE_BASE=/AutoAutoAP/ pnpm build` for a Pages deploy, `VITE_BASE=./` for a folder
    // opened over plain HTTP at an unknown path.
    base: env.VITE_BASE || '/ascension-planner/',
    resolve: {
      tsconfigPaths: true,
      // `lib` and `ui` are workspace packages that declare their own vue/pinia. pnpm keys a
      // package directory by its resolved peers, so a single differing peer -- typescript 6.0.2
      // for this workspace, 6.0.3 for lib -- produces two physically distinct vue and pinia
      // directories. Vite's dev-time dep optimizer collapses them by bare specifier, so dev is
      // fine; the production build follows the real paths and ships two Vue runtimes and two
      // Pinia registries. Components from `ui` then run on the other runtime: `app.use(pinia)`
      // registers on one instance while `useEidsStore()` reads `activePinia` from the other, the
      // store call throws, and Vue drops that subtree silently -- the Player ID form simply is
      // not in the DOM, with no visible error. Force one copy of each.
      dedupe: ['vue', 'pinia'],
    },
    plugins: [vue(), vueJsx(), versionFile()],
    build: {
      chunkSizeWarningLimit: 2000,
      // TWO PAGES, ONE BUILD. `explorer.html` is the Chain Explorer: a static reader of the
      // collector's public endpoints that needs no save, no player id and no Pinia, so it is a
      // separate document rather than a route inside the planner. Listing it here is what makes
      // `dist/explorer.html` exist; vite's default single-entry build would simply ignore the file
      // and the page would 404 in production while working perfectly in dev.
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./index.html', import.meta.url)),
          explorer: fileURLToPath(new URL('./explorer.html', import.meta.url)),
        },
      },
    },

    // `vite preview` refuses any request whose Host header it does not recognise -- DNS-rebinding
    // protection -- and localhost is the only name it knows by default. Put a reverse proxy or a
    // Cloudflare tunnel in front of it and every request comes back "Blocked request. This host is
    // not allowed", which looks like a broken app and is really a one-line config gap.
    //
    // Supplied out of band so no one's private hostname ends up in the repo -- either in the
    // gitignored .env.local next to this file, or for a one-off:
    //   VITE_PREVIEW_HOSTS=egg.example.org pnpm serve
    // Comma-separate for several. Unset keeps the safe localhost-only default.
    preview: {
      host: true,
      allowedHosts:
        env.VITE_PREVIEW_HOSTS?.split(',')
          .map(h => h.trim())
          .filter(Boolean) ?? [],
    },

    server: {
      host: true,
      forwardConsole: {
        unhandledErrors: true,
        logLevels: ['warn', 'error'],
      },
    },
  };
});