/**
 * "Watch this run from your phone" at run time (rules in search/watchLink.ts, box in
 * StepAwayOptions.vue, page in watch.html / src/watch/phone.ts, collector in collector/watch.js).
 *
 * Module-level, like useStepAway.ts: the link belongs to the page's run, not to whichever panel is on
 * screen. The chain-search store drives it (`watchLinkRunStarted`, `watchLinkTick` on every black-box
 * beat, `watchLinkRunEnded`) and keeps `currentWatchLink()` in the run's checkpoint, so a carry-on
 * after a crash or a reload hands the same key back (`watchLinkRunStarted(kind, carried)`).
 *
 * FIRE AND FORGET. Every post is a single `fetch` that nothing awaits; a failure is noted for the box
 * and otherwise ignored. The search never waits on any of it.
 */
import { ref, watch } from 'vue';
import * as wl from '@/search/watchLink';
import { consentAgreed, consentDeclined, consentState } from './useConsent';

/** The phone options. Off unless the player ticks them. The tick itself is the account's `watchPhone`
 *  consent (composables/useConsent.ts, remembered per account) and follows it here; the label and the
 *  ntfy choices stay settings of this browser. */
export const watchOptions = ref<wl.WatchLinkOptions>(wl.readWatchOptions());
watch(
  () => [consentAgreed('watchPhone'), consentState.account, consentState.loaded] as const,
  ([phone]) => {
    if (watchOptions.value.phone !== phone) watchOptions.value.phone = phone;
  },
  { flush: 'sync' }
);

export interface ActiveWatch {
  link: wl.WatchLinkState;
  kind: wl.WatchRunKind;
  /** The watch page's address for this run. */
  url: string;
  status: wl.WatchStatus;
  /** The last heartbeat tried / that the collector took, ms. */
  lastTryAt: number | null;
  lastOkAt: number | null;
  /** Why the last one didn't go, '' when it did. */
  lastError: string;
  /** The last ntfy progress note, ms. */
  lastNtfyAt: number | null;
  /** The run's progress as last seen while it ran. The store clears its own the moment the run ends,
   *  so the last word (finished, stopped, failed) is built from this, not from nothing. */
  last: wl.ProgressLike | null;
  /** When the run ended, ms; null while it runs. */
  endedAt: number | null;
}

/** The current (or last) run's link, for the box. Null when this page has none. */
export const activeWatch = ref<ActiveWatch | null>(null);

export interface WatchDeps {
  /** The collector's base URL ('' or null: none, so nothing to watch through). */
  collector: () => string | null;
  /** The collector the build was made with, so the link names another only when it differs. */
  buildCollector?: () => string | null;
  progress: () => wl.ProgressLike | null;
  workers: () => number;
  /** By a date's date, unix seconds; null otherwise. */
  deadline: () => number | null;
  /** The kind of run going on this page right now, null when none. */
  running: () => wl.WatchRunKind | null;
  fetch?: typeof fetch;
  now?: () => number;
  random?: (a: Uint8Array) => Uint8Array;
  origin?: () => string;
  base?: () => string;
}

let deps: WatchDeps | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const now = () => (deps?.now ?? Date.now)();
const doFetch: typeof fetch = (...a) => (deps?.fetch ?? fetch)(...a);

/** Called once by the chain-search store. */
export function installWatchLink(d: WatchDeps): void {
  deps = d;
}

