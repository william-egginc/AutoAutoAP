/**
 * @module explorer/accountTop
 * @description One account's best plans, from every table it has stored.
 *
 * Each stored table lists every plan one run priced, and inside one table every plan shares one
 * save, so the table's own ranking is by total days. ACROSS an account's tables it is not: a table
 * made a day later counts every plan from a day later, so the same plan shows a day fewer. What does
 * compare between one account's tables is the FINISH DATE, the run's plan start plus the plan's
 * days (the page's rule, and the Leaderboard's). So the tables are merged on finish date.
 *
 * A PLAN IS A ROUTE UNDER SETTINGS. A route priced with a schedule and the same route priced any time
 * are two plans, and so are "prestige now" and "finish the current run first" (Halceyx's two 277 490
 * tables from one save). Plans are keyed by route plus the settings the Leaderboard's `samePlan`
 * reads (`samePlanSettings`: schedule, held shifts, the finish-the-current-run switch, time off), so
 * one table never overwrites another's measurement made under different settings. Two plans listed
 * with one route carry the settings they differ on as tags (`tags`), in the runs table's words.
 *
 * ONE PLAN, ONE MEASUREMENT: THE NEWEST. Two tables often price the same plan (a 2-ascension sweep
 * run again after a few days). The newer table measured it from the account as it is now, so that
 * measurement stands and the older one is dropped, the page's "newest measurement stands" rule, and
 * how many were merged is counted so the page can say so. "Newer" is a LATER PLAN START only: two
 * tables from one start are one save, and when their settings differ they are two plans side by
 * side. A row sent before the finish-the-current-run switch existed did not record it, and matches
 * either answer (as on the Leaderboard); each measurement is dropped for the newest later one it
 * matches, so the answer never depends on the order the tables arrived in.
 *
 * A PLAN THE ACCOUNT HAS PASSED PART OF IS KEPT, UNDER WHAT IS LEFT OF IT. A table from 24 Sep can list
 * `199 225 255 290 324 490` for an account at TE 198; once a newer table shows the account at TE
 * 199, the 199 checkpoint is behind it -- very likely because it followed that plan. So, as the
 * Leaderboard's `samePlan` does, every measurement is matched on `remainingChain` at the highest TE a
 * LATER table shows: the old measurement of the whole plan and a newer table's measurement of
 * `225 255 290 324 490` are one plan, and the newer one stands. When no newer table priced what is
 * left, the old measurement stays, listed under its full route with the passed checkpoints marked
 * (`passed`), since its finish date is still that plan's. Only TE shown by the tables loaded is used.
 *
 * Only tables of runs whose finish still stands are merged (`accountTables`): a what-if's start never
 * happened, and a replaced run's plans were measured again by the run that replaced it.
 */
import type { PricedChain } from '@/search/types';
import {
  DAY_MS,
  remainingChain,
  rowFirstAscension,
  samePlanSettings,
  scheduleText,
  stateTag,
  type BoardRow,
} from '@/lib/leaderboardRank';
import { FIRST_ASCENSION_WORDS } from '@/search/firstAscension';
import type { CollectorRow } from './collector';
import { accountKey, timeOffKey, type FinishJudgement } from './analysis';

/** The settings every plan in one table was priced under: the run's own. */
export type PlanSettings = Pick<BoardRow, 'window' | 'holdShifts' | 'forceContinue' | 'firstAscension' | 'timeOff'>;

/** One stored table, read and ready to merge. */
export interface AccountTable {
  /** The run it belongs to. */
  id: string;
  /** The run's plan start, as an instant (ms): `judgeFinishes`' `start`. */
  start: number;
  /** When the run was sent (ISO), to order two tables of one plan from one start. '' when unknown. */
  sent?: string;
  /** The TE the table was priced from (its header, else the row's). */
  currentTE: number;
  /** The run's settings (its row). Left out: any time, shifts not held, no time off, not recorded. */
  settings?: PlanSettings;
  /** The table's plans (`parseRunCsv`), each once. */
  chains: readonly PricedChain[];
}

