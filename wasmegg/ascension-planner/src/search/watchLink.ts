/**
 * "Watch this run from your phone" ("Stepping away?" box, StepAwayOptions.vue): the rules.
 *
 * A long run (Fastest, By a date, a Full sweep) can be given a WATCH LINK, watch.html#<id>.<secret>:
 *
 *  - `id`: 16 random bytes, base64url. The collector's lookup key (`POST /watch`, `GET /watch?id=`,
 *    collector/watch.js). It identifies a row and reveals nothing.
 *  - `secret`: 32 more random bytes, an AES-256-GCM key. It lives only in the link's FRAGMENT (after
 *    `#`), which browsers never send to any server, so it reaches no log either.
 *
 * END TO END. The run's tab encrypts the whole heartbeat (status, mode, progress, time left, the best
 * so far, label...) with that secret and a fresh 12-byte IV each time, and posts only
 * `{ id, iv, ct, status }`. The status stays readable because the collector's cron needs to know a
 * run is still marked running to warn that it went quiet. The collector (and whoever runs it) stores
 * ciphertext it cannot read; only someone holding the link or its QR code can (src/watch/phone.ts).
 * The id and secret live in the run's checkpoint, so a carry-on keeps the same link.
 *
 * Optional phone notifications go through ntfy (https://ntfy.sh). Anyone who knows a topic can read
 * it, so the topic is long and random and the notes say only that something happened, unless the
 * player ticks "include results in notifications".
 *
 * Everything here is pure (or a plain localStorage read/write, or WebCrypto), so the watch page can
 * use it without the planner's stores, and the rules can be tested.
 */

/** A heartbeat this often while the run goes (and at once on start, end, stop, failure). */
export const WATCH_EVERY_MS = 5 * 60_000;
/** A running run with no report for this long has probably stopped (crashed, or the computer slept). */
export const WATCH_STALE_MS = 15 * 60_000;
/** The watch page reads again this often. */
export const WATCH_REFRESH_MS = 60_000;
/** The collector keeps one write a minute per id (a status change is let through sooner). */
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
  /** The collector's lookup id: 16 random bytes, base64url (22 characters). */
  id: string;
  /** The AES-GCM key: 32 random bytes, base64url (43 characters). Never sent anywhere. */
  secret: string;
  /** When the run first started, ms (a carry-on keeps it). */
  startedAt: number;
  /** The ntfy topic, when the player opted in to notifications. */
  topic?: string;
  label?: string;
}

/** One heartbeat, as posted to the collector and read back by the watch page. */
export interface WatchHeartbeat {
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
  /** When the run ended (finished, stopped or failed), ms; absent while it runs. */
  endedAt?: number;
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

/** base64url (no padding) back to bytes; null when it is not base64url. */
export function fromBase64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map(k => (i + k < s.length ? B64URL.indexOf(s[i + k]) : 0));
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    const left = s.length - i;
    out[o++] = (n >> 16) & 255;
    if (left > 2) out[o++] = (n >> 8) & 255;
    if (left > 3) out[o++] = n & 255;
  }
  return out;
}

/** A fresh watch id: 16 random bytes (128 bits), 22 characters of base64url. */
export function newWatchId(fill: RandomFill = cryptoFill): string {
  return base64url(fill(new Uint8Array(16)));
}

/** A fresh secret: 32 random bytes (an AES-256 key), 43 characters of base64url. */
export function newWatchSecret(fill: RandomFill = cryptoFill): string {
  return base64url(fill(new Uint8Array(32)));
}

/** What the collector accepts as an id: 22 characters of base64url. */
export function isWatchId(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s);
}

export function isWatchSecret(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
}

/** `#<id>.<secret>` (with or without the `#`) as its two halves; null for anything else. */
export function parseWatchFragment(hash: string): { id: string; secret: string } | null {
  const m = /^#?([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(hash.trim());
  return m && isWatchId(m[1]) && isWatchSecret(m[2]) ? { id: m[1], secret: m[2] } : null;
}

// ------------------------------------------------------------------ encryption

async function aesKey(secret: string, use: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const raw = fromBase64url(secret);
  if (!raw || raw.length !== 32) throw new Error('not a watch secret');
  return crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, false, [use]);
}

/** The heartbeat, sealed: AES-256-GCM under the link's secret, with a fresh 12-byte IV. */
export async function sealHeartbeat(
  secret: string,
  h: WatchHeartbeat,
  fill: RandomFill = cryptoFill
): Promise<{ iv: string; ct: string }> {
  const iv = fill(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const key = await aesKey(secret, 'encrypt');
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(h)));
  return { iv: base64url(iv), ct: base64url(new Uint8Array(ct)) };
}

