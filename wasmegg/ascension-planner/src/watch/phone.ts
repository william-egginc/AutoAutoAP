/**
 * The phone page (watch.html#<id>.<secret>): how a long run is going, from anywhere.
 *
 * NO VUE, NO PINIA, NO SIMULATOR, like the second-tab watcher: it imports search/watchLink.ts and the
 * collector's address alone. It fetches `GET /watch?id=` (collector/watch.js) and opens the sealed
 * heartbeat with the secret from the fragment, which never leaves this browser; a wrong or missing
 * secret reads as an incomplete link. It reads every minute WHILE ON SCREEN only (a hidden tab or a
 * locked phone asks nothing), and at once when it comes back into view.
 */
import { resolveCollectorBase } from '@/explorer/collector';
import {
  WATCH_REFRESH_MS,
  openHeartbeat,
  parseWatchFragment,
  watchView,
  type WatchHeartbeat,
  type WatchStatus,
} from '@/search/watchLink';

const $ = (id: string) => document.getElementById(id)!;

function show(title: string, tone: string, note = ''): void {
  $('p-title').textContent = title;
  $('p-title').className = tone;
  $('p-progress').textContent = note;
  $('p-left').textContent = '';
  $('p-label').textContent = '';
  $('p-bar-wrap').hidden = true;
  $('p-best-card').hidden = true;
  $('p-stale').hidden = true;
  $('p-updated').textContent = '';
  $('p-meta').textContent = '';
  $('p-info').hidden = true;
  document.title = `${title} - Ascension Planner run`;
}

const INCOMPLETE = 'This link is incomplete';
const INCOMPLETE_NOTE = 'Copy the whole link from the planner again, or scan its QR code.';

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
  $('p-best-heading').textContent = v.bestHeading;
  $('p-best').textContent = v.best;
  $('p-route').textContent = v.route;
  $('p-stale').hidden = !v.stale;
  $('p-stale').textContent = v.stale;
  $('p-info').hidden = false;
  $('p-updated').textContent = v.updated;
  $('p-meta').textContent = v.meta;
  document.title = `${v.title}${v.percent !== null && v.title === 'Running' ? ` ${Math.floor(v.percent)}%` : ''} - Ascension Planner run`;
}

let base: string | null = null;
let link: { id: string; secret: string } | null = null;
let busy = false;

async function load(): Promise<void> {
  if (busy || !base || !link) return;
  busy = true;
  try {
    const res = await fetch(`${base}/watch?id=${encodeURIComponent(link.id)}`, { cache: 'no-store' });
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
    const body = (await res.json()) as {
      iv?: string;
      ct?: string;
      status?: WatchStatus;
      updated?: number;
      now?: number;
    };
    if (typeof body?.iv !== 'string' || typeof body.ct !== 'string' || typeof body.updated !== 'number')
      throw new Error('bad reply');
    const data = await openHeartbeat(link.secret, body.iv, body.ct);
    if (!data) {
      // The id is right but the secret isn't: a link cut short or mistyped.
      last = null;
      show(INCOMPLETE, 'bad', INCOMPLETE_NOTE);
      return;
    }
    // The plain status is the latest word (a page closing sends only that).
    if (body.status) data.status = body.status;
    const skew = typeof body.now === 'number' ? body.now - Date.now() : 0;
    last = { data, updated: body.updated, skew };
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

// ------------------------------------------------------------------ only while on screen

let poll: ReturnType<typeof setInterval> | null = null;
let tick: ReturnType<typeof setInterval> | null = null;

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/** Reads now and every minute while the page is on screen; stops when it is hidden. */
function syncPolling(): void {
  if (visible()) {
    if (!poll) {
      void load();
      poll = setInterval(() => void load(), WATCH_REFRESH_MS);
      // Between reads, keep "Last update 2 min ago" honest.
      tick = setInterval(draw, 15_000);
    }
  } else {
    if (poll) clearInterval(poll);
    if (tick) clearInterval(tick);
    poll = tick = null;
  }
}

function start(): void {
  if (poll) clearInterval(poll);
  if (tick) clearInterval(tick);
  poll = tick = null;
  last = null;
  link = parseWatchFragment(location.hash);
  if (!link) {
    show(INCOMPLETE, 'bad', INCOMPLETE_NOTE);
    return;
  }
  base = resolveCollectorBase(location.search);
  if (!base) {
    show('No server to ask', 'bad', "This copy of the planner has no collector, so there's nothing to watch through.");
    return;
  }
  show('Loading...', 'done');
  syncPolling();
}

export function startPhone(): void {
  document.title = 'Ascension Planner run';
  $('p-refresh').addEventListener('click', () => void load());
  document.addEventListener('visibilitychange', () => link && base && syncPolling());
  // Another link pasted over this one.
  window.addEventListener('hashchange', start);
  start();
}
