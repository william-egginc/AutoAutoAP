/**
 * @module lightAtOnce
 * @description Light, the stronger check's first level (StrongerCheck.vue), prices the instant answer's
 * routes "at once" before the player's earlier routes (Jordan, 14 Oct 2026; it replaced the instant
 * answer's "Also try ascending the moment each ascension ends" box). Check exactly prices each route
 * with every fresh ascension on the hour, as the table was simulated; Light prices the same routes with
 * each fresh ascension starting the moment the one before ends (search/chain.ts `HandoffChoice` 'now',
 * the "at once" the box used), on the player's hours and time off (store.collectInputs, as Check
 * exactly). No search: only the routes the counts table shows.
 *
 * Pure: the order, the words, and the loop with the pricing passed in. The component owns the workers.
 */
import { bestOf, key, makesDate, type Goal, type Priced } from './strongerCheck';

/** One route Light prices at once: a row of the counts table. */
export interface AtOnceItem {
  chain: number[];
  /** Its row's number of ascensions. */
  count: number;
}

/**
 * The routes to price, the lead (the fastest by Check exactly, or By a date's answer) first, then the
 * rest in the table's order, each route once.
 */
export function atOnceQueue(rows: readonly AtOnceItem[], lead: readonly number[] | null): AtOnceItem[] {
  const out: AtOnceItem[] = [];
  const seen = new Set<string>();
  const push = (it: AtOnceItem) => {
    const k = key(it.chain);
    if (seen.has(k) || it.chain.length < 1) return;
    seen.add(k);
    out.push({ chain: [...it.chain], count: it.count });
  };
  const leadRow = lead ? rows.find(r => key(r.chain) === key(lead)) : undefined;
  if (lead) push(leadRow ?? { chain: [...lead], count: lead.length });
  for (const r of rows) push(r);
  return out;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** "Looking at 7 ascensions (1 of 5)": the route being priced, and how far along. */
export function lookingText(count: number, index: number, total: number): string {
  return `Looking at ${plural(count, 'ascension')} (${index + 1} of ${total})`;
}

/** "Your earlier routes: 3 of 6". */
export function earlierText(done: number, total: number): string {
  return `Your earlier routes: ${Math.min(done, total)} of ${total}`;
}

/** Seconds as days, the counts table's way ("0.40 days"). */
export function days(seconds: number): string {
  return (Math.abs(seconds) / 86400).toFixed(2) + ' days';
}

/** Under a minute apart is the same time (the simulator's own rounding is far smaller). */
const SAME_SECONDS = 60;

/** "−0.40 days" (sooner), "+0.10 days" (later), "same time": at once against on the hour. */
export function signedGap(atOnceEnd: number, hourEnd: number): string {
  const d = atOnceEnd - hourEnd;
  if (Math.abs(d) < SAME_SECONDS) return 'same time';
  return (d < 0 ? '−' : '+') + days(d);
}

/** "at once, on your hours" or "at once" (no hours set: every hour is yours). */
export function atOnceLabel(hours: boolean): string {
  return hours ? 'at once, on your hours' : 'at once';
}

/**
 * The line under a counts-table row: "at once, on your hours: Feb 16, 9:40 PM (−0.40 days)". By a date
 * it also says whether the date is made: "(−0.40 days, 1.20 days to spare)" / "(…, misses the date by
 * 0.30 days)". `hourEnd` is the same route on the hour (Check exactly), null when it has none.
 */
export function rowLine(o: {
  goal: Goal;
  priced: Priced | null;
  hourEnd: number | null;
  hours: boolean;
  show: (unix: number) => string;
}): string {
  const label = atOnceLabel(o.hours);
  if (!o.priced) return `${label}: couldn't price`;
  const parts: string[] = [];
  if (o.hourEnd !== null) parts.push(signedGap(o.priced.end, o.hourEnd));
  if (o.goal.kind === 'date') {
    const spare = o.goal.deadline - o.priced.end;
    parts.push(spare >= 0 ? `${days(spare)} to spare` : `misses the date by ${days(spare)}`);
  }
  return `${label}: ${o.show(o.priced.end)}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

/**
 * Light's own summary once at least one route is priced at once. Fastest: "Fastest as you'd play it:
 * 230 → 300 → 490 reaches 490 on <date> (0.40 days sooner than on the hour)". By a date: "As you'd play
 * it: <route> reaches 310 TE on <date>, 1.20 days to spare (0.40 days more than on the hour)". `best`
 * is Check exactly's answer, on the hour.
 */
export function summaryLine(o: {
  goal: Goal;
  prices: readonly (Priced | null)[];
  best: Priced | null;
  show: (unix: number) => string;
}): string {
  const top = bestOf(o.goal, o.prices);
  if (o.goal.kind === 'fastest') {
    if (!top) return '';
    const route = top.chain.join(' → ');
    let vs = '';
    if (o.best) {
      const d = top.end - o.best.end;
      vs =
        Math.abs(d) < SAME_SECONDS
          ? ' (the same as on the hour)'
          : ` (${days(d)} ${d < 0 ? 'sooner' : 'later'} than on the hour)`;
    }
    return `Fastest as you'd play it: ${route} reaches ${o.goal.target} on ${o.show(top.end)}${vs}`;
  }
  const deadline = o.goal.deadline;
  if (!top) return o.prices.some(p => p) ? "As you'd play it: none of these routes makes the date at once either." : '';
  const spare = deadline - top.end;
  let vs = '';
  if (o.best && makesDate(o.best, deadline)) {
    const te = Math.floor(top.endTE) - Math.floor(o.best.endTE);
    if (te !== 0) vs = ` (${Math.abs(te)} TE ${te > 0 ? 'more' : 'less'} than on the hour)`;
    else {
      const d = o.best.end - top.end;
      vs =
        Math.abs(d) < SAME_SECONDS
          ? ' (the same as on the hour)'
          : ` (${days(d)} ${d > 0 ? 'more' : 'less'} to spare than on the hour)`;
    }
  }
  return `As you'd play it: ${top.chain.join(' → ')} reaches ${Math.floor(top.endTE)} TE on ${o.show(top.end)}, ${days(spare)} to spare${vs}`;
}

