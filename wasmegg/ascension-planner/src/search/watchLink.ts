/**
 * "Watch this run from your phone" ("Stepping away?" box, StepAwayOptions.vue): the rules.
 *
 * A long run (Fastest, By a date, a Full sweep) can be given a WATCH KEY: a random, unguessable id
 * (144 bits, base64url). While the run goes, its tab posts a tiny heartbeat under that key to the
 * collector (`POST /watch`, collector/watch.js) every 5 minutes, and at once when it starts, ends, is
 * stopped or fails. The watch page (watch.html?k=<key>, src/watch/phone.ts) reads it back
 * (`GET /watch?key=`) on a phone. The key lives in the run's checkpoint, so a carry-on after a crash
 * or a reload keeps the same link.
 *
 * WHAT A HEARTBEAT HOLDS, AND NOTHING ELSE: status, mode, done/total, time left, the best so far
 * (TE, route, finish date or spare days), when the run started and this beat was made, the worker
 * count, and a label only if the player typed one. No save, no player id, no nickname.
 *
 * Optional phone notifications go through ntfy (https://ntfy.sh): the tab posts to the player's
 * topic when the run finishes or fails, and every 1-6 hours with its progress; the collector's cron
 * posts once when a running run stops reporting for 15 minutes.
 *
 * Everything here is pure (or a plain localStorage read/write), so the watch page can use it without
 * the planner's stores, and the rules can be tested.
 */

/** A heartbeat this often while the run goes (and at once on start, end, stop, failure). */
export const WATCH_EVERY_MS = 5 * 60_000;
/** A running run with no report for this long has probably stopped (crashed, or the computer slept). */
export const WATCH_STALE_MS = 15 * 60_000;
/** The watch page reads again this often. */
export const WATCH_REFRESH_MS = 60_000;
/** The collector keeps one write a minute per key (a status change is let through sooner). */
export const WATCH_MIN_GAP_MS = 60_000;
/** Longest label the player can type. */
export const WATCH_LABEL_MAX = 40;
/** The ntfy server notifications go through. */
export const NTFY_BASE = 'https://ntfy.sh';

export type WatchStatus = 'running' | 'finished' | 'stopped' | 'failed';
export type WatchMode = 'fastest' | 'full-sweep' | 'by-date';
export type WatchRunKind = 'smart' | 'sweep' | 'deadline';

/** What the run's checkpoint keeps, so a carry-on keeps posting under the same link. */
export interface WatchLinkState {
  key: string;
  /** When the run first started, ms (a carry-on keeps it). */
  startedAt: number;
  /** The ntfy topic, when the player opted in to notifications. */
  topic?: string;
  label?: string;
}

/** One heartbeat, as posted to the collector and read back by the watch page. */
export interface WatchHeartbeat {
  key: string;
  status: WatchStatus;
  mode: WatchMode;
  done: number;
  total: number | null;
  /** The bar's fill when the run works out its own (By a date), 0-100; otherwise done over total. */
  pct?: number | null;
  timeLeftSec: number | null;
  bestSoFar: {
    te: number;
    route: number[];
    /** When the best route reaches its TE, unix seconds. */
    finish: number | null;
    /** By a date: days to spare before the date. */
    spareDays?: number | null;
  } | null;
  startedAt: number;
  updatedAt: number;
  workers: number;
  label?: string;
}

// ------------------------------------------------------------------ keys and topics

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Bytes as base64url, no padding. */
export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (left > 1) out += B64URL[(n >> 6) & 63];
    if (left > 2) out += B64URL[n & 63];
  }
  return out;
}

type RandomFill = (a: Uint8Array) => Uint8Array;
const cryptoFill: RandomFill = a => {
  crypto.getRandomValues(a as Uint8Array<ArrayBuffer>);
  return a;
};

/** A fresh watch key: 18 random bytes (144 bits), 24 characters of base64url. */
export function newWatchKey(fill: RandomFill = cryptoFill): string {
  return base64url(fill(new Uint8Array(18)));
}

/** What the collector accepts as a key: base64url, 22 to 64 characters (at least 128 bits). */
export function isWatchKey(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(s);
}

