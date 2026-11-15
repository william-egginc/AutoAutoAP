/**
 * THE CALENDAR FEED, client side (spec-calendar-ui, 14 Nov 2026; Jordan: option B, a secret-link feed, off by default
 * behind its own switch). The events are built by lib/calendarFeedEvents.ts, the calls are lib/calendarCloud.ts, the card is
 * components/auto/CalendarFeedSetup.vue, its words lib/calendarFeedWords.ts.
 *
 *  - Its OWN switch, per account in this browser (`aap.calFeed.<account>`), OFF by default. It needs the same online
 *    target as the other synced records (a collector, Save online on, the account's key): without one it is not available.
 *  - GET LINK mints a private link (POST /cal/new, the key in the body). The link is shown ONCE, held in memory only: this
 *    browser remembers just that a link exists (`.linked`). Nothing else holds it, nor does any log or address.
 *  - RESET LINK asks first, then revokes every link of the account (POST /cal/revoke { k, all: true }). Turning the switch
 *    OFF does the same and forgets what was kept.
 *  - THE PLAN goes up as the 'cal' record (PUT /sync kind=cal slot 0) only when the switch is on, a link exists and the list
 *    changed (`sameCalendar`), 10 s after the last change, coalesced; on a 409 sent ONCE more with a fresh stamp. The page
 *    that has the Build-up tracker (My runs) calls `note` when its lines or ticks change.
 * Not a result code hash input.
 */
import { computed, ref } from 'vue';
import { buildCalendarEvents, sameCalendar, type CalEventList, type CalendarInput } from '@/lib/calendarFeedEvents';
import { CALENDAR_FEED, mintCalendarLink, putCalendar, revokeCalendarLinks, type CalFail } from '@/lib/calendarCloud';
import { SYNC_RECORDS, type SyncFetch } from '@/lib/syncedRecords';
import * as blackBox from '@/search/blackBox';

export const CAL_DEBOUNCE_MS = 10_000;
/** How many days ahead the feed shows for a PRODUCING player (the Next shifts stand in for the tracker's lines): shifts are days apart. Buying keeps the
 *  builder's default (lib/calendarFeedEvents.ts CAL_DEFAULT_DAYS, 14). Jordan, 14 Nov 2026. */
export const CAL_PRODUCING_DAYS = 60;