/** Light's Done line: "priced the instant answer's 5 routes at once, and 2 of your 3 earlier routes". */
export function doneWhat(o: { instantPriced: number; instantTotal: number; earlierPriced: number; earlierTotal: number }): string {
  const parts: string[] = [];
  if (o.instantTotal)
    parts.push(
      o.instantPriced >= o.instantTotal
        ? `the instant answer's ${plural(o.instantTotal, 'route')} at once`
        : `${o.instantPriced} of the instant answer's ${plural(o.instantTotal, 'route')} at once`
    );
  if (o.earlierTotal) parts.push(`${o.earlierPriced} of your ${plural(o.earlierTotal, 'earlier route')}`);
  return parts.join(', and ');
}

/**
 * Price `items` at once: the first (the lead) alone, so its line and the summary come soonest, then the
 * rest together, each result as it lands. `price` prices a list and calls back per route (the pool's
 * dealt batch, one route per worker). `onProgress` says which route is next (null when done).
 * `pause` yields to the page between the two steps. Returns false when stopped.
 */
export async function runAtOnce(o: {
  items: readonly AtOnceItem[];
  price: (chains: number[][], onEach: (chain: number[], p: Priced | null) => void) => Promise<void>;
  onResult: (chain: number[], p: Priced | null) => void;
  onProgress: (next: AtOnceItem | null, index: number, total: number) => void;
  shouldStop: () => boolean;
  pause?: () => Promise<void>;
}): Promise<boolean> {
  const total = o.items.length;
  if (!total) return true;
  const landed = new Set<string>();
  let done = 0;
  const each = (chain: number[], p: Priced | null) => {
    const k = key(chain);
    if (landed.has(k) || o.shouldStop()) return;
    landed.add(k);
    done++;
    o.onResult(chain, p);
    const next = o.items.find(it => !landed.has(key(it.chain))) ?? null;
    o.onProgress(next, Math.min(done, total - 1), total);
  };
  o.onProgress(o.items[0], 0, total);
  await o.price([[...o.items[0].chain]], each);
  if (o.shouldStop()) return false;
  if (!landed.has(key(o.items[0].chain))) each(o.items[0].chain, null);
  const rest = o.items.slice(1);
  if (!rest.length) return true;
  await o.pause?.();
  if (o.shouldStop()) return false;
  await o.price(
    rest.map(it => [...it.chain]),
    each
  );
  if (o.shouldStop()) return false;
  // Anything the pricing never answered for could not be priced.
  for (const it of rest) if (!landed.has(key(it.chain))) each(it.chain, null);
  o.onProgress(null, total, total);
  return true;
}