/** One plan in the account's list, as its newest table measured it. */
export interface TopPlan {
  /** Route plus settings: unique in the list. */
  key: string;
  /** The route as that table priced it, `199 225 255 290 324 490`. */
  chain: number[];
  /** Checkpoints of `chain` a later table shows the account already at or past: empty for most. */
  passed: number[];
  /** `chain` without `passed`: what the account still has to do, and what later tables match. */
  rest: number[];
  /** Ascensions of `chain`, as the run that priced it counted them. */
  ascensions: number;
  /** Days from that table's plan start. Compare only within one table; across them use `finish`. */
  days: number;
  start: number;
  /** `start` plus `days`, as an instant (ms). What the list is ranked by. */
  finish: number;
  /** The run whose table this measurement came from. */
  id: string;
  settings: PlanSettings;
  /**
   * What tells this plan from another listed with the same route but other settings, in the runs
   * table's words (`settingTags`): `prestiges now`, `every day 06:00-00:00`, `any time` … Empty when
   * no other plan listed has its route.
   */
  tags: string[];
  /** How many of the tables priced this plan (or what is left of it). The newest one is kept. */
  measurements: number;
}

export interface AccountTop {
  /** Every distinct plan, earliest finish first. */
  plans: TopPlan[];
  /** Older measurements dropped because a newer table priced the same plan, or what is left of it. */
  merged: number;
  /** Plans priced by more than one table. */
  mergedPlans: number;
  /** Plans listed with a checkpoint a newer table shows the account past (no newer table priced the rest). */
  passed: number;
  /** Measurements with a passed checkpoint that a newer table's measurement of the rest replaced. */
  restRepriced: number;
  /** Tables merged. */
  tables: number;
  /**
   * What became of one table's measurement of one route: the plan it is listed under (its own
   * measurement, or the newer one that replaced it), or null when that table did not price it.
   */
  locate(
    route: readonly number[],
    settings: PlanSettings | undefined,
    id: string
  ): { plan: TopPlan; own: boolean } | null;
}

interface Slot {
  key: string;
  /** Settings without the finish-the-current-run switch, which matches loosely. */
  base: string;
  chain: number[];
  days: number;
  start: number;
  sent: string;
  id: string;
  settings: PlanSettings;
  /** Tables that priced this exact route under these exact settings. */
  count: number;
  /** Those tables other than `id`'s. */
  others?: string[];
}

const baseKey = (s: PlanSettings) => JSON.stringify([s.window || '', !!s.holdShifts, timeOffKey(s)]);
// The boolean's old keys for Continue Asc. and Fastest ('fc', 'now'), so the order rows sort in holds.
const FIRST_KEYS: Record<string, string> = { continue: 'fc', auto: 'now', fresh: 'fresh' };
const firstKey = (s: PlanSettings) => FIRST_KEYS[rowFirstAscension(s) ?? ''] ?? '?';
const slotKey = (s: PlanSettings, route: readonly number[]) => `${baseKey(s)}|${firstKey(s)}|${route.join(' ')}`;

/** The Leaderboard's test for "the same plan's settings", at one target (the page's). */
const sameSettings = (a: PlanSettings, b: PlanSettings) => samePlanSettings({ ...a, finalTE: 0 }, { ...b, finalTE: 0 });

/**
 * Of two later measurements that both match `m`, whether `o` is the one that replaces it rather than
 * `b`: the later start; from one start, the one with exactly `m`'s settings, then the later send.
 */
function replacesBefore(o: Slot, b: Slot, m: Slot): boolean {
  if (o.start !== b.start) return o.start > b.start;
  const oSame = firstKey(o.settings) === firstKey(m.settings);
  const bSame = firstKey(b.settings) === firstKey(m.settings);
  if (oSame !== bSame) return oSame;
  if (o.sent !== b.sent) return o.sent > b.sent;
  return o.key < b.key;
}

/** The words the runs table uses (`settingTags`, `runTags`, `scheduleText`), for one setting. */
function settingWords(s: PlanSettings, differs: { first: boolean; held: boolean; window: boolean; off: boolean }) {
  const tags: string[] = [];
  const first = rowFirstAscension(s);
  if (differs.first && first) tags.push(FIRST_ASCENSION_WORDS[first]);
  if (differs.held) tags.push(s.holdShifts ? 'shifts held' : 'shifts not held');
  if (differs.window) tags.push(scheduleText(s.window));
  if (differs.off) tags.push(s.timeOff?.length ? 'time off' : 'no time off');
  return tags;
}

/**
 * Tables are added one at a time as they arrive, so the page need not hold every table's chains at
 * once (one can be 40,000 plans), only one entry per distinct plan. Keeping only the newest
 * measurement of each exact route and settings as tables arrive loses nothing: an account's TE only
 * goes up, so two measurements of one route are cut down to the same rest in `result`.
 */
