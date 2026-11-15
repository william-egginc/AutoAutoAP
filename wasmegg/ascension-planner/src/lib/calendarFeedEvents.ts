/**
 * The calendar FEED events builder (not lib/calendarEvents.ts, the one-event 'Add to calendar' button) (design: ~/code/aaap-tools/notes/calendar-subscription-design-2026-11-14.md, addendum).
 *
 * ONE pure function, `buildCalendarEvents(input)`, turns the Build-up tracker's check-in lines (and, optionally, the followed
 * route's finish) into the list the collector's `cal` sync kind stores (`PUT /sync?kind=cal&slot=0`, collector/cal.js `readCal`).
 * The collector prints it as an .ics a calendar app subscribes to; the future push notifications read the same record. No DOM,
 * no fetch, no storage, no clock: `now` comes in, the same input gives the same output.
 *
 * WHAT AN EVENT IS: one check-in (the tracker groups a check-in's lines: buys, a shift, the prestige) is ONE event, so an hour of
 * buying is one calendar entry, not five. The event's `kind` is the most urgent thing in it (prestige, then shift, then buy). A
 * check-in whose every line is ticked is dropped; a partly ticked one lists only what is left. The lines with no check-in of their
 * own (sale starts and ends, back online) are `note` events. Waits and warnings have no time and are not events.
 * `uid` is `<ascension start>:<first line key>`: stable while the plan is the kept (anchored) one, so a changed time or text updates
 * the same calendar entry. `seq` bumps only when an event's start, end, title, notes or lead changed since `previous`.
 * `src` is a hash of what an event says (not `asOf`, not `seq`): equal to the last one sent means there is nothing to PUT.
 *
 * WORDS (Words, 14 Nov): titles "Shift to Humility", "Buy: {item}", "Ascend", "Reach 120 TE (about)"; every event's notes end with
 * "Planned as of 9:00 AM MST. Open the planner to confirm." in the player's own zone, and the first thing in the feed is a marker event
 * "Plan last updated 9:00 AM" (uid `asof`). The collector prints titles and notes as they are, with no words of its own. The time in both
 * is when the plan last CHANGED (a rebuild that changes nothing keeps `previous.asOf`), so it does not move on every rebuild.
 *
 * LIMITS the collector enforces (and this keeps): at most 100 events (the marker is one of them), soonest first, from a day ago to `days` ahead (a longer
 * list ends where the 100th event is: `window.to` is then that event's time, so the record says how far it reaches); a title is
 * at most 80 characters and notes 300; plain text, no player ID.
 */
import type { TrackerLine, LineKind } from './buildUpTracker';

export const CAL_MAX_EVENTS = 100;
export const CAL_TITLE_MAX = 80;
export const CAL_NOTES_MAX = 300;
/** The collector's cap for the record is 24 KB; the builder stops at 22 KB so a few more bytes of metadata never tip it over. */
export const CAL_MAX_BYTES = 22 * 1024;
export const CAL_DEFAULT_DAYS = 14;
const DAY_MS = 86_400_000;
const PAST_MS = DAY_MS;

export type CalKind = 'shift' | 'buy' | 'prestige' | 'route' | 'note';

export interface CalEvent {
  uid: string;
  seq: number;
  /** ms since 1970 (UTC). */
  start: number;
  end?: number;
  kind: CalKind;
  title: string;
  notes?: string;
  /** Minutes before the start to alert (the feed's alarm, later the push). */
  lead?: number;
  /** Timed to the minute (a shift, the prestige). */
  critical?: boolean;
  /** Outside the player's hours: the feed ignores it, the future push holds it until the window opens. */
  quiet?: boolean;
}

export interface CalEventList {
  v: 1;
  asOf: number;
  window: { from: number; to: number };
  src: string;
  events: CalEvent[];
}

/** The part of a tracker line the builder reads (a `TrackerLine` fits). */
export type CalLine = Pick<TrackerLine, 'key' | 'kind' | 'at' | 'text' | 'tickable' | 'checkIn'> &
  Partial<Pick<TrackerLine, 'tail'>>;

export interface CalOptions {
  /** Which kinds to include. Default: shift, buy, prestige, note on; route off. */
  include?: Partial<Record<CalKind, boolean>>;
  /** Minutes before the start, per kind. Default: shift 10, prestige 30, buy 5, none for notes and the route. 0 or null: no alert. */
  lead?: Partial<Record<CalKind, number | null>>;
  /** How many days ahead (default 14). */
  days?: number;
}

