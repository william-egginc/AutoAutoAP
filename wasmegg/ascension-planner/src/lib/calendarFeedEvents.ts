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
 * LIMITS the collector enforces (and this keeps): at most 100 events, soonest first, from a day ago to `days` ahead (a longer
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
  previous?: Pick<CalEventList, 'events'> | null;
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
const LABEL: Record<CalKind, string> = {
  prestige: 'Prestige',
  shift: 'Shift',
  buy: 'Buy',
  route: 'Route',
  note: 'Note',
};

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
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

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
  notes?: string;
}

/** The title: the most urgent line's words after its label, '+N more' when the check-in has others, cut to 80. */
function titleOf(kind: CalKind, lines: readonly CalLine[]): string {
  const top = lines.find(l => KIND_OF[l.kind] === kind) ?? lines[0]!;
  const more = lines.length - 1;
  const suffix = more > 0 ? ` +${more} more` : '';
  const head = `${LABEL[kind]}: `;
  const room = CAL_TITLE_MAX - head.length - suffix.length;
  const body = clean(top.text, Math.max(8, room));
  return clean(`${head}${body}${suffix}`, CAL_TITLE_MAX);
}

function notesOf(lines: readonly CalLine[]): string | undefined {
  if (lines.length <= 1 && !lines[0]?.tail) return undefined;
  const text = lines.map(l => `- ${clean(l.text, 120)}`).join('\n');
  const tail = lines[lines.length - 1]?.tail ? `\n${clean(lines[lines.length - 1]!.tail!, 40)}` : '';
  const all = `${text}${tail}`;
  return all.length <= CAL_NOTES_MAX ? all : `${all.slice(0, CAL_NOTES_MAX - 1).trimEnd()}…`;
}

export function buildCalendarEvents(input: CalendarInput): CalEventList {
  const include = { ...INCLUDE_DEFAULT, ...(input.options?.include ?? {}) };
  const leadOf = { ...LEAD_DEFAULT, ...(input.options?.lead ?? {}) };
  const days = Math.max(1, Math.min(60, Math.floor(input.options?.days ?? CAL_DEFAULT_DAYS)));
  const from = input.now - PAST_MS;
  const to = input.now + days * DAY_MS;
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
      start: l.at * 1000,
      kind,
      title: clean(`${LABEL[kind]}: ${l.text}`, CAL_TITLE_MAX),
      ...(l.tail ? { notes: clean(l.tail, CAL_NOTES_MAX) } : {}),
    });
  }
  for (const lines of groups.values()) {
    const left = lines.filter(l => !input.ticks.has(l.key));
    if (!left.length) continue;
    const kinds = left.map(l => KIND_OF[l.kind]).filter((k): k is CalKind => k !== null);
    if (!kinds.length) continue;
    const kind = kinds.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    const first = left[0]!;
    const notes = notesOf(left);
    drafts.push({
      uid: uidOf(input.ascensionStart, first.key),
      start: first.at * 1000,
      kind,
      title: titleOf(kind, left),
      ...(notes ? { notes } : {}),
    });
  }
  const route = input.route;
  if (route && route.finish && route.finish > 0) {
    const end = route.endTE ? ` (${route.endTE} TE)` : '';
    drafts.push({
      uid: `route:${route.goal.replace(/[^A-Za-z0-9._:-]/g, '_')}`.slice(0, 80),
      start: route.finish * 1000,
      kind: 'route',
      title: clean(`Route: your route ends${end}`, CAL_TITLE_MAX),
    });
  }

  const previous = new Map((input.previous?.events ?? []).map(e => [e.uid, e]));
  const picked = drafts
    .filter(d => include[d.kind] && d.start >= from && d.start <= to)
    .sort((a, b) => a.start - b.start || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  let kept = picked.slice(0, CAL_MAX_EVENTS);

  const events: CalEvent[] = kept.map(d => {
    const lead = leadOf[d.kind];
    const e: CalEvent = { uid: d.uid, seq: 0, start: d.start, kind: d.kind, title: d.title };
    if (d.notes) e.notes = d.notes;
    if (typeof lead === 'number' && lead > 0) e.lead = lead;
    if (d.kind === 'shift' || d.kind === 'prestige') e.critical = true;
    if (input.hours && !inHours(d.start, input.hours, zone)) e.quiet = true;
    const was = previous.get(d.uid);
    if (was) e.seq = was.seq + (sameContent(was, e) ? 0 : 1);
    return e;
  });

  // Stay under the record's size cap: the latest events go first (the longest titles and notes can make 100 events too big).
  const encoder = new TextEncoder();
  const sizes = events.map(e => encoder.encode(JSON.stringify(e)).length + 1);
  let total = 200 + sizes.reduce((a, b) => a + b, 0);
  while (events.length && total > CAL_MAX_BYTES) {
    total -= sizes[events.length - 1]!;
    events.pop();
  }
  kept = kept.slice(0, events.length);
  const truncated = picked.length > events.length;

  const src = hash(JSON.stringify(events.map(({ seq: _seq, ...rest }) => rest)));
  return {
    v: 1,
    asOf: input.now,
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