/** A fresh ntfy topic: `aaap-` and 12 random bytes. Anyone who knows a topic can read it, so it is
 *  as unguessable as it is short. */
export function newNtfyTopic(fill: RandomFill = cryptoFill): string {
  return `aaap-${base64url(fill(new Uint8Array(12)))}`;
}

/** ntfy's own rule for a topic name. */
export function isNtfyTopic(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
}

/** A label as stored: trimmed, single-line, at most WATCH_LABEL_MAX characters. */
export function cleanLabel(s: unknown): string {
  return typeof s === 'string'
    ? s
        // eslint-disable-next-line no-control-regex -- control characters are exactly what goes
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .trim()
        .slice(0, WATCH_LABEL_MAX)
    : '';
}

/** A checkpoint's `watch` field, checked; null when there is none or it is not one. */
export function readWatchLinkState(v: unknown): WatchLinkState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<WatchLinkState>;
  if (!isWatchKey(o.key) || typeof o.startedAt !== 'number' || !Number.isFinite(o.startedAt)) return null;
  const label = cleanLabel(o.label);
  return {
    key: o.key,
    startedAt: o.startedAt,
    ...(isNtfyTopic(o.topic) ? { topic: o.topic } : {}),
    ...(label ? { label } : {}),
  };
}

// ------------------------------------------------------------------ options (per browser)

export interface WatchLinkOptions {
  /** Post heartbeats for the phone. */
  phone: boolean;
  /** Notify the phone through ntfy as well. */
  ntfy: boolean;
  ntfyTopic: string;
  /** Minutes between ntfy progress notes; 0 for none. */
  ntfyEveryMin: number;
  label: string;
}

export const WATCH_OPTIONS_KEY = 'aap.watchLink.options';
export const NTFY_EVERY_MIN = [0, 60, 120, 180, 240, 300, 360] as const;

export const DEFAULT_WATCH_OPTIONS: WatchLinkOptions = {
  phone: false,
  ntfy: false,
  ntfyTopic: '',
  ntfyEveryMin: 180,
  label: '',
};

