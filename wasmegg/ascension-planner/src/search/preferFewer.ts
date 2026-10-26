/**
 * "Prefer fewer ascensions if within X of the best" (Wolfcry1993, Discord; Q6, 18 Oct 2026). A setting in the
 * instant answer's counts card on Fastest and By a date: the green box leads with the route with the FEWEST
 * ascensions that is still within a margin of the best (Fastest: in time, By a date: in TE). It only changes
 * which route the box shows: never what is searched or priced, never Right now (only the box's own Follow this
 * route button), and Nearby routes / Exhaustive / Check exactly keep their own best.
 *
 * The choice: among the rows within the margin of the best, the fewest ascensions; ties on the count go to the
 * better one (Fastest: sooner; By a date: higher TE, then more spare). By a date "same TE" is a margin of 0 TE:
 * the fewest ascensions that reach the best TE with any spare above 0.
 *
 * The saving is only what was counted: ascensions (and so prestiges) always; shifts only when both routes'
 * simulated legs kept their shifts (Check exactly's), else nothing is said about shifts.
 *
 * Pure: no Vue, no stores (the storage helpers guard every localStorage access).
 */
import type { LegSummary } from './types';

export type PreferGoal = 'fastest' | 'date';

/** Off; Fastest: within `seconds` of the fastest finish; By a date: within `te` TE of the highest (0: same TE). */
export type PreferMargin = { kind: 'off' } | { kind: 'time'; seconds: number } | { kind: 'te'; te: number };

export const PREFER_OFF: PreferMargin = { kind: 'off' };

/** The ready-made choices on each screen (the control adds "custom…"). */
export const FASTEST_PRESETS: { label: string; margin: PreferMargin }[] = [
  { label: 'Off', margin: PREFER_OFF },
  { label: 'within 12 h', margin: { kind: 'time', seconds: 12 * 3600 } },
  { label: 'within 1 day', margin: { kind: 'time', seconds: 86400 } },
  { label: 'within 2 days', margin: { kind: 'time', seconds: 2 * 86400 } },
];
export const DATE_PRESETS: { label: string; margin: PreferMargin }[] = [
  { label: 'Off', margin: PREFER_OFF },
  { label: 'same TE', margin: { kind: 'te', te: 0 } },
  { label: 'within 1 TE', margin: { kind: 'te', te: 1 } },
  { label: 'within 2 TE', margin: { kind: 'te', te: 2 } },
];

export const sameMargin = (a: PreferMargin, b: PreferMargin): boolean =>
  a.kind === b.kind &&
  (a.kind === 'off' ||
    (a.kind === 'time' && b.kind === 'time' && a.seconds === b.seconds) ||
    (a.kind === 'te' && b.kind === 'te' && a.te === b.te));

/** One route the box could lead with. `item` is the caller's own row, handed back as is. */
export interface PreferRow<T> {
  item: T;
  ascensions: number;
  /** Unix second the route finishes (Fastest: reaches the target; By a date: its last stop). */
  finish: number;
  /** By a date: the TE it ends at by the date. */
  endTE?: number;
  /** By a date: seconds to spare before the date. */
  spare?: number;
  /** Shifts over the whole route, from its simulated legs (`shiftCount`); null when not known. */
  shifts: number | null;
}

export interface PreferChoice<T> {
  /**
   * 'off': the setting is off. 'only': no route has fewer ascensions than the best (nothing to say).
   * 'none': some do, but none is within the margin (a muted line). 'fewer': `chosen` has fewer ascensions.
   */
  state: 'off' | 'only' | 'none' | 'fewer';
  best: PreferRow<T>;
  /** The route the box leads with (the best unless state is 'fewer'). */
  chosen: PreferRow<T>;
  /** Fastest: how much later the chosen finishes, seconds (0 for the best). */
  costSeconds: number;
  /** By a date: how many TE below the highest (0 for the best). */
  costTE: number;
  ascensionsFewer: number;
  /** One prestige per ascension. */
  prestigesFewer: number;
  /** Null when either route's shifts are not known, or when the chosen route does not have fewer. */
  shiftsFewer: number | null;
}

const teOf = (r: PreferRow<unknown>) => r.endTE ?? 0;
const spareOf = (r: PreferRow<unknown>) => r.spare ?? 0;