/** The heartbeat back, or null when the secret is wrong or the data was changed (GCM checks both). */
export async function openHeartbeat(secret: string, iv: string, ct: string): Promise<WatchHeartbeat | null> {
  try {
    const ivBytes = fromBase64url(iv);
    const ctBytes = fromBase64url(ct);
    if (!ivBytes || ivBytes.length !== 12 || !ctBytes) return null;
    const key = await aesKey(secret, 'decrypt');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as Uint8Array<ArrayBuffer> },
      key,
      ctBytes as Uint8Array<ArrayBuffer>
    );
    const h = JSON.parse(new TextDecoder().decode(plain)) as WatchHeartbeat;
    return h && typeof h === 'object' ? h : null;
  } catch {
    return null;
  }
}

/** A fresh ntfy topic: `aaap-` and 18 random bytes. Anyone who knows a topic can read it, so it is
 *  long and random. */
export function newNtfyTopic(fill: RandomFill = cryptoFill): string {
  return `aaap-${base64url(fill(new Uint8Array(18)))}`;
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
  if (!isWatchId(o.id) || !isWatchSecret(o.secret) || typeof o.startedAt !== 'number' || !Number.isFinite(o.startedAt))
    return null;
  const label = cleanLabel(o.label);
  return {
    id: o.id,
    secret: o.secret,
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
  /** Put the results (TE, finish date, progress) in the notes. Off: they only say something happened,
   *  since anyone who knows the topic can read them. */
  ntfyDetails: boolean;
  label: string;
}

export const WATCH_OPTIONS_KEY = 'aap.watchLink.options';
export const NTFY_EVERY_MIN = [0, 60, 120, 180, 240, 300, 360] as const;

export const DEFAULT_WATCH_OPTIONS: WatchLinkOptions = {
  phone: false,
  ntfy: false,
  ntfyTopic: '',
  ntfyEveryMin: 180,
  ntfyDetails: false,
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
        ntfyDetails: raw.ntfyDetails === true,
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
  /** When the run began, ms (the store's own), if known. */
  startedAt?: number | null;
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
  /** When the run ended, ms, once it has. */
  endedAt?: number | null;
  now: number;
}): WatchHeartbeat {
  const p = a.progress;
  const best = p?.best ?? null;
  const pct =
    typeof p?.percent === 'number' && Number.isFinite(p.percent) ? Math.max(0, Math.min(100, p.percent)) : null;
  return {
    status: a.status,
    mode: watchMode(a.kind),
    done: whole(p?.done),
    // A finished run did all of it: the estimate it went by is no longer a figure worth showing.
    total: a.status === 'finished' && p?.done ? whole(p.done) : p?.total ? whole(p.total) : null,
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
    startedAt:
      typeof p?.startedAt === 'number' && Number.isFinite(p.startedAt) && p.startedAt > 0
        ? Math.min(a.link.startedAt, p.startedAt)
        : a.link.startedAt,
    ...(a.status !== 'running' ? { endedAt: a.endedAt ?? a.now } : {}),
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

/**
 * The watch page's address: `watch.html#<id>.<secret>`. The fragment never leaves the browser.
 * `collector` (not secret) is added as a query only when it is not the build's own.
 */
export function watchPageUrl(a: {
  origin: string;
  base: string;
  id: string;
  secret: string;
  collector?: string | null;
}): string {
  const base = a.base.endsWith('/') ? a.base : `${a.base}/`;
  const q = a.collector ? `?${new URLSearchParams({ collector: a.collector }).toString()}` : '';
  return `${a.origin}${base}watch.html${q}#${a.id}.${a.secret}`;
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

/**
 * The ntfy note for a moment in the run; '' when there is none to send. Anyone who knows the topic can
 * read it, so without `details` it only says what happened and points at the watch link (which is
 * never put in a note: its secret would then be readable by the topic too).
 */
export function ntfyMessage(h: WatchHeartbeat, event: 'progress' | 'end', details = false): string {
  if (!details) {
    if (event === 'progress') return 'Your planner run is still going. Open your watch link to see how far.';
    if (h.status === 'finished') return 'Your planner run finished. Open your watch link to see it.';
    if (h.status === 'failed') return 'Your planner run stopped with an error. Open your watch link.';
    return '';
  }
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
export function ntfyBody(a: { topic: string; message: string; tags?: string[] }): string {
  return JSON.stringify({
    topic: a.topic,
    title: 'Ascension Planner',
    message: a.message,
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
  /** The best card's heading: "Best so far" while it runs, "Best found" once it has ended. */
  bestHeading: string;
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
  const ran = h.endedAt && h.status !== 'running' ? durationWords(Math.max(0, h.endedAt - h.startedAt) / 1000) : '';
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
    bestHeading: h.status === 'running' ? 'Best so far' : 'Best found',
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
      ran
        ? `${h.status === 'finished' ? 'took' : 'ran'} ${ran}, started ${agoWords(now - h.startedAt)}`
        : `started ${agoWords(now - h.startedAt)}`,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