export interface CalendarFeedEnv {
  /** The account as this browser keys it (search/runSaves.ts `accountOf`), '' without one. */
  account: string;
  /** Where the synced records go: the collector's /sync address and the account's key; null: not available. */
  target: () => { url: string; k: string } | null;
}
export type CalendarFeedInput = Omit<CalendarInput, 'previous'>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Last = Pick<CalEventList, 'events' | 'src' | 'asOf'>;
export type CalPhase = 'idle' | 'confirm' | 'reset-done';

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function createCalendarFeed(o: {
  storage: StorageLike | null;
  env: CalendarFeedEnv;
  fetch?: SyncFetch | null;
  clipboard?: { writeText(t: string): Promise<void> } | null;
}) {
  const st = o.storage;
  const key = (s = '') => `aap.calFeed.${o.env.account}${s}`;
  const read = (k: string): string | null => {
    try {
      return st?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  const write = (k: string, v: string | null): void => {
    try {
      if (v === null) st?.removeItem(k);
      else st?.setItem(k, v);
    } catch {
      // kept for this visit only
    }
  };
  const f = o.fetch === undefined ? undefined : o.fetch;
  const enabled = ref(read(key()) === '1');
  const linked = ref(read(key('.linked')) === '1');
  /** The link, shown once. Memory only. */
  const link = ref<string | null>(null);
  const busy = ref(false);
  /** `upload`: the plan could not be sent to the calendar (the link buttons use CalFail's `error` instead). */
  const error = ref<'' | CalFail | 'upload'>('');
  const phase = ref<CalPhase>('idle');
  const copied = ref(false);
  /** A link was made before My runs gave any plan: only the marker is up, and the card says to open My runs once. */
  const needsMyRuns = ref(false);
  /** Reset link is offered with a link kept here, and also when the server says the limit is hit (3 links made on another device). */
  const canReset = computed(() => linked.value || error.value === 'limit');
  // The build flag first (lib/calendarCloud.ts CALENDAR_FEED): off, never available, whatever an earlier build stored.
  const available = computed(() => CALENDAR_FEED.enabled && SYNC_RECORDS.enabled && !!o.env.account && o.env.target() !== null);

  let last: Last | null = (() => {
    try {
      const v = JSON.parse(read(key('.last')) ?? 'null') as Last | null;
      return v && Array.isArray(v.events) && typeof v.src === 'string' ? v : null;
    } catch {
      return null;
    }
  })();
  function keep(next: Last | null): void {
    last = next;
    write(key('.last'), next ? JSON.stringify(next) : null);
  }

  function turnOn(): void {
    if (!CALENDAR_FEED.enabled) return;
    enabled.value = true;
    write(key(), '1');
    error.value = '';
  }
  async function revokeAll(): Promise<boolean> {
    const t = o.env.target();
    if (!t) return false;
    const r = await revokeCalendarLinks(t.url, t.k, f);
    return r.ok;
  }
  function forget(): void {
    linked.value = false;
    link.value = null;
    copied.value = false;
    write(key('.linked'), null);
    keep(null);
  }
  async function turnOff(): Promise<void> {
    if (!CALENDAR_FEED.enabled) return;
    enabled.value = false;
    write(key(), null);
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
    phase.value = 'idle';
    error.value = '';
    if (linked.value) await revokeAll();
    forget();
  }
  async function getLink(): Promise<void> {
    if (!CALENDAR_FEED.enabled) return;
    error.value = '';
    const t = o.env.target();
    if (!t) {
      error.value = 'off';
      return;
    }
    busy.value = true;
    try {
      const r = await mintCalendarLink(t.url, t.k, f);
      if (!r.ok) {
        error.value = r.why;
        return;
      }
      link.value = r.url;
      linked.value = true;
      write(key('.linked'), '1');
      phase.value = 'idle';
      // A new link has no events yet: forget what an earlier link was sent, and send the plan now, not 10 s from the next change.
      keep(null);
      // The plan My runs gave so far, else just the marker (a fresh subscription is never empty); the card asks for My runs.
      needsMyRuns.value = !latest;
      pending = latest ?? { now: Date.now(), ascensionStart: 0, lines: [], ticks: new Set<string>(), zone: browserZone(), hours: null };
      if (timer) clearTimeout(timer);
      timer = null;
    } finally {
      busy.value = false;
    }
    await flush();
  }
  async function copy(): Promise<void> {
    if (!link.value) return;
    try {
      const cb = o.clipboard === undefined ? (typeof navigator !== 'undefined' ? navigator.clipboard : null) : o.clipboard;
      await cb?.writeText(link.value);
      copied.value = true;
    } catch {
      error.value = 'error';
    }
  }
  const askReset = (): void => {
    phase.value = 'confirm';
  };
  const keepIt = (): void => {
    phase.value = 'idle';
  };
  async function confirmReset(): Promise<void> {
    if (!CALENDAR_FEED.enabled) return;
    error.value = '';
    busy.value = true;
    try {
      if (!(await revokeAll())) {
        error.value = o.env.target() ? 'offline' : 'off';
        phase.value = 'idle';
        return;
      }
      forget();
      phase.value = 'reset-done';
    } finally {
      busy.value = false;
    }
  }

  // ------------------------------------------------------------------------------------------ the plan going up
  let pending: CalendarFeedInput | null = null;
  /** The newest plan handed to `note`, kept even before a link exists so Get link can send it at once. */
  let latest: CalendarFeedInput | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  async function flush(): Promise<void> {
    const input = pending;
    pending = null;
    timer = null;
    const t = o.env.target();
    if (!input || !t || !enabled.value || !linked.value) return;
    const next = buildCalendarEvents({ ...input, previous: last });
    if (sameCalendar(last, next)) return;
    let r = await putCalendar(t.url, t.k, Date.now(), next, f);
    if (!r.ok && r.why === 'newer') r = await putCalendar(t.url, t.k, Date.now(), next, f);
    if (r.ok) {
      keep({ events: next.events, src: next.src, asOf: next.asOf });
      if (error.value) error.value = '';
      return;
    }
    // Not silent: the card says so, and the black box keeps the reason (never the link).
    error.value = r.why === 'offline' ? 'offline' : r.why === 'off' ? 'off' : 'upload';
    blackBox.note(`calendar upload failed: ${r.why}`);
  }
  /** The plan as it is now (My runs calls it when its lines or ticks change). Coalesced: sent 10 s after the last. */
  function note(input: CalendarFeedInput): void {
    if (!CALENDAR_FEED.enabled) return;
    latest = input;
    needsMyRuns.value = false;
    if (!enabled.value || !linked.value) return;
    pending = input;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), CAL_DEBOUNCE_MS);
  }

  return { enabled, linked, link, busy, error, phase, copied, needsMyRuns, canReset, available, turnOn, turnOff, getLink, copy, askReset, keepIt, confirmReset, note };
}
export type CalendarFeed = ReturnType<typeof createCalendarFeed>;

