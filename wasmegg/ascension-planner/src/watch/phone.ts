/**
 * The phone page (watch.html?k=<watch key>): how a long run is going, from anywhere.
 *
 * NO VUE, NO PINIA, NO SIMULATOR, like the second-tab watcher: it imports search/watchLink.ts and the
 * collector's address alone. It reads `GET /watch?key=` (collector/watch.js) every minute and when
 * the page comes back into view (a phone wakes a Home Screen app that way), and says what it found:
 * status, progress, time left, the best so far, when it last heard, and a plain warning when a
 * running run hasn't reported for 15 minutes.
 */
import { resolveCollectorBase } from '@/explorer/collector';
import { WATCH_REFRESH_MS, isWatchKey, watchView, type WatchHeartbeat } from '@/search/watchLink';

const $ = (id: string) => document.getElementById(id)!;

function show(title: string, tone: string, note = ''): void {
  $('p-title').textContent = title;
  $('p-title').className = tone;
  $('p-progress').textContent = note;
  $('p-left').textContent = '';
  $('p-bar-wrap').hidden = true;
  $('p-best-card').hidden = true;
  $('p-stale').hidden = true;
  document.title = `${title} - Ascension Planner run`;
}

let last: { data: WatchHeartbeat; updated: number; skew: number } | null = null;

/** Draw the last reading again (the "2 min ago" moves even when nothing new came). */
function draw(): void {
  if (!last) return;
  // The collector's clock, as near as this phone can tell: `updated` is the collector's.
  const now = Date.now() + last.skew;
  const v = watchView(last.data, last.updated, now);
  $('p-title').textContent = v.title;
  $('p-title').className = v.tone;
  $('p-label').textContent = last.data.label ?? '';
  $('p-bar-wrap').hidden = v.percent === null;
  ($('p-bar') as HTMLElement).style.width = `${v.percent ?? 0}%`;
  $('p-progress').textContent = [v.percent !== null ? `${Math.floor(v.percent)}%` : '', v.progress]
    .filter(Boolean)
    .join(' · ');
  $('p-left').textContent = v.timeLeft;
  $('p-best-card').hidden = false;
  $('p-best').textContent = v.best;
  $('p-route').textContent = v.route;
  $('p-stale').hidden = !v.stale;
  $('p-stale').textContent = v.stale;
  $('p-updated').textContent = v.updated;
  $('p-meta').textContent = v.meta;
  document.title = `${v.title}${v.percent !== null && v.title === 'Running' ? ` ${Math.floor(v.percent)}%` : ''} - Ascension Planner run`;
}

let base: string | null = null;
let key = '';
let busy = false;

async function load(): Promise<void> {
  if (busy || !base) return;
  busy = true;
  try {
    const res = await fetch(`${base}/watch?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (res.status === 404) {
      last = null;
      show(
        'Nothing yet',
        'done',
        "This run hasn't reported yet. It does within a few minutes of starting. A run is forgotten 7 days after its last report."
      );
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { data: WatchHeartbeat; updated: number; now?: number };
    if (!body?.data || typeof body.updated !== 'number') throw new Error('bad reply');
    const skew = typeof body.now === 'number' ? body.now - Date.now() : 0;
    last = { data: body.data, updated: body.updated, skew };
    draw();
  } catch {
    // Keep showing the last reading; say the check failed.
    if (last) {
      draw();
      $('p-updated').textContent += " (couldn't check just now)";
    } else show("Couldn't reach the server", 'warn', 'It tries again every minute.');
  } finally {
    busy = false;
  }
}

export function startPhone(k: string): void {
  key = k;
  document.title = 'Ascension Planner run';
  if (!isWatchKey(k)) {
    show('This link is incomplete', 'bad', 'Copy the whole link from the planner again.');
    return;
  }
  base = resolveCollectorBase(location.search);
  if (!base) {
    show('No server to ask', 'bad', "This copy of the planner has no collector, so there's nothing to watch through.");
    return;
  }
  $('p-refresh').addEventListener('click', () => void load());
  void load();
  setInterval(() => void load(), WATCH_REFRESH_MS);
  // Between reads, keep "Last update 2 min ago" honest.
  setInterval(draw, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void load();
  });
  window.addEventListener('pageshow', () => void load());
}