export function createPlanMerger() {
  const slots = new Map<string, Slot>();
  const seen: { start: number; currentTE: number; settings: PlanSettings }[] = [];

  function add(table: AccountTable): void {
    const sent = table.sent ?? '';
    const settings = table.settings ?? {};
    const base = baseKey(settings);
    seen.push({ start: table.start, currentTE: table.currentTE, settings });
    for (const c of table.chains) {
      if (!Number.isFinite(c.days) || c.chain.length < 1) continue;
      const key = slotKey(settings, c.chain);
      const held = slots.get(key);
      if (!held) {
        slots.set(key, {
          key,
          base,
          chain: c.chain,
          days: c.days,
          start: table.start,
          sent,
          id: table.id,
          settings,
          count: 1,
        });
        continue;
      }
      held.count++;
      // The same route under the same settings: the later start stands; from one start (one save)
      // the later send, which priced the same plan from the same save again.
      if (table.start > held.start || (table.start === held.start && sent > held.sent)) {
        (held.others ??= []).push(held.id);
        Object.assign(held, { chain: c.chain, days: c.days, start: table.start, sent, id: table.id });
      } else {
        (held.others ??= []).push(table.id);
      }
    }
  }

  function result(): AccountTop {
    // The highest TE any table shows the account at AFTER a given start.
    const laterTE = (start: number) =>
      seen.reduce((m, t) => (t.start > start && t.currentTE > m ? t.currentTE : m), -Infinity);

    interface Item {
      slot: Slot;
      rest: number[];
      passed: number[];
      /** The newest later measurement this one matches, which replaces it. */
      by: Item | null;
      measurements: number;
    }
    const groups = new Map<string, Item[]>();
    for (const slot of slots.values()) {
      const te = laterTE(slot.start);
      const rest = Number.isFinite(te) ? remainingChain(slot.chain, te) : slot.chain;
      const passed = rest.length < slot.chain.length ? slot.chain.slice(0, -1).filter(c => c <= te) : [];
      const item: Item = { slot, rest, passed, by: null, measurements: slot.count };
      const g = `${slot.base}|${rest.join(' ')}`;
      const list = groups.get(g);
      if (list) list.push(item);
      else groups.set(g, [item]);
    }

    const shown: Item[] = [];
    let total = 0;
    let restRepriced = 0;
    for (const group of groups.values()) {
      for (const m of group) {
        total += m.slot.count;
        for (const o of group) {
          if (o.slot.start <= m.slot.start || !sameSettings(o.slot.settings, m.slot.settings)) continue;
          if (!m.by || replacesBefore(o.slot, m.by.slot, m.slot)) m.by = o;
        }
      }
      for (const m of group) {
        if (!m.by) {
          shown.push(m);
          continue;
        }
        if (m.passed.length) restRepriced++;
        let w = m.by;
        while (w.by) w = w.by;
        w.measurements += m.slot.count;
      }
    }

    // Tag look-alikes, as the runs table does (`settingTags`): plans listed with the same route, with
    // the settings they differ on. A plan with no look-alike reads fine as it is.
    const lookAlikes = new Map<string, PlanSettings[]>();
    for (const m of shown) {
      const route = m.slot.chain.join(' ');
      const list = lookAlikes.get(route);
      if (list) list.push(m.slot.settings);
      else lookAlikes.set(route, [m.slot.settings]);
    }
    const tagsOf = (s: PlanSettings, route: string) => {
      const group = lookAlikes.get(route) ?? [];
      if (group.length < 2) return [];
      const differ = (f: (s: PlanSettings) => unknown) => new Set(group.map(f)).size > 1;
      return settingWords(s, {
        first: new Set(group.map(g => rowFirstAscension(g)).filter(v => v != null)).size > 1,
        held: differ(g => !!g.holdShifts),
        window: differ(g => g.window || ''),
        off: differ(g => timeOffKey(g)),
      });
    };

    const byItem = new Map<Item, TopPlan>();
    const plans: TopPlan[] = shown.map(m => {
      const s = m.slot;
      const plan: TopPlan = {
        key: s.key,
        chain: s.chain,
        passed: m.passed,
        rest: m.rest,
        ascensions: s.chain.length,
        days: s.days,
        start: s.start,
        finish: s.start + s.days * DAY_MS,
        id: s.id,
        settings: s.settings,
        tags: tagsOf(s.settings, s.chain.join(' ')),
        measurements: m.measurements,
      };
      byItem.set(m, plan);
      return plan;
    });
    plans.sort((a, b) => a.finish - b.finish || a.days - b.days || a.key.localeCompare(b.key));

    // Built on the first question only: the page asks once, and only when the list's first plan is
    // not the runs table's earliest finish.
    let winnerOf: Map<string, Item> | null = null;
    function locate(route: readonly number[], settings: PlanSettings | undefined, id: string) {
      const key = slotKey(settings ?? {}, route);
      const slot = slots.get(key);
      if (!slot || (slot.id !== id && !slot.others?.includes(id))) return null;
      if (!winnerOf) {
        winnerOf = new Map();
        for (const group of groups.values()) {
          for (const m of group) {
            let w = m;
            while (w.by) w = w.by;
            winnerOf.set(m.slot.key, w);
          }
        }
      }
      const w = winnerOf.get(key);
      const plan = w && byItem.get(w);
      return plan ? { plan, own: plan.key === key && plan.id === id } : null;
    }

    return {
      plans,
      merged: total - plans.length,
      mergedPlans: plans.filter(p => p.measurements > 1).length,
      passed: plans.filter(p => p.passed.length).length,
      restRepriced,
      tables: seen.length,
      locate,
    };
  }

  return { add, result };
}