/** For tests: forget everything. */
export function resetWatchLink(): void {
  activeWatch.value = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Whether this build can offer the phone link at all (it needs a collector). */
export function watchLinkAvailable(): boolean {
  return !!deps?.collector();
}

/** What the run's checkpoint keeps; null when this run has no link. Kept after the run stops too:
 *  its last checkpoint carries it, so Carry on later picks the same link back up. */
export function currentWatchLink(): wl.WatchLinkState | null {
  const a = activeWatch.value;
  return a ? { ...a.link } : null;
}

function pageUrl(link: { id: string; secret: string }): string {
  const base = deps?.collector() ?? null;
  const built = deps?.buildCollector?.() ?? null;
  return wl.watchPageUrl({
    origin: deps?.origin?.() ?? (typeof location !== 'undefined' ? location.origin : ''),
    base: deps?.base?.() ?? (import.meta.env.BASE_URL || '/'),
    id: link.id,
    secret: link.secret,
    collector: base && base !== built ? base : null,
  });
}

/** Options as they apply to a link: the topic only when notifications are on. */
function linkFromOptions(from: { id: string; secret: string }, startedAt: number): wl.WatchLinkState {
  const o = watchOptions.value;
  const label = wl.cleanLabel(o.label);
  return {
    id: from.id,
    secret: from.secret,
    startedAt,
    ...(o.ntfy && wl.isNtfyTopic(o.ntfyTopic) ? { topic: o.ntfyTopic } : {}),
    ...(label ? { label } : {}),
  };
}

function heartbeat(a: ActiveWatch): wl.WatchHeartbeat {
  return wl.buildHeartbeat({
    link: a.link,
    status: a.status,
    kind: a.kind,
    progress: deps?.progress() ?? a.last,
    endedAt: a.endedAt,
    workers: deps?.workers() ?? 0,
    deadline: deps?.deadline() ?? null,
    now: now(),
  });
}

/**
 * One heartbeat to the collector, sealed (search/watchLink.ts `sealHeartbeat`): the body is
 * `{ id, iv, ct, status }`, and only the status can be read by anyone but the link's holder. Never
 * awaited by the run. `retry`: a 429 is tried once more, when the collector says, so a run's last word
 * (finished, stopped) is not lost to the rate limit. `statusOnly`: just the plain status, sent at once
 * with no encryption to wait for (the page is closing, and may be gone before WebCrypto answers).
 */
function post(a: ActiveWatch, retry = false, statusOnly = false): void {
  const base = deps?.collector();
  if (!base) return;
  const at = now();
  a.lastTryAt = at;
  const plain = { id: a.link.id, status: a.status, ...(a.link.topic ? { notify: a.link.topic } : {}) };
  const send = (body: string) =>
    // No content-type header: a text/plain POST needs no CORS preflight. `keepalive` lets the last
    // one out as the page closes.
    doFetch(`${base}/watch`, { method: 'POST', body, keepalive: true });
  let p: Promise<Response>;
  try {
    p = statusOnly
      ? send(JSON.stringify(plain))
      : wl
          .sealHeartbeat(a.link.secret, heartbeat(a), deps?.random)
          .then(sealed => send(JSON.stringify({ ...plain, ...sealed })));
  } catch (e) {
    a.lastError = e instanceof Error ? e.message : String(e);
    return;
  }
  void p.then(
    res => {
      if (activeWatch.value?.link.id !== a.link.id) return;
      if (res.ok) {
        activeWatch.value = { ...activeWatch.value, lastOkAt: at, lastError: '' };
        return;
      }
      activeWatch.value = { ...activeWatch.value, lastError: `the collector said ${res.status}` };
      if (res.status === 429 && retry) {
        const wait = Math.min(120, Math.max(1, Number(res.headers.get('retry-after')) || 60));
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          const cur = activeWatch.value;
          if (cur && cur.link.id === a.link.id) post(cur);
        }, wait * 1000);
      }
    },
    e => {
      if (activeWatch.value?.link.id === a.link.id)
        activeWatch.value = { ...activeWatch.value, lastError: e instanceof Error ? e.message : String(e) };
    }
  );
}