type KV = Pick<Storage, 'getItem' | 'setItem'>;
function store(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readWatchOptions(s: KV | null = store()): WatchLinkOptions {
  try {
    const raw = JSON.parse(s?.getItem(WATCH_OPTIONS_KEY) || 'null') as Partial<WatchLinkOptions> | null;
    if (raw && typeof raw === 'object')
      return {
        phone: raw.phone === true,
        ntfy: raw.ntfy === true,
        ntfyTopic: isNtfyTopic(raw.ntfyTopic) ? raw.ntfyTopic : '',
        ntfyEveryMin: (NTFY_EVERY_MIN as readonly unknown[]).includes(raw.ntfyEveryMin)
          ? (raw.ntfyEveryMin as number)
          : DEFAULT_WATCH_OPTIONS.ntfyEveryMin,
        label: cleanLabel(raw.label),
      };
  } catch {
    // unreadable: all off
  }
  return { ...DEFAULT_WATCH_OPTIONS };
}

export function writeWatchOptions(o: WatchLinkOptions, s: KV | null = store()): void {
  try {
    s?.setItem(WATCH_OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // just not remembered
  }
}

// ------------------------------------------------------------------ the heartbeat

export function watchMode(kind: WatchRunKind): WatchMode {
  return kind === 'deadline' ? 'by-date' : kind === 'sweep' ? 'full-sweep' : 'fastest';
}

export const MODE_LABEL: Record<WatchMode, string> = {
  fastest: 'Fastest',
  'full-sweep': 'Full sweep',
  'by-date': 'By a date',
};

/** The run's progress as the store reads it (stores/chainSearch.ts `RunProgress`, the part used). */
export interface ProgressLike {
  done: number;
  total: number | null;
  percent?: number | null;
  secondsLeft: number | null;
  best: { chain: number[]; te: number; at: number } | null;
}

const whole = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/** One heartbeat from what the run knows now. `deadline` (unix seconds) is By a date's date. */
export function buildHeartbeat(a: {
  link: WatchLinkState;
  status: WatchStatus;
  kind: WatchRunKind;
  progress: ProgressLike | null;
  workers: number;
  deadline?: number | null;
  now: number;
}): WatchHeartbeat {
  const p = a.progress;
  const best = p?.best ?? null;
  const pct =
    typeof p?.percent === 'number' && Number.isFinite(p.percent) ? Math.max(0, Math.min(100, p.percent)) : null;
  return {
    key: a.link.key,
    status: a.status,
    mode: watchMode(a.kind),
    done: whole(p?.done),
    total: p?.total ? whole(p.total) : null,
    ...(pct !== null ? { pct: Math.round(pct * 10) / 10 } : {}),
    timeLeftSec: p && p.secondsLeft !== null && Number.isFinite(p.secondsLeft) ? whole(p.secondsLeft) : null,
    bestSoFar: best
      ? {
          te: whole(best.te),
          route: best.chain.slice(0, 40).map(whole),
          finish: Number.isFinite(best.at) && best.at > 0 ? Math.round(best.at) : null,
          ...(a.kind === 'deadline' && a.deadline && Number.isFinite(best.at)
            ? { spareDays: Math.round(((a.deadline - best.at) / 86400) * 10) / 10 }
            : {}),
        }
      : null,
    startedAt: a.link.startedAt,
    updatedAt: a.now,
    workers: whole(a.workers),
    ...(a.link.label ? { label: a.link.label } : {}),
  };
}

/**
 * Whether to post a heartbeat now. A start or an end always posts; a tick posts once WATCH_EVERY_MS
 * has passed since the last post (or the last try, so a collector that is down is not hammered).
 */
export function heartbeatDue(a: { event: 'start' | 'tick' | 'end'; now: number; lastTryAt: number | null }): boolean {
  if (a.event !== 'tick') return true;
  return a.lastTryAt === null || a.now - a.lastTryAt >= WATCH_EVERY_MS;
}

/** The watch page's address for a key. `collector` is added only when it is not the build's own. */
export function watchPageUrl(a: { origin: string; base: string; key: string; collector?: string | null }): string {
  const base = a.base.endsWith('/') ? a.base : `${a.base}/`;
  const q = new URLSearchParams({ k: a.key });
  if (a.collector) q.set('collector', a.collector);
  return `${a.origin}${base}watch.html?${q.toString()}`;
}

// ------------------------------------------------------------------ words

/** "Jul 13" (in this device's time zone), from unix seconds. */
export function shortDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "3 h 20 min", "12 min", "under a minute". */
export function durationWords(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h >= 48) return `${Math.round(h / 24)} days`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "2 min ago", "just now", "3 h ago". */
export function agoWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** Done as a share of the run, 0-100, or null when the run has no estimate. */
export function watchPercent(h: Pick<WatchHeartbeat, 'pct' | 'done' | 'total' | 'status'>): number | null {
  if (h.status === 'finished') return 100;
  if (typeof h.pct === 'number') return Math.max(0, Math.min(100, h.pct));
  if (!h.total) return null;
  return Math.max(0, Math.min(100, (h.done / h.total) * 100));
}

/** "247 TE, finishes Jul 13" (Fastest) or "247 TE by Jul 13, 3 days spare" (By a date). */
export function bestWords(h: Pick<WatchHeartbeat, 'bestSoFar' | 'mode'>): string {
  const b = h.bestSoFar;
  if (!b) return '';
  const when = b.finish ? shortDay(b.finish) : '';
  if (h.mode === 'by-date') {
    const spare =
      typeof b.spareDays === 'number'
        ? `, ${Math.abs(b.spareDays) < 0.05 ? 'no' : b.spareDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} day${b.spareDays === 1 ? '' : 's'} spare`
        : '';
    return `${b.te} TE${when ? ` by ${when}` : ''}${spare}`;
  }
  return `${b.te} TE${when ? `, finishes ${when}` : ''}`;
}

/** The ntfy note for a moment in the run; '' when there is none to send. Plain, no personal data. */
export function ntfyMessage(h: WatchHeartbeat, event: 'progress' | 'end'): string {
  const best = bestWords(h);
  const pct = watchPercent(h);
  if (event === 'end') {
    if (h.status === 'finished') return best ? `Run finished: ${best}.` : 'Run finished.';
    if (h.status === 'failed')
      return `Run stopped with an error${pct !== null ? ` at ${Math.floor(pct)}%` : ''}.${best ? ` Best so far: ${best}.` : ''}`;
    return '';
  }
  const parts = [
    `Run ${pct !== null ? `${Math.floor(pct)}% done` : 'going'}`,
    h.timeLeftSec ? `, about ${durationWords(h.timeLeftSec)} left` : '',
    '.',
    best ? ` Best so far: ${best}.` : '',
  ];
  return parts.join('');
}

/** ntfy's JSON publish body (posted to NTFY_BASE itself, which needs no CORS preflight). */
export function ntfyBody(a: { topic: string; message: string; click?: string; tags?: string[] }): string {
  return JSON.stringify({
    topic: a.topic,
    title: 'Ascension Planner',
    message: a.message,
    ...(a.click ? { click: a.click } : {}),
    ...(a.tags?.length ? { tags: a.tags } : {}),
  });
}

/** Whether a progress note is due: every `everyMin` minutes from the run's start or the last note. */
export function ntfyProgressDue(a: {
  now: number;
  everyMin: number;
  lastAt: number | null;
  startedAt: number;
}): boolean {
  if (!a.everyMin) return false;
  return a.now - (a.lastAt ?? a.startedAt) >= a.everyMin * 60_000;
}

// ------------------------------------------------------------------ the watch page

export interface WatchView {
  title: string;
  tone: 'ok' | 'warn' | 'done' | 'bad';
  percent: number | null;
  /** "1,234 of 5,000 chains" style line, or ''. */
  progress: string;
  timeLeft: string;
  best: string;
  route: string;
  updated: string;
  /** The "hasn't reported" warning, or ''. */
  stale: string;
  meta: string;
}

/**
 * What the watch page shows for a heartbeat. `updatedAt` is when the collector stored it (ms), so a
 * wrong clock on the computer running the search can't make a live run look stale.
 */
export function watchView(h: WatchHeartbeat, updatedAt: number, now: number): WatchView {
  const age = Math.max(0, now - updatedAt);
  const stale = h.status === 'running' && age > WATCH_STALE_MS;
  const percent = watchPercent(h);
  const title =
    h.status === 'finished'
      ? 'Finished'
      : h.status === 'stopped'
        ? 'Stopped'
        : h.status === 'failed'
          ? 'Stopped with an error'
          : stale
            ? 'Not reporting'
            : 'Running';
  const tone: WatchView['tone'] =
    h.status === 'running' ? (stale ? 'warn' : 'ok') : h.status === 'failed' ? 'bad' : 'done';
  const unit = h.mode === 'by-date' ? 'routes' : 'chains';
  const progress = h.total
    ? `${h.done.toLocaleString('en-US')} of ${h.total.toLocaleString('en-US')} ${unit}`
    : h.done
      ? `${h.done.toLocaleString('en-US')} ${unit}`
      : '';
  const timeLeft = h.status === 'running' && h.timeLeftSec !== null ? `About ${durationWords(h.timeLeftSec)} left` : '';
  const b = h.bestSoFar;
  return {
    title,
    tone,
    percent,
    progress,
    timeLeft,
    best: b ? bestWords(h) : 'Nothing found yet.',
    route: b && b.route.length ? b.route.join(' → ') : '',
    updated: `Last update ${agoWords(age)}`,
    stale: stale
      ? "This run hasn't reported in 15+ min — the tab may have crashed or the computer may be asleep."
      : h.status === 'failed'
        ? 'If carrying on by itself is ticked, it should start again on its own.'
        : '',
    meta: [
      MODE_LABEL[h.mode],
      h.workers ? `${h.workers} worker${h.workers === 1 ? '' : 's'}` : '',
      `started ${agoWords(now - h.startedAt)}`,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