/** Every table at once: `createPlanMerger` for a caller that already has them all. */
export function mergeAccountTables(tables: readonly AccountTable[]): AccountTop {
  const merger = createPlanMerger();
  for (const t of tables) merger.add(t);
  return merger.result();
}

/** The earliest-finishing plan at each ascension count, earliest first: `plans` must be ranked. */
export function bestPerAscensions(plans: readonly TopPlan[]): TopPlan[] {
  const seen = new Set<number>();
  return plans.filter(p => {
    if (seen.has(p.ascensions)) return false;
    seen.add(p.ascensions);
    return true;
  });
}

/** Stored tables of the account that were not used, one entry per reason. */
export interface LeftOut {
  /** Short, as the page shows it after the number of runs: `replaced`, `what-if`, `to 300 TE` … */
  tag: string;
  /** The runs' own reasons in player words, for the tooltip. */
  reasons: string[];
  runs: number;
}

/** `11 runs to 490 TE`, `1 what-if`: how the page lists a reason tables were left out. */
export function leftOutText(l: Pick<LeftOut, 'tag' | 'runs'>): string {
  return /^to /.test(l.tag) ? `${l.runs} run${l.runs === 1 ? '' : 's'} ${l.tag}` : `${l.runs} ${l.tag}`;
}

export interface AccountTables {
  /** Runs whose table will be merged: at the target, a table stored, a finish that stands. */
  load: CollectorRow[];
  left: LeftOut[];
  /** The account's runs at the target with no table stored, whose plans the list cannot include. */
  noTable: number;
}

/**
 * Which of an account's stored tables to merge. `judged` is `judgeFinishes` at `finalTE`; a run it
 * does not know (another target) or whose finish does not stand is left out, with why.
 */
export function accountTables(
  rows: readonly CollectorRow[],
  key: string,
  finalTE: number,
  judged: FinishJudgement
): AccountTables {
  const load: CollectorRow[] = [];
  const left = new Map<string, LeftOut>();
  let noTable = 0;
  const leave = (tag: string, reason: string) => {
    const bucket = left.get(tag) ?? { tag, reasons: [], runs: 0 };
    bucket.runs++;
    if (reason && !bucket.reasons.includes(reason)) bucket.reasons.push(reason);
    left.set(tag, bucket);
  };
  for (const r of rows) {
    if (accountKey(r) !== key) continue;
    if (!r.hasCsv) {
      if (r.finalTE === finalTE) noTable++;
      continue;
    }
    if (r.finalTE !== finalTE) {
      leave(
        `to ${r.finalTE} TE`,
        `planned to ${r.finalTE} TE, not ${finalTE}: finishes at another target do not compare`
      );
      continue;
    }
    const j = judged.byId.get(r.id);
    if (!j) {
      leave('not judged', 'not among the runs whose finishes the page judged');
      continue;
    }
    if (!j.standing) {
      leave(stateTag(j.state) || j.state, j.reason);
      continue;
    }
    if (j.start == null) {
      leave('no date', 'no plan start, so no finish date');
      continue;
    }
    load.push(r);
  }
  return { load, left: [...left.values()].sort((a, b) => b.runs - a.runs || a.tag.localeCompare(b.tag)), noTable };
}