/** Better for the goal: Fastest sooner (then fewer ascensions); By a date higher TE, then more spare, then fewer. */
function better<T>(goal: PreferGoal, a: PreferRow<T>, b: PreferRow<T>): boolean {
  if (goal === 'fastest') return a.finish !== b.finish ? a.finish < b.finish : a.ascensions < b.ascensions;
  if (teOf(a) !== teOf(b)) return teOf(a) > teOf(b);
  if (spareOf(a) !== spareOf(b)) return spareOf(a) > spareOf(b);
  return a.ascensions < b.ascensions;
}

/**
 * The route the box leads with. `best` is the box's own best (InstantRoute's lead), so with the setting Off the box
 * is exactly as before; when left out it is the best of `rows`. Null when there is nothing to choose from.
 */
export function choosePreferFewer<T>(
  goal: PreferGoal,
  rows: readonly PreferRow<T>[],
  margin: PreferMargin,
  best?: PreferRow<T> | null
): PreferChoice<T> | null {
  const top = best ?? rows.reduce<PreferRow<T> | null>((a, r) => (!a || better(goal, r, a) ? r : a), null);
  if (!top) return null;
  const plain: PreferChoice<T> = {
    state: 'off',
    best: top,
    chosen: top,
    costSeconds: 0,
    costTE: 0,
    ascensionsFewer: 0,
    prestigesFewer: 0,
    shiftsFewer: null,
  };
  if (margin.kind === 'off') return plain;
  const fewer = rows.filter(r => r !== top && r.ascensions < top.ascensions);
  if (!fewer.length) return { ...plain, state: 'only' };
  const inside = (r: PreferRow<T>): boolean => {
    if (goal === 'fastest') return margin.kind === 'time' && r.finish - top.finish <= Math.max(0, margin.seconds);
    if (margin.kind !== 'te') return false;
    // "Any spare above 0": a route that only just misses (or makes it with none left) is not offered.
    if (r.spare !== undefined && r.spare <= 0) return false;
    return teOf(r) >= teOf(top) - Math.max(0, margin.te);
  };
  let chosen: PreferRow<T> | null = null;
  for (const r of fewer) {
    if (!inside(r)) continue;
    if (!chosen || r.ascensions < chosen.ascensions || (r.ascensions === chosen.ascensions && better(goal, r, chosen)))
      chosen = r;
  }
  if (!chosen) return { ...plain, state: 'none' };
  const n = top.ascensions - chosen.ascensions;
  const shifts = top.shifts !== null && chosen.shifts !== null ? top.shifts - chosen.shifts : null;
  return {
    state: 'fewer',
    best: top,
    chosen,
    costSeconds: Math.max(0, chosen.finish - top.finish),
    costTE: Math.max(0, teOf(top) - teOf(chosen)),
    ascensionsFewer: n,
    prestigesFewer: n,
    shiftsFewer: shifts !== null && shifts > 0 ? shifts : null,
  };
}

/**
 * The shifts over a whole route: each leg's recorded shifts (search/leg.ts `shiftInstants`, the switches the
 * route timeline shows as its ordered steps after the egg each ascension opens on). Null when the legs don't
 * cover the route or any leg didn't keep its shifts (a table estimate, a replayed or older leg): never a guess.
 */
export function shiftCount(
  legs: readonly Pick<LegSummary, 'shifts'>[] | null | undefined,
  ascensions: number
): number | null {
  if (!Array.isArray(legs) || !legs.length || legs.length < ascensions) return null;
  let n = 0;
  for (const leg of legs.slice(0, ascensions)) {
    if (!Array.isArray(leg.shifts)) return null;
    n += leg.shifts.length;
  }
  return n;
}

/** How much later, in words: "under an hour", "~3 h", "half a day", "about a day", "1.5 days". */
export function laterWords(seconds: number): string {
  const h = seconds / 3600;
  if (h < 0.75) return 'under an hour';
  if (h < 10) return `~${Math.max(1, Math.round(h))} h`;
  if (h < 15) return 'half a day';
  if (h < 21) return `~${Math.round(h)} h`;
  const d = seconds / 86400;
  if (d < 1.25) return 'about a day';
  const half = Math.round(d * 2) / 2;
  return `${half} days`;
}

const trim = (v: number) => String(Math.round(v * 10) / 10);