/** One note to the player's ntfy topic. Fire and forget. */
function notify(a: ActiveWatch, message: string, tags: string[] = []): void {
  if (!message || !a.link.topic) return;
  try {
    void doFetch(wl.NTFY_BASE, {
      method: 'POST',
      // No link in the note: the watch link carries its secret, and the topic is readable by anyone
      // who knows it.
      body: wl.ntfyBody({ topic: a.link.topic, message, tags }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignored
  }
}

/** Start (or take back) a link for the run going now. */
function begin(kind: wl.WatchRunKind, carried: wl.WatchLinkState | null, keepCurrent: boolean): void {
  const t = now();
  const prev = activeWatch.value;
  let link: wl.WatchLinkState;
  if (carried) {
    // The carried-on run's own link, with today's choices for the topic and label.
    link = { ...linkFromOptions(carried, carried.startedAt) };
    if (!watchOptions.value.ntfy && carried.topic) delete link.topic;
  } else if (keepCurrent && prev && prev.kind === kind) link = linkFromOptions(prev.link, prev.link.startedAt);
  else link = linkFromOptions({ id: wl.newWatchId(deps?.random), secret: wl.newWatchSecret(deps?.random) }, t);
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const a: ActiveWatch = {
    link,
    kind,
    url: pageUrl(link),
    status: 'running',
    lastTryAt: null,
    lastOkAt: null,
    lastError: '',
    last: null,
    endedAt: null,
    lastNtfyAt: carried || (keepCurrent && prev?.link.id === link.id) ? (prev?.lastNtfyAt ?? null) : null,
  };
  activeWatch.value = a;
  post(a);
}

/**
 * A run started on this page. `carried`: the link kept in the checkpoint it carries on from.
 * `keepCurrent`: a later chain of a Full sweep queue, which keeps the queue's link.
 */
export function watchLinkRunStarted(
  kind: wl.WatchRunKind,
  carried: wl.WatchLinkState | null = null,
  keepCurrent = false
): void {
  if (!deps || !deps.collector()) return;
  // A carried-on run keeps posting to the link the player already has, even if the box is not ticked
  // now: that link is what their phone is looking at. Otherwise only when ticked. Not once the player
  // withdrew it (an explicit no on record for the account): withdrawn means no more posts.
  if (!watchOptions.value.phone && (!carried || consentDeclined('watchPhone'))) {
    activeWatch.value = null;
    return;
  }
  begin(kind, carried, keepCurrent);
}

/** The store's progress whenever it changes (null when the run has ended): kept for the last word. */
export function watchLinkNoteProgress(p: wl.ProgressLike | null): void {
  const a = activeWatch.value;
  if (!p || !a || a.status !== 'running') return;
  a.last = { ...p, best: p.best ? { ...p.best, chain: [...p.best.chain] } : null };
}

/** Every black-box beat while the run goes: posts when one is due, and the ntfy progress note. */
export function watchLinkTick(): void {
  const a = activeWatch.value;
  if (!a || a.status !== 'running' || !deps) return;
  const t = now();
  watchLinkNoteProgress(deps.progress());
  if (wl.heartbeatDue({ event: 'tick', now: t, lastTryAt: a.lastTryAt })) post(a);
  const o = watchOptions.value;
  if (
    a.link.topic &&
    o.ntfy &&
    wl.ntfyProgressDue({ now: t, everyMin: o.ntfyEveryMin, lastAt: a.lastNtfyAt, startedAt: a.link.startedAt })
  ) {
    activeWatch.value = { ...a, lastNtfyAt: t };
    notify(a, wl.ntfyMessage(heartbeat(a), 'progress', o.ntfyDetails));
  }
}

/** The run on this page ended. Posts the last word, and notifies on a finish or a failure. */
export function watchLinkRunEnded(how: 'finished' | 'stopped' | 'failed'): void {
  const a = activeWatch.value;
  if (!a || a.status !== 'running') return;
  watchLinkNoteProgress(deps?.progress() ?? null);
  const ended: ActiveWatch = { ...a, status: how, endedAt: now() };
  activeWatch.value = ended;
  post(ended, true);
  if (how !== 'stopped')
    notify(
      ended,
      wl.ntfyMessage(heartbeat(ended), 'end', watchOptions.value.ntfyDetails),
      how === 'failed' ? ['warning'] : ['tada']
    );
}

/** `pagehide`: closed or reloaded on purpose. The phone says stopped rather than warn of a crash. */
export function watchLinkPageClosing(): void {
  const a = activeWatch.value;
  if (!a || a.status !== 'running') return;
  const ended: ActiveWatch = { ...a, status: 'stopped', endedAt: now() };
  activeWatch.value = ended;
  // Plain status only: sent at once, before the page goes (sealing would have to wait on WebCrypto).
  post(ended, false, true);
}

// Ticked during a run: a link from now. Unticked: one last post saying it stopped (so the phone and
// the collector's 15-minute check don't take the silence for a crash), then no more.
watch(
  () => watchOptions.value.phone,
  on => {
    const kind = deps?.running() ?? null;
    const a = activeWatch.value;
    if (on && kind && (!a || a.status !== 'running')) begin(kind, null, false);
    else if (!on && a && a.status === 'running') {
      const ended: ActiveWatch = { ...a, status: 'stopped', endedAt: now() };
      activeWatch.value = ended;
      post(ended, true);
    }
  }
);
// The options are remembered; a change to the topic or label applies to the run going now.
watch(
  watchOptions,
  o => {
    // The tick is kept per account (useConsent.ts), not in this browser's options.
    wl.writeWatchOptions({ ...o, phone: false });
    const a = activeWatch.value;
    if (a && a.status === 'running') {
      const link = linkFromOptions(a.link, a.link.startedAt);
      if (JSON.stringify(link) !== JSON.stringify(a.link)) activeWatch.value = { ...a, link };
    }
  },
  { deep: true }
);
