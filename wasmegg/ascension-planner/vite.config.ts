import { createReadStream, statSync, type Stats } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants } from 'node:zlib';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import release from './release';

/**
 * `version.json`: each page's hashed entry script, `{"index":"assets/index-BGv8tSVu.js",...}`.
 *
 * An open tab polls this to learn that a newer build is live (src/composables/useNewVersion.ts).
 * It is ~90 bytes where the page's HTML is ~1.2 KB, so a tab can check every minute for less than
 * it used to spend every five. The entry names are content hashes, so a rebuild that changed no
 * code writes the same file and no tab is told to reload for nothing.
 *
 * `release` (from release.ts) says whether a tab built before a given time needs to reload: players
 * asked for the difference between a real fix and a wording change -- the same loud banner on every
 * deploy taught them to ignore it (2026-09-25). Each bundle carries its own build time
 * (__BUILD_TIME__) to compare with.
 */
const BUILD_TIME = new Date().toISOString();

function versionFile(): Plugin {
  return {
    name: 'aap-version-file',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entries: Record<string, string> = {};
      for (const out of Object.values(bundle)) {
        if (out.type === 'chunk' && out.isEntry) entries[out.name] = out.fileName;
      }
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          ...entries,
          release: { reloadIfBuiltBefore: release.reloadIfBuiltBefore, note: release.note.slice(0, 200) },
        }),
      });
    },
  };
}

/**
 * A loud line in the build output when src/ has commits newer than release.ts's last one. The note
 * is written by hand, and it went four days without a change (26-30 Sep 2026): every deploy in that
 * time told players "New: an Egg Day 2027 leaderboard", and the fixes in them only got the quiet
 * "small update" note instead of a reload. Only a warning: a build with no git (or no history) goes
 * ahead silently, and a deploy of wording alone rightly leaves release.ts alone.
 */
const HERE = fileURLToPath(new URL('.', import.meta.url));

function warnIfReleaseStale(): Plugin {
  return {
    name: 'aap-release-stale',
    apply: 'build',
    buildStart() {
      try {
        const last = (paths: string[]) =>
          Number(
            execFileSync('git', ['log', '-1', '--format=%ct', '--', ...paths], { cwd: HERE })
              .toString()
              .trim()
          );
        const src = last(['src']);
        const rel = last(['release.ts']);
        if (src && rel && src > rel) {
          const n = execFileSync('git', ['rev-list', '--count', `--since=${rel + 1}`, 'HEAD', '--', 'src'], {
            cwd: HERE,
          })
            .toString()
            .trim();
          this.warn(
            `release.ts is older than ${n} commit(s) in src/: open tabs will be shown its old note ` +
              `("${release.note.slice(0, 60)}..."). Update its note, and reloadIfBuiltBefore if a fix ships.`
          );
        }
      } catch {
        /* no git here: nothing to compare */
      }
    },
  };
}

/**
 * Hashed files under `assets/` are cached for a year by browsers and by Cloudflare, and sent
 * brotli-compressed when the build made a `.br` copy (see `brotliAssets`); everything else (the two
 * HTML pages, version.json, favicon) keeps `vite preview`'s `no-cache`.
 *
 * WHY. The live site is `vite preview` behind a Cloudflare tunnel, so netlify.toml's headers never
 * apply. Preview's static server (sirv, in dev mode) sends `no-cache` on everything, which Cloudflare
 * turns into a 4-hour browser TTL plus an origin revalidation on every edge hit: a returning player
 * on a phone re-downloaded or re-checked ~650 KB of JavaScript that cannot have changed, because
 * its name is a hash of its content. A new build writes new names and new HTML, and the HTML is
 * still revalidated on every visit, so a year is safe.
 *
 * HOW. A pre-middleware sets the header before sirv runs; sirv copies any header already set on
 * the response over its own default (vite 8.0.16's bundled sirv, `send`: `tmp = res.getHeader(key);
 * if (tmp) headers[key] = tmp`), so the value survives to the 200 and the 304. Only for a file that
 * EXISTS: an unknown name under assets/ gets preview's SPA fallback (index.html, status 200), and
 * that marked immutable would be kept by the browser and Cloudflare for a year -- asking for a name
 * a build has not finished writing yet (mid-deploy) is exactly when that would happen.
 *
 * Takes effect when `pnpm serve` restarts; it has nothing to do with `vite build`.
 */