/** The margin in words, for the chip and the muted line: "12 h", "1 day", "1.5 days", "36 min"; "1 TE", "same TE". */
export function marginWords(margin: PreferMargin): string {
  if (margin.kind === 'off') return '';
  if (margin.kind === 'te') return margin.te === 0 ? 'same TE' : `${trim(margin.te)} TE`;
  const s = Math.max(0, margin.seconds);
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s >= 86400 && s % 43200 === 0) {
    const d = s / 86400;
    return d === 1 ? '1 day' : `${trim(d)} days`;
  }
  return `${trim(s / 3600)} h`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface PreferCopy {
  /** On the box's header when it leads with a different route: "Fewest ascensions within 1 day". */
  chip: string;
  /**
   * One plain sentence first in the note under the box, saying what the box shows while Prefer fewer picked another
   * route: "The box shows the route with the fewest ascensions that finishes within 12 h of the fastest." (Jordan's
   * defaults, 26 Oct 2026: with a margin on by default, a player who never set it is told why.)
   */
  what: string;
  /** Under the box's numbers, cost first, then the saving. */
  line: string;
  /** "No route with fewer ascensions is within 1 day." Not shown since 26 Oct 2026 (PreferFewerNote.vue). */
  muted: string;
}

/**
 * The words for a choice. `show` writes a unix second as the screen does (12-hour). Fastest names prestiges; By a
 * date names shifts only (the approved copy, 18 Oct); shifts only when counted.
 */