// ------------------------------------------------------------------------------------------------ the page's instance
import { watch, type Ref } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';
import { syncTarget } from './useOverrideSync';
import type { CalLine } from '@/lib/calendarFeedEvents';
import type { Availability } from '@/search/availabilitySchedule';

/** The availability's hours as the builder reads them ({ start, end } as HH:MM in the plan's zone); null: none. */
export function calHoursOf(a: Availability | null | undefined): CalendarFeedInput['hours'] {
  if (!a || !Number.isInteger(a.fromHour) || !Number.isInteger(a.toHour)) return null;
  const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
  return { start: hh(a.fromHour), end: hh(a.toHour), ...(a.timezone ? { timezone: a.timezone } : {}) };
}

const feeds = new Map<string, CalendarFeed>();
function localStore(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
/** The feed of an account (one per account per page: the Setup card and My runs share it). */
export function calendarFeedFor(account: string): CalendarFeed {
  let c = feeds.get(account);
  if (!c) {
    c = createCalendarFeed({ storage: localStore(), env: { account, target: () => syncTarget() } });
    feeds.set(account, c);
  }
  return c;
}
/** Specs: a new page load. */
export function resetCalendarFeeds(): void {
  feeds.clear();
}
/** The feed of the account on screen (Setup's card is keyed by the account, so it is made for it). */
export function useCalendarFeed(): CalendarFeed {
  return calendarFeedFor(accountOf(useInitialStateStore().rawBackup));
}

/**
 * My runs: hand the feed the plan whenever the tracker's lines or ticks change. The feed does nothing unless it is on and
 * linked (and says nothing of its own here: a watcher of what the tracker already computes, never a read of the save).
 */
export function useCalendarFeedPush(src: {
  lines: Ref<readonly CalLine[] | null | undefined>;
  /** A PRODUCING player (nothing to buy, the tracker `notBuilding`) has no tracker lines: these stand in for them (the Next shifts: the shifts and the
   *  prestige, lib/calendarNextShifts.ts). Used only when `lines` is null; the plan's start may then be unknown, and the feed's slot is 0. */
  fallbackLines?: Ref<readonly CalLine[] | null | undefined>;
  ticks: Ref<ReadonlySet<string>>;
  ascensionStart: Ref<number | null>;
  zone: Ref<string>;
  /** The player's availability (store.availability when constrained): its hours go to the feed, its days are not used. */
  hours: Ref<Availability | null>;
}): void {
  const initial = useInitialStateStore();
  watch(
    () => [src.lines.value, src.fallbackLines?.value, src.ticks.value, src.ascensionStart.value, src.zone.value, src.hours.value] as const,
    () => {
      const own = src.lines.value;
      const lines = own ?? src.fallbackLines?.value;
      const account = accountOf(initial.rawBackup);
      if (!lines || !account) return;
      // The tracker's lines need the ascension's start (their uids). The stand-ins are keyed without a time and always use slot 0: the plan's
      // start is the follow time, so a re-follow would give every shift a new uid (an entry the player dismissed would come back).
      const ascensionStart = own ? src.ascensionStart.value || 0 : 0;
      if (own && !ascensionStart) return;
      calendarFeedFor(account).note({
        now: Date.now(),
        ascensionStart,
        lines,
        ticks: src.ticks.value,
        zone: src.zone.value,
        hours: calHoursOf(src.hours.value),
        ...(own ? {} : { options: { days: CAL_PRODUCING_DAYS } }),
      });
    },
    { immediate: true }
  );
}