/**
 * `Cross-Origin-Opener-Policy: same-origin` on the run watcher (watch.html). The watcher must not
 * share a renderer process with the run tab it watches, or the crash it is there to catch kills it
 * too. The planner opens it with `noopener`, which is the main fix (composables/useStepAway.ts); the
 * header severs the link from the watcher's own side as well, however it was opened. COOP is a
 * response header only (a <meta> does nothing), so it is set here, in dev and in preview (the live
 * site). Takes effect when `pnpm serve` restarts.
 */
function watcherIsolation(): Plugin {
  const set = (req: { url?: string }, res: ServerResponse, next: () => void) => {
    if (/(^|\/)watch\.html$/.test((req.url ?? '').split('?')[0]))
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  };
  return {
    name: 'aap-watcher-isolation',
    configureServer(server) {
      server.middlewares.use(set);
    },
    configurePreviewServer(server) {
      server.middlewares.use(set);
    },
  };
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

function immutableAssets(): Plugin {
  return {
    name: 'aap-immutable-assets',
    configurePreviewServer(server) {
      const { config } = server;
      // A relative base (`VITE_BASE=./`) is served from `/` by preview.
      const base = config.base.startsWith('/') ? config.base : '/';
      const prefix = `${base}${config.build.assetsDir}/`.replace(/\/{2,}/g, '/');
      const outDir = path.resolve(config.root, config.build.outDir);
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if ((req.method !== 'GET' && req.method !== 'HEAD') || !pathname.startsWith(prefix)) return next();
        let file = '';
        try {
          file = path.join(outDir, decodeURIComponent(pathname.slice(base.length)));
        } catch {
          // Malformed escape: let sirv answer it, with its own headers.
        }
        if (!file.startsWith(outDir + path.sep) || !isFile(file)) return next();
        res.setHeader('Cache-Control', IMMUTABLE);

        // The build's brotli copy, when there is one and this client takes it. Sent here in full
        // rather than through sirv, which preview runs without its brotli option. Anything unusual
        // (a Range request, no .br, a client without br) falls through to the normal gzip path.
        const brFile = `${file}.br`;
        const type = BROTLI_TYPES[path.extname(file)];
        if (!type || !isFile(brFile)) return next();
        appendVary(res, 'Accept-Encoding');
        if (req.headers.range || !acceptsBrotli(req.headers['accept-encoding'])) return next();
        let stat: Stats;
        try {
          stat = statSync(brFile);
        } catch {
          return next();
        }
        const size = stat.size;
        const etag = `W/"br-${stat.size}-${stat.mtime.getTime()}"`;
        res.setHeader('Content-Type', type);
        res.setHeader('Content-Encoding', 'br');
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          res.statusCode = 304;
          res.end();
          return;
        }
        res.setHeader('Content-Length', size);
        res.statusCode = 200;
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(brFile)
          .on('error', () => res.destroy())
          .pipe(res);
      });
    },
  };
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** True unless the client leaves `br` out or refuses it with `q=0`. */
function acceptsBrotli(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header.join(',') : (header ?? '');
  return value.split(',').some(part => {
    const [token, ...params] = part.split(';').map(x => x.trim());
    if (token.toLowerCase() !== 'br') return false;
    const q = params.find(x => /^q=/i.test(x));
    return !q || Number(q.slice(2)) > 0;
  });
}

/** Adds to `Vary` without dropping what an earlier middleware (CORS: `Origin`) put there. */
function appendVary(res: ServerResponse, field: string): void {
  const prev = res.getHeader('Vary');
  const list = (Array.isArray(prev) ? prev.join(',') : String(prev ?? ''))
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  if (!list.some(x => x === '*' || x.toLowerCase() === field.toLowerCase())) list.push(field);
  res.setHeader('Vary', list.join(', '));
}

/**
 * Brotli copies of the text assets, written next to them at the end of `vite build`.
 *
 * WHY. Preview compresses on the fly with gzip at the default level, for every request. Brotli at
 * its highest quality is about a quarter smaller on this bundle (the planner's first load ~660 KB
 * gzip -> ~480 KB br; the Explorer's ~380 -> ~295), which on a slow phone connection is roughly a
 * second, and it is paid once per build instead of once per request. Cloudflare asks the origin for
 * `accept-encoding: br, gzip` and passes an origin brotli response through to browsers that accept
 * it (developers.cloudflare.com/speed/optimization/content/compression/), so players get these
 * bytes, not a recompression.
 *
 * Never fails the build: a file that will not compress simply has no copy, and preview then serves
 * it as before. Build-only (`apply`), so a dev server shutting down never writes into dist.
 */