export function preferFewerCopy<T>(
  choice: PreferChoice<T> | null,
  goal: PreferGoal,
  margin: PreferMargin,
  show: (unix: number) => string
): PreferCopy {
  const none: PreferCopy = { chip: '', what: '', line: '', muted: '' };
  if (!choice || margin.kind === 'off') return none;
  const m = marginWords(margin);
  const same = margin.kind === 'te' && margin.te === 0;
  if (choice.state === 'none') {
    return {
      ...none,
      muted: same ? 'No route with fewer ascensions reaches the same TE.' : `No route with fewer ascensions is within ${m}.`,
    };
  }
  if (choice.state !== 'fewer') return none;
  const fewer = count(choice.ascensionsFewer, 'fewer ascension', 'fewer ascensions');
  const parts: string[] = [];
  if (choice.shiftsFewer !== null) parts.push(count(choice.shiftsFewer, 'fewer shift', 'fewer shifts'));
  if (goal === 'fastest') parts.push(count(choice.prestigesFewer, 'fewer prestige', 'fewer prestiges'));
  const saving = parts.length ? `${fewer}: ${parts.join(', ')}` : fewer;
  const chip = same ? 'Fewest ascensions, same TE' : `Fewest ascensions within ${m}`;
  const what =
    goal === 'fastest'
      ? `The box shows the route with the fewest ascensions that finishes within ${m} of the fastest.`
      : same
        ? 'The box shows the route with the fewest ascensions that reaches the same TE.'
        : `The box shows the route with the fewest ascensions that ends within ${m} of the highest TE.`;
  let line: string;
  if (goal === 'fastest') {
    const when = show(choice.best.finish);
    line =
      choice.costSeconds > 0
        ? `${cap(laterWords(choice.costSeconds))} slower than the fastest (${when}), and ${saving}.`
        : `Same finish as the fastest (${when}), with ${saving}.`;
  } else {
    const te = teOf(choice.best);
    line =
      choice.costTE > 0
        ? `${trim(choice.costTE)} TE below the highest (${te}, ${count(choice.best.ascensions, 'ascension')}), and ${saving}.`
        : `Same TE as the highest (${te}), with ${saving}.`;
  }
  return { chip, what, line, muted: '' };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A saved route as the snapshot keeps it (search/routeFinder.ts Route), as far as `boxRouteOf` reads it. */
export interface BoxRouteLike {
  chain: number[];
  end: number;
  legs?: { endTE?: number; to?: number }[] | null;
}

/**
 * The route the green box shows, from a saved answer's routes (Jordan, 26 Oct 2026: My runs' Right now and the
 * instant baseline follow the box, not the best): `best` (Fastest `result.best`, By a date `result.byDate`) and the
 * rows per count (`byAscensions` / `byDateByAscensions`), chosen with `margin` as InstantRoute's box does (By a date
 * the spare is to `deadline`). The best with the margin Off, when nothing fits, or without a best.
 */
export function boxRouteOf<R extends BoxRouteLike>(
  goal: PreferGoal,
  best: R | null | undefined,
  rows: readonly (R | null | undefined)[] | null | undefined,
  margin: PreferMargin,
  deadline: number | null = null
): R | null {
  if (!best || !Array.isArray(best.chain) || !best.chain.length) return best ?? null;
  if (margin.kind === 'off') return best;
  const endTE = (r: R) => {
    const last = Array.isArray(r.legs) ? r.legs[r.legs.length - 1] : undefined;
    return last?.endTE ?? last?.to ?? r.chain[r.chain.length - 1];
  };
  const rowOf = (r: R): PreferRow<R> => ({
    item: r,
    ascensions: r.chain.length,
    finish: r.end,
    ...(goal === 'date' ? { endTE: endTE(r), ...(deadline !== null ? { spare: deadline - r.end } : {}) } : {}),
    shifts: null,
  });
  const k = best.chain.join(',');
  const others = (rows ?? []).filter(
    (r): r is R => !!r && Array.isArray(r.chain) && r.chain.length > 0 && Number.isFinite(r.end) && r.chain.join(',') !== k
  );
  const top = rowOf(best);
  const choice = choosePreferFewer(goal, [top, ...others.map(rowOf)], margin, top);
  return choice?.state === 'fewer' ? choice.chosen.item : best;
}

/** Remembered per browser, one value per screen. */
export interface PreferSetting {
  fastest: PreferMargin;
  date: PreferMargin;
}
/**
 * A new key (Jordan, 26 Oct 2026): before the defaults, picking on one screen saved Off for the other too, so a player
 * who ever touched a chip had Off stored for both, which can't be told apart from a real Off. Everyone starts on the
 * defaults once: the old key is never read and is removed (`dropOldPreferKeys`); a pick made from now on is kept here.
 */
export const PREFER_KEY = 'aap-prefer-fewer-v2';
/** Keys of earlier builds, discarded once. */
export const PREFER_OLD_KEYS: readonly string[] = ['aap-prefer-fewer'];

/** Removes the earlier builds' picks. Never throws (blocked storage, or one without removeItem). */
export function dropOldPreferKeys(): void {
  for (const k of PREFER_OLD_KEYS) {
    try {
      if (localStorage.getItem(k) !== null) localStorage.removeItem(k);
    } catch {
      // Nothing to do: the old key is never read anyway.
    }
  }
}
/**
 * Jordan's defaults (26 Oct 2026, item 7), for a screen the player has never set: Fastest to 490 (and every other race
 * target) within 12 h of the fastest; By a date (Egg Day too) the same TE. A choice the player made always wins.
 */
export const PREFER_DEFAULTS: PreferSetting = {
  fastest: { kind: 'time', seconds: 12 * 3600 },
  date: { kind: 'te', te: 0 },
};

/** A stored margin for that screen, Off included; undefined for one never set or not readable (the default then). */
function validMargin(v: unknown, kind: 'time' | 'te'): PreferMargin | undefined {
  const m = v as Partial<{ kind: string; seconds: number; te: number }> | null;
  if (!m || typeof m !== 'object') return undefined;
  if (m.kind === 'off') return PREFER_OFF;
  if (kind === 'time' && m.kind === 'time' && typeof m.seconds === 'number' && Number.isFinite(m.seconds) && m.seconds > 0)
    return { kind: 'time', seconds: m.seconds };
  if (kind === 'te' && m.kind === 'te' && typeof m.te === 'number' && Number.isFinite(m.te) && m.te >= 0)
    return { kind: 'te', te: m.te };
  return undefined;
}

/** Only what the player picked, per screen (a screen never set is absent). Never throws. */
export function readPreferPicked(): Partial<PreferSetting> {
  dropOldPreferKeys();
  try {
    const v = JSON.parse(localStorage.getItem(PREFER_KEY) ?? 'null') as Partial<PreferSetting> | null;
    if (!v || typeof v !== 'object') return {};
    const out: Partial<PreferSetting> = {};
    const fastest = validMargin(v.fastest, 'time');
    const date = validMargin(v.date, 'te');
    if (fastest) out.fastest = fastest;
    if (date) out.date = date;
    return out;
  } catch {
    return {};
  }
}

/** The setting each screen uses: the player's pick, else the default. */
export function readPreferFewer(): PreferSetting {
  return { ...PREFER_DEFAULTS, ...readPreferPicked() };
}

/** Writes what is given as is (only the screens in it are remembered). */
export function writePreferFewer(s: Partial<PreferSetting>): void {
  try {
    localStorage.setItem(PREFER_KEY, JSON.stringify(s));
  } catch {
    // Private windows and blocked storage: the setting lasts for this visit only.
  }
}

/**
 * The player picked `margin` on one screen: remember that screen only, so the other keeps following its default
 * until it is picked there too.
 */
export function rememberPreferFewer(goal: PreferGoal, margin: PreferMargin): void {
  writePreferFewer({ ...readPreferPicked(), [goal]: margin });
}