export interface CalendarInput {
  /** Now, ms since 1970. */
  now: number;
  /** The ascension's start, unix seconds (the plan's slot; makes the uids). */
  ascensionStart: number;
  /** `TrackerResult.lines`. */
  lines: readonly CalLine[];
  /** The lines the player has done: the save's ticks and the player's own, with the unticks applied (`effectiveTicks().ticked`). */
  ticks: ReadonlySet<string>;
  /** The last list sent: keeps `seq` going. */
  previous?: Pick<CalEventList, 'events' | 'src' | 'asOf'> | null;
  /** The followed route's finish (Fastest to a TE, By a date...): one `route` event at the time it ends. Off by default. */
  route?: { goal: string; finish?: number | null; endTE?: number | null } | null;
  /** The player's hours (the followed route's `hours`): events outside them are `quiet`. */
  hours?: { start: string; end: string; timezone?: string } | null;
  /** The planner's IANA zone (the hours' zone when they carry none). */
  zone?: string;
  options?: CalOptions;
}

const LEAD_DEFAULT: Record<CalKind, number | null> = { shift: 10, prestige: 30, buy: 5, note: null, route: null };
const INCLUDE_DEFAULT: Record<CalKind, boolean> = { shift: true, buy: true, prestige: true, note: true, route: false };
const RANK: Record<CalKind, number> = { prestige: 4, shift: 3, buy: 2, route: 1, note: 0 };

/** Tracker line kinds -> calendar kinds; null: no event of its own (a wait or warning has no time). */
const KIND_OF: Record<LineKind, CalKind | null> = {
  research: 'buy',
  trains: 'buy',
  trainCars: 'buy',
  vehicle: 'buy',
  hab: 'buy',
  silo: 'buy',
  shift: 'shift',
  setSwap: 'shift',
  siloTrick: 'shift',
  prestige: 'prestige',
  back: 'note',
  saleStart: 'note',
  saleEnd: 'note',
  saleWait: null,
  warning: null,
  note: null,
};

const PLAYER_ID = /EI\d{16}/gi;

