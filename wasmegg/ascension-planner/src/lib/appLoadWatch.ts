/**
 * THE PLANNER THAT NEVER LOADS (spec-stuck2, 7 Nov 2026, QA t99: with the planner's script requests hung, the page sat
 * on "Loading the planner…" for 8 minutes with no word). index.html's loading line stays until the app mounts and
 * replaces it, and nothing in the app can speak while its own scripts are the thing not loading. So index.html carries
 * a few lines of its own (put in by vite.config.ts `appLoadWatch`, hashed into the Content-Security-Policy like every
 * inline script): if the line is still there after `APP_LOAD_SLOW_MS`, it says the planner is taking too long, with a
 * reload hint (lib/appLoadWords.ts). An app that mounts later still replaces it.
 *
 * 45 s: the planner's first load is about 3.9 MB of scripts and styles (about 1 MB as the brotli copies served), which a
 * slow 3G phone link (about 400 kbit/s) brings in about 20 s; 45 s is over twice that, and a wait no player sits through
 * without wondering.
 *
 * Node and build only (vite.config.ts and the spec): never imported by the page.
 */
import { APP_LOAD_SLOW } from './appLoadWords';

export const APP_LOAD_SLOW_MS = 45_000;

/** The inline script's body: plain old JavaScript (it runs before, and without, the app's own scripts). */
export function appLoadWatchScript(text: string = APP_LOAD_SLOW, ms: number = APP_LOAD_SLOW_MS): string {
  const words = JSON.stringify(text).replace(/</g, '\\u003c');
  return (
    `(function(){setTimeout(function(){try{var el=document.querySelector('#app .app-loading');if(!el)return;` +
    `el.className='app-load-slow';el.setAttribute('role','alert');` +
    `el.style.cssText='padding:1rem;margin:0 auto;max-width:32rem;text-align:center;color:#92400e';` +
    `el.textContent=${words}}catch(e){}},${ms})})();`
  );
}

/** index.html with the watch put in straight after the app's element (another page, without the loading line, as is). */
export function withAppLoadWatch(html: string): string {
  const app = /<div id="app"[^>]*>\s*<div class="app-loading[^>]*>[^<]*<\/div>\s*<\/div>/;
  return app.test(html) ? html.replace(app, m => `${m}\n    <script>${appLoadWatchScript()}</script>`) : html;
}