const BROTLI_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const brotli = promisify(brotliCompress);

function brotliAssets(): Plugin {
  let assetsPath = '';
  return {
    name: 'aap-brotli-assets',
    apply: 'build',
    configResolved(config) {
      assetsPath = path.resolve(config.root, config.build.outDir, config.build.assetsDir);
    },
    async closeBundle() {
      let names: string[];
      try {
        names = await readdir(assetsPath);
      } catch {
        return;
      }
      await Promise.all(
        names
          .filter(name => BROTLI_TYPES[path.extname(name)])
          .map(async name => {
            const file = path.join(assetsPath, name);
            try {
              const data = await readFile(file);
              if (data.length < 1024) return;
              const compressed = await brotli(data, {
                params: {
                  [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
                  [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length,
                },
              });
              if (compressed.length < data.length) await writeFile(`${file}.br`, compressed);
            } catch (error) {
              console.warn(`[aap-brotli-assets] no brotli copy of ${name}:`, error);
            }
          })
      );
    },
  };
}

/**
 * The Chain Explorer's run list, requested while the page's JavaScript is still downloading.
 *
 * The Explorer can draw nothing until the collector's `GET /all` answers, and it used to ask only
 * once the whole bundle had arrived and mounted: on a slow phone connection that is a fresh TLS
 * handshake to another host plus the request itself, all after five seconds of script. This writes
 * two tags at the top of explorer.html, only when the build has a collector (VITE_SUBMIT_URL, read
 * from the same env as `import.meta.env`, so the URL is the one the bundle would fetch anyway):
 *
 *   - `<link rel="preconnect" crossorigin>` to its origin. `crossorigin` because the request is a
 *     CORS fetch without credentials, which cannot reuse a connection opened for a credentialed one;
 *   - a few lines that start the fetch and leave the pending response on `window.__aapEarlyAll`.
 *     explorer/collector.ts `prefetchAll` adopts it and `fetchAll` uses it once, for that same base.
 *
 * `?collector=` on the URL means someone asked for a different collector, so the script skips it,
 * exactly as `resolveCollectorBase` does. If anything here disagrees with the module (a base string
 * that does not match), the module simply fetches for itself: the worst case is one wasted request.
 */
function collectorEarlyStart(submitUrl: string | undefined): Plugin {
  // Same transformation as collector.ts `stripSubmit`, untrimmed like it, so the strings match.
  const base = submitUrl?.replace(/\/submit\/?$/, '').replace(/\/$/, '');
  const usable = base && /^https?:\/\/[^/]/i.test(base) ? base : null;
  return {
    name: 'aap-collector-early-start',
    transformIndexHtml(html, ctx) {
      if (!usable || path.basename(ctx.filename) !== 'explorer.html') return;
      const literal = JSON.stringify(usable).replace(/</g, '\\u003c');
      const tags =
        `<link rel="preconnect" href="${new URL(usable).origin}" crossorigin>\n    ` +
        `<script>(function(){try{if(new URLSearchParams(location.search).get('collector'))return;` +
        `var b=${literal},r=fetch(b+'/all');r.catch(function(){});` +
        `window.__aapEarlyAll={base:b,response:r,at:Date.now()}}catch(e){}})();</script>`;
      // Straight after the charset and viewport, which should stay the first things in <head>.
      const viewport = /<meta\s+name="viewport"[^>]*>/i;
      return viewport.test(html)
        ? html.replace(viewport, m => `${m}\n    ${tags}`)
        : html.replace('<head>', `<head>\n    ${tags}`);
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
    plugins: [
      vue(),
      vueJsx(),
      versionFile(),
      warnIfReleaseStale(),
      brotliAssets(),
      immutableAssets(),
      watcherIsolation(),
      collectorEarlyStart(env.VITE_SUBMIT_URL),
    ],
    define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
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
          // The run watcher ("Stepping away?"): a few KB, no Vue, never the simulator (src/watch/main.ts).
          watch: fileURLToPath(new URL('./watch.html', import.meta.url)),
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