// C0, DEL, C1 (U+0085 is a line end) and the Unicode line and paragraph separators: a lenient .ics reader treats any of them as a line
// break, so none may reach a title or note (QA red team, 14 Nov 2026; the collector refuses them too).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** Plain text: no player ID, no control characters, runs of space folded, cut to `max` with an ellipsis. */
function clean(text: string, max: number): string {
  const t = text.replace(PLAYER_ID, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** A uid the collector accepts: letters, digits and ._:- only, at most 80. */
function uidOf(slot: number, key: string): string {
  const safe = `${Math.floor(slot)}:${key}`.replace(/[^A-Za-z0-9._:-]/g, '_');
  return safe.length <= 80 ? safe : `${safe.slice(0, 60)}-${hash(safe).slice(0, 12)}`;
}

/** Two 32-bit FNV-1a passes (different seeds): a short fingerprint, not security. */
export function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return a.toString(36).padStart(7, '0') + b.toString(36).padStart(7, '0');
}

/** Whether `ms` falls inside the player's hours (start to end, overnight when start is later), in the zone's wall clock. */
export function inHours(ms: number, hours: { start: string; end: string; timezone?: string }, zone: string): boolean {
  let tz = hours.timezone || zone || 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  const fmt = (z: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: z,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
  try {
    parts = fmt(tz);
  } catch {
    tz = 'UTC';
    parts = fmt(tz);
  }
  const at =
    Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value);
  const minutes = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const from = minutes(hours.start);
  const to = minutes(hours.end);
  if (from === to) return true;
  return from < to ? at >= from && at < to : at >= from || at < to;
}

interface Draft {
  uid: string;
  start: number;
  kind: CalKind;
  title: string;
  /** The notes before the "Planned as of" line is added. */
  body?: string;
}

const upFirst = (t: string): string => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/** One line's title (Words, 14 Nov): "Shift to Humility", "Buy: Grav Plating (17 → 18)", "Ascend", a note as its own words. */
function lineTitle(kind: CalKind, l: CalLine): string {
  if (kind === 'prestige') return 'Ascend';
  if (kind === 'buy') return `Buy: ${l.text.replace(/^buy\s+/i, '')}`;
  return upFirst(l.text);
}

/** The title: the most urgent line's title, '+N more' when the check-in has other lines, cut to 80. */
function titleOf(kind: CalKind, lines: readonly CalLine[]): string {
  const top = lines.find(l => KIND_OF[l.kind] === kind) ?? lines[0]!;
  const more = lines.length - 1;
  const suffix = more > 0 ? ` +${more} more` : '';
  const room = CAL_TITLE_MAX - suffix.length;
  return clean(`${clean(lineTitle(kind, top), Math.max(8, room))}${suffix}`, CAL_TITLE_MAX);
}

/** Longest the "Planned as of 12:00 AM MST. Open the planner to confirm." line (and its newline) can be, with room to spare for a long zone name. */
const FOOTER_RESERVE = 70;
const BODY_MAX = CAL_NOTES_MAX - FOOTER_RESERVE;

function bodyOf(lines: readonly CalLine[]): string | undefined {
  if (lines.length <= 1 && !lines[0]?.tail) return undefined;
  const text = lines.map(l => `- ${clean(l.text, 120)}`).join('\n');
  const tail = lines[lines.length - 1]?.tail ? `\n${clean(lines[lines.length - 1]!.tail!, 40)}` : '';
  const all = `${text}${tail}`;
  return all.length <= BODY_MAX ? all : `${all.slice(0, BODY_MAX - 1).trimEnd()}…`;
}

const clockParts = (ms: number, zone: string): { time: string; zone: string } => {
  const fmt = (z: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: z,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).formatToParts(new Date(ms));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(zone);
  } catch {
    parts = fmt('UTC');
  }
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return { time: `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`, zone: get('timeZoneName') };
};
/** "Planned as of 9:00 AM MST. Open the planner to confirm." in the player's zone (Words' text; the server prints notes as they are). */
export const plannedAsOf = (ms: number, zone: string): string => {
  const c = clockParts(ms, zone);
  return `Planned as of ${c.time} ${c.zone}. Open the planner to confirm.`;
};
/** "Plan last updated 9:00 AM": the marker event's title. */
export const lastUpdated = (ms: number, zone: string): string => `Plan last updated ${clockParts(ms, zone).time}`;

const FOOTER_RE = /\n?Planned as of [^\n]*$/;
const bodyNotes = (notes: string | undefined): string => (notes ?? '').replace(FOOTER_RE, '');
const MARKER_UID = 'asof';

export function buildCalendarEvents(input: CalendarInput): CalEventList {
  const include = { ...INCLUDE_DEFAULT, ...(input.options?.include ?? {}) };
  const leadOf = { ...LEAD_DEFAULT, ...(input.options?.lead ?? {}) };
  const days = Math.max(1, Math.min(60, Math.floor(input.options?.days ?? CAL_DEFAULT_DAYS)));
  // Whole milliseconds everywhere: the collector refuses a fraction (QA, 14 Nov: window.to was 1794939489046.5247).
  const now = Math.floor(input.now);
  const from = now - PAST_MS;
  const to = now + days * DAY_MS;
  const zone = input.zone ?? 'UTC';

  // Group the tickable lines by check-in; the others (sale starts and ends, back online) stand alone.
  const groups = new Map<number, CalLine[]>();
  const drafts: Draft[] = [];
  for (const l of input.lines) {
    if (l.checkIn >= 0 && l.tickable) {
      if (!groups.has(l.checkIn)) groups.set(l.checkIn, []);
      groups.get(l.checkIn)!.push(l);
      continue;
    }
    const kind = KIND_OF[l.kind];
    if (!kind || !(l.at > 0)) continue;
    if (!l.tickable && kind !== 'note') continue;
    if (input.ticks.has(l.key)) continue;
    drafts.push({
      uid: uidOf(input.ascensionStart, l.key),
      start: Math.round(l.at * 1000),
      kind,
      title: clean(lineTitle(kind, l), CAL_TITLE_MAX),
      ...(l.tail ? { body: clean(l.tail, BODY_MAX) } : {}),
    });
  }
  for (const lines of groups.values()) {
    const left = lines.filter(l => !input.ticks.has(l.key));
    if (!left.length) continue;
    const kinds = left.map(l => KIND_OF[l.kind]).filter((k): k is CalKind => k !== null);
    if (!kinds.length) continue;
    const kind = kinds.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    const first = left[0]!;
    const body = bodyOf(left);
    drafts.push({
      uid: uidOf(input.ascensionStart, first.key),
      start: Math.round(first.at * 1000),
      kind,
      title: titleOf(kind, left),
      ...(body ? { body } : {}),
    });
  }
  const route = input.route;
  if (route && route.finish && route.finish > 0) {
    drafts.push({
      uid: `route:${route.goal.replace(/[^A-Za-z0-9._:-]/g, '_')}`.slice(0, 80),
      start: Math.round(route.finish * 1000),
      kind: 'route',
      title: route.endTE ? `Reach ${route.endTE} TE (about)` : 'Your route ends (about)',
    });
  }

  const previous = new Map((input.previous?.events ?? []).map(e => [e.uid, e]));
  const picked = drafts
    .filter(d => include[d.kind] && d.start >= from && d.start <= to)
    .sort((a, b) => a.start - b.start || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  // One place of the 100 is the "Plan last updated" marker.
  let kept = picked.slice(0, CAL_MAX_EVENTS - 1);

  const footerNow = plannedAsOf(now, zone);
  const events: CalEvent[] = kept.map(d => {
    const lead = leadOf[d.kind];
    const e: CalEvent = { uid: d.uid, seq: 0, start: d.start, kind: d.kind, title: d.title };
    if (d.body) e.notes = d.body;
    if (typeof lead === 'number' && lead > 0) e.lead = lead;
    if (d.kind === 'shift' || d.kind === 'prestige') e.critical = true;
    if (input.hours && !inHours(d.start, input.hours, zone)) e.quiet = true;
    const was = previous.get(d.uid);
    if (was) e.seq = was.seq + (sameContent({ ...was, notes: bodyNotes(was.notes) || undefined }, e) ? 0 : 1);
    return e;
  });

  // Stay under the record's size cap, counting the footer each event will carry: the latest events go first.
  const encoder = new TextEncoder();
  const sizes = events.map(
    e => encoder.encode(JSON.stringify({ ...e, notes: `${e.notes ?? ''}\n${footerNow}` })).length + 1
  );
  let total = 400 + sizes.reduce((a, b) => a + b, 0);
  while (events.length && total > CAL_MAX_BYTES) {
    total -= sizes[events.length - 1]!;
    events.pop();
  }
  kept = kept.slice(0, events.length);
  const truncated = picked.length > events.length;

  // `src` says what the events say, without the footer's time: unchanged means nothing to send, and the time stays the one
  // the plan last changed (not "now" on every rebuild).
  const src = hash(JSON.stringify(events.map(({ seq: _seq, ...rest }) => rest)));
  const same = !!input.previous && input.previous.src === src && typeof input.previous.asOf === 'number';
  const asOf = same ? Math.floor(input.previous!.asOf) : now;
  const footer = plannedAsOf(asOf, zone);
  for (const e of events) e.notes = e.notes ? `${e.notes}\n${footer}` : footer;
  // Always there, even with no check-ins in the window: an empty feed looks broken (QA, 14 Nov).
  const marker: CalEvent = { uid: MARKER_UID, seq: 0, start: asOf, kind: 'note', title: lastUpdated(asOf, zone) };
  const was = previous.get(MARKER_UID);
  if (was) marker.seq = was.seq + (was.title === marker.title ? 0 : 1);
  events.push(marker);
  events.sort((a, b) => a.start - b.start || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return {
    v: 1,
    asOf,
    window: { from, to: truncated && kept.length ? kept[kept.length - 1]!.start : to },
    src,
    events,
  };
}

const sameContent = (a: CalEvent, b: CalEvent): boolean =>
  a.start === b.start &&
  a.end === b.end &&
  a.title === b.title &&
  (a.notes ?? '') === (b.notes ?? '') &&
  (a.lead ?? 0) === (b.lead ?? 0);

/** Whether a list says what the last one sent did (nothing to PUT). */
export const sameCalendar = (a: Pick<CalEventList, 'src'> | null | undefined, b: Pick<CalEventList, 'src'>): boolean =>
  !!a && a.src === b.src;
