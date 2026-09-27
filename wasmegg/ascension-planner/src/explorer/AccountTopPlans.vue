<!--
  An account's best plans, from all its stored tables.

  Each stored table is every plan one run priced, so between them an account's tables hold far more
  than its runs' winners: the runners-up, the other counts, the plans one TE over. This merges them
  into one list, ranked by FINISH DATE (the run's plan start plus the plan's days), which is the one
  way plans from different saves of one account compare: a table made a day later counts every plan
  from a day later. Totals are shown only as each plan's own days on hover.

  Only runs whose finish still stands are used (analysis.ts `judgeFinishes`, the Leaderboard's rules):
  a what-if's start never happened, a replaced run was measured again by the run that replaced it,
  and a run to another target finishes somewhere else. The page says how many tables that leaves out
  and why. A plan is a route under the run's settings, so tables priced with a schedule or "prestige
  now" never overwrite each other; a plan two tables priced keeps its newest measurement; and a plan
  with a checkpoint a newer table shows the account past is matched on what is left of it, so a newer
  table's measurement of that rest stands and, with none, the old one is kept with the passed
  checkpoint struck through (accountTop.ts).

  The tables are the big objects on this page (up to 15 MB each, and an account can have twenty), so
  nothing is fetched until the button is pressed; they come one at a time, the list updates as each
  one lands, and Cancel keeps what has arrived.
-->
<template>
  <div class="space-y-3">
    <div v-if="accounts.length" class="flex flex-wrap items-end gap-3">
      <label class="space-y-1">
        <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Account</span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: colour }" aria-hidden="true" />
          <select v-model="account" class="rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] bg-white">
            <option v-for="a in accounts" :key="a.key" :value="a.key">
              {{ a.label }} · {{ a.stored }} table{{ a.stored === 1 ? '' : 's' }}
            </option>
          </select>
        </span>
      </label>
      <button
        v-if="!loading"
        type="button"
        class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white disabled:opacity-40"
        :disabled="!tables.load.length || (!!shown && !shown.cancelled)"
        @click="load"
      >
        {{
          shown && !shown.cancelled
            ? 'All loaded'
            : `Load ${tables.load.length} table${tables.load.length === 1 ? '' : 's'}`
        }}
      </button>
      <template v-else>
        <span class="text-[11px] font-bold text-slate-600 py-1.5" role="status">Loading {{ progress }}…</span>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-300 text-slate-600 bg-white hover:border-slate-400"
          @click="cancel"
        >
          Cancel
        </button>
      </template>
      <div v-if="shown?.top.plans.length" class="ml-auto flex items-center gap-1.5">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Top</span>
        <button
          v-for="n in LIMITS"
          :key="n"
          type="button"
          class="px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors"
          :class="
            limit === n
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          "
          :aria-pressed="limit === n"
          @click="limit = n"
        >
          {{ n }}
        </button>
      </div>
    </div>
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No account has a table stored for a run to {{ finalTE }} TE yet.
    </p>

    <!-- What goes in, and what does not. -->
    <p v-if="accounts.length" class="text-[10px] text-slate-500 leading-relaxed px-1">
      <span>{{ inputs.head }}</span>
      <template v-if="tables.left.length">
        <span>{{ '; left out: ' }}</span>
        <span v-for="(l, i) in tables.left" :key="l.tag"
          ><span class="underline decoration-dotted cursor-help" :title="l.reasons.join('\n')">{{
            leftOutText(l)
          }}</span
          >{{ i < tables.left.length - 1 ? ', ' : '' }}</span
        >
      </template>
      <span>{{ `.${inputs.tail ? ' ' + inputs.tail : ''}` }}</span>
    </p>
    <p v-if="error" class="text-[11px] font-semibold text-rose-700 px-1">{{ error }}</p>

    <template v-if="shown && view">
      <p class="text-[10px] text-slate-500 leading-relaxed px-1">
        <b v-if="view.partial" class="text-slate-700">{{ view.partial }}</b> {{ view.summary }}
      </p>

      <div v-if="view.perCount.length > 1" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 text-[10px]">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Earliest at each count</span>
        <span v-for="p in view.perCount" :key="p.ascensions" :title="`${p.chain} · ${p.finishTitle}`">
          <b class="text-slate-700">{{ p.ascensions }} asc</b>
          <span class="ml-1 text-slate-600">{{ p.after }}</span>
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead>
            <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <th class="text-right py-1 pr-3">#</th>
              <th class="text-left py-1 pr-3">Plan</th>
              <th class="text-right py-1 pr-3">Asc</th>
              <th class="text-left py-1 pr-3" title="In your time zone; hover a date for the player's">Finishes</th>
              <th class="text-right py-1 pr-3">After earliest</th>
              <th class="text-left py-1 pr-3">From the run</th>
              <th
                class="text-left py-1"
                title="Planned from the same save as the first plan, so the gap is the plans alone"
              >
                Same save as #1
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="p in view.rows" :key="p.key" class="align-top">
              <td class="py-1.5 pr-3 text-right tabular-nums text-slate-400">{{ p.rank }}</td>
              <td class="py-1.5 pr-3 whitespace-nowrap" :title="p.chainTitle">
                <span class="font-mono text-slate-800"
                  ><template v-for="(c, k) in p.route" :key="k"
                    >{{ k ? ' ' : '' }}<s v-if="c.passed" class="text-slate-400">{{ c.te }}</s
                    ><template v-else>{{ c.te }}</template></template
                  ></span
                >
                <span v-if="p.measurements > 1" class="ml-1 text-[9px] font-bold text-slate-400"
                  >×{{ p.measurements }}</span
                >
                <!-- Under the route on a phone, so the tags do not push the dates off the screen. -->
                <span v-if="p.tags.length" class="block sm:inline"
                  ><span
                    v-for="t in p.tags"
                    :key="t"
                    class="mr-1 sm:mr-0 sm:ml-1 rounded bg-sky-100 px-1 font-sans text-[9px] font-black text-sky-800"
                    >{{ t }}</span
                  ></span
                >
              </td>
              <td class="py-1.5 pr-3 text-right tabular-nums text-slate-600">{{ p.ascensions }}</td>
              <td class="py-1.5 pr-3 whitespace-nowrap text-slate-700" :title="p.finishTitle">{{ p.finishText }}</td>
              <td
                class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                :class="p.earliest ? 'font-black text-emerald-700' : 'text-slate-600'"
              >
                {{ p.after }}
              </td>
              <td class="py-1.5 pr-3 whitespace-nowrap" :title="p.runTitle">
                <span class="whitespace-nowrap text-slate-600">{{ p.planned }}</span>
                <span class="text-[10px] text-slate-400"> · {{ p.how }}</span>
              </td>
              <td class="py-1.5 whitespace-nowrap text-[10px]" :title="p.saveTitle">
                <span v-if="p.save" class="font-bold text-slate-500">{{ p.save }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="view.anchorNote" class="text-[10px] text-slate-500 leading-relaxed px-1">{{ view.anchorNote }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { describeFetchError } from '@/utils/errors';
import {
  DAY_MS,
  finishDateText,
  finishTitle,
  formatDate,
  localZone,
  sameBuild,
  sameSave,
  signedDays,
} from '@/lib/leaderboardRank';
import type { CollectorRow } from './collector';
import { fetchRunCsv } from './collector';
import { accountKey, SAME_FINISH_DAYS, searchedOf, timeOffKey, type FinishJudgement } from './analysis';
import { accountTables, bestPerAscensions, createPlanMerger, leftOutText, type AccountTop } from './accountTop';
import { colorAt } from './palette';
import { parseAll } from './sweepStats';

const props = defineProps<{
  base: string;
  /** Runs on the page, copies folded (ChainExplorer's `usable`); every target is fine. */
  rows: CollectorRow[];
  /** `judgeFinishes` at `finalTE`: which runs still stand, and their plan starts. */
  judged: FinishJudgement;
  finalTE: number;
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

const LIMITS = [10, 25, 50] as const;
const limit = ref<(typeof LIMITS)[number]>(10);
const viewZone = localZone();

/** Accounts with a table stored for a run to the target, most tables first. */
const accounts = computed(() => {
  const stored = new Map<string, number>();
  for (const r of props.rows) {
    if (!r.hasCsv || r.finalTE !== props.finalTE) continue;
    const key = accountKey(r);
    stored.set(key, (stored.get(key) ?? 0) + 1);
  }
  return [...stored.entries()]
    .map(([key, n]) => ({ key, stored: n, label: props.accountLabels.get(key) ?? 'Unnamed account' }))
    .sort((a, b) => b.stored - a.stored || a.label.localeCompare(b.label));
});

const account = ref('');
// The account with the most stored tables, until one is picked; again if the pick disappears.
watch(
  accounts,
  list => {
    if (!list.some(a => a.key === account.value)) account.value = list[0]?.key ?? '';
  },
  { immediate: true }
);
const colour = computed(() => colorAt(props.accountColors.get(account.value) ?? 0));
const storedHere = computed(() => accounts.value.find(a => a.key === account.value)?.stored ?? 0);

const tables = computed(() => accountTables(props.rows, account.value, props.finalTE, props.judged));
/** The sentence under the picker: which of the account's tables go in, and what is missing. */
const inputs = computed(() => {
  const t = tables.value;
  const n = storedHere.value;
  const head = `${t.load.length} of this account's ${n} stored table${n === 1 ? '' : 's'} to ${props.finalTE} TE ${
    t.load.length === 1 ? 'is' : 'are'
  } from a run whose finish still stands`;
  const one = t.noTable === 1;
  const tail = t.noTable
    ? `${t.noTable} of its runs to ${props.finalTE} TE ${one ? 'has' : 'have'} no table stored, so only ${
        one ? 'its own best plan is' : 'their own best plans are'
      } known, and ${one ? 'it is' : 'they are'} not in this list.`
    : '';
  return { head, tail };
});

/** The load list, as one string: a result is shown only for the exact tables it was built from. */
const loadKey = computed(() => `${account.value}|${tables.value.load.map(r => r.id).join(',')}`);

interface Loaded {
  loadKey: string;
  top: AccountTop;
  /** The runs whose tables have arrived. */
  ids: string[];
  loaded: number;
  total: number;
  cancelled: boolean;
}
const result = shallowRef<Loaded | null>(null);
const shown = computed(() => (result.value?.loadKey === loadKey.value ? result.value : null));

const loading = ref(false);
const progress = ref('');
const error = ref('');
let controller: AbortController | null = null;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

async function load(): Promise<void> {
  controller?.abort();
  const c = new AbortController();
  controller = c;
  // Each run with its plan start as judged now: a refresh of the page mid-load must not move them.
  const todo = tables.value.load.flatMap(row => {
    const start = props.judged.byId.get(row.id)?.start;
    return start == null ? [] : [{ row, start }];
  });
  const key = loadKey.value;
  const merger = createPlanMerger();
  loading.value = true;
  error.value = '';
  const ids: string[] = [];
  result.value = { loadKey: key, top: merger.result(), ids: [], loaded: 0, total: todo.length, cancelled: false };
  try {
    for (let i = 0; i < todo.length; i++) {
      const { row, start } = todo[i];
      progress.value = `${i + 1} of ${todo.length}`;
      const text = await fetchRunCsv(props.base, row.id, c.signal);
      if (controller !== c) return;
      // Every chain: the cap keeps a table's fastest 60,000, and a slower one can still be the newest
      // measurement of a plan another table ranks near the top.
      const parsed = parseAll(text);
      merger.add({
        id: row.id,
        start,
        sent: row.submittedAt || row.receivedAt || '',
        currentTE: parsed.currentTE || row.currentTE,
        settings: row,
        chains: parsed.chains,
      });
      ids.push(row.id);
      result.value = {
        loadKey: key,
        top: merger.result(),
        ids: [...ids],
        loaded: i + 1,
        total: todo.length,
        cancelled: false,
      };
    }
  } catch (e) {
    if (controller !== c) return;
    if (isAbort(e)) {
      if (result.value) result.value = { ...result.value, cancelled: true };
    } else {
      error.value = describeFetchError(e, 'the collector');
      if (result.value) result.value = { ...result.value, cancelled: true };
    }
  } finally {
    if (controller === c) {
      loading.value = false;
      controller = null;
    }
  }
}

function cancel(): void {
  controller?.abort();
}

// A load belongs to one account: picking another stops it (what arrived is kept for that account
// until the next load replaces it).
watch(account, () => {
  if (loading.value) cancel();
  error.value = '';
});
onBeforeUnmount(() => controller?.abort());

const rowsById = computed(() => new Map(props.rows.map(r => [r.id, r])));

function plannedText(start: number): string {
  return formatDate(start, viewZone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** `earliest` for the first plan when it is the account's earliest, `same finish` for a tie with the
 *  earliest, else days after it. */
/**
 * Why the runs table's earliest finish is not this list's first plan, from what became of that run's
 * own measurement (accountTop.ts `locate`).
 */
function whyNotFirst(loaded: Loaded, bestFinish: number): string {
  const bestRow = tables.value.load.find(r => props.judged.byId.get(r.id)?.best);
  if (!bestRow) return "its run's table is not among these";
  if (!loaded.ids.includes(bestRow.id)) return "its run's table has not been loaded yet";
  const where = loaded.top.locate(bestRow.chain, bestRow, bestRow.id);
  if (!where) return "its run's table is here but does not list that plan";
  const later = signedDays((where.plan.finish - bestFinish) / DAY_MS).replace(/^\+/, '');
  if (where.own) return `its own table here puts that plan ${later} later than the run itself did`;
  const same = where.plan.chain.join(' ') === bestRow.chain.join(' ');
  const newer = rowsById.value.get(where.plan.id);
  const from = `a newer table (the run planned ${plannedText(where.plan.start)}, from ${newer?.currentTE ?? '?'} TE)`;
  return same
    ? `${from} priced that plan again from a later save, ${later} later, and the list keeps the newest measurement`
    : `the account has since passed ${bestRow.chain
        .slice(0, -1)
        .filter(c => !where.plan.chain.includes(c))
        .join(
          ', '
        )} TE, and ${from} priced what is left of that plan, ${where.plan.chain.join(' ')}, ${later} later; the list keeps the newest measurement`;
}

function afterText(days: number, first: boolean): string {
  if (days >= SAME_FINISH_DAYS) return signedDays(days);
  return first ? 'earliest' : 'same finish';
}

const view = computed(() => {
  const loaded = shown.value;
  if (!loaded?.top.plans.length) return null;
  const plans = loaded.top.plans;
  const first = plans[0];
  // The account's earliest finish: this list's first, unless a standing run whose table is not in
  // the list (none stored, or measured again by a newer table) finishes earlier.
  const judgedBest = props.judged.bestByAccount.get(account.value);
  const fromJudged = !!judgedBest && judgedBest.finish < first.finish - SAME_FINISH_DAYS * DAY_MS;
  const anchor = fromJudged && judgedBest ? judgedBest.finish : first.finish;
  const anchorNote =
    fromJudged && judgedBest
      ? `The account's earliest finish in the runs table is ${judgedBest.row.chain.join(' ')} (${judgedBest.row.ascensions} ascensions) on ${finishDateText(judgedBest.finish, viewZone)}, ${signedDays((first.finish - judgedBest.finish) / DAY_MS).replace(/^\+/, '')} before the first plan here: ${whyNotFirst(loaded, judgedBest.finish)}. "After earliest" counts from it.`
      : '';

  const bestRow = rowsById.value.get(first.id);
  const saveOf = (row: CollectorRow | undefined, id: string) => {
    if (id === first.id)
      return {
        save: 'same table',
        title: 'From the same table as the first plan: one save, so the gap is the plans alone.',
      };
    if (
      row &&
      bestRow &&
      sameSave(row, bestRow) &&
      sameBuild(row, bestRow) &&
      timeOffKey(row) === timeOffKey(bestRow)
    ) {
      return {
        save: 'same save',
        title: 'Planned from the same save as the first plan, by the same planner version: the gap is the plans alone.',
      };
    }
    return {
      save: '',
      title:
        'Planned from a different save than the first plan: finish dates still compare within an account, and part of the gap can be what changed in between.',
    };
  };

  const rows = plans.slice(0, limit.value).map((p, i) => {
    const row = rowsById.value.get(p.id);
    const tz = row?.timezone;
    const searched = row ? searchedOf(row) : null;
    const after = (p.finish - anchor) / DAY_MS;
    const save = saveOf(row, p.id);
    const passed = new Set(p.passed);
    const passedText = p.passed.length
      ? ` Struck through: a newer table shows the account already at or past ${p.passed.join(', ')} TE, most likely on this plan. No newer table priced the rest, ${p.rest.join(' ')}, so this measurement of the whole plan stands.`
      : '';
    return {
      key: p.key,
      rank: i + 1,
      route: p.chain.map(te => ({ te, passed: passed.has(te) })),
      tags: p.tags,
      ascensions: p.ascensions,
      measurements: p.measurements,
      chainTitle: `${p.days.toFixed(2)} days from that run's plan start (compare within one table only).${
        p.measurements > 1
          ? ` Priced by ${p.measurements} of these tables (some may have priced only what is left of it); this is the newest measurement.`
          : ''
      }${passedText}${p.tags.length ? ` Planned ${p.tags.join(', ')}.` : ''}`,
      finishText: finishDateText(p.finish, viewZone),
      finishTitle: finishTitle(p.finish, tz),
      after: afterText(after, i === 0 && !fromJudged),
      earliest: i === 0 && !fromJudged,
      planned: plannedText(p.start),
      how: searched?.how ?? '',
      runTitle: `Run ${p.id}, planned ${plannedText(p.start)} (your time) from ${row?.currentTE ?? '?'} TE. ${searched?.title ?? ''}${
        searched?.where ? ` Box: ${searched.where}.` : ''
      }`,
      save: save.save,
      saveTitle: save.title,
    };
  });

  const perCount = bestPerAscensions(plans).map(p => ({
    ascensions: p.ascensions,
    chain: p.key,
    after: afterText((p.finish - anchor) / DAY_MS, p === first && !fromJudged),
    finishTitle: `finishes ${finishDateText(p.finish, viewZone)}`,
  }));

  const top = loaded.top;
  const n = (v: number) => v.toLocaleString('en-US');
  const summary = [
    `${n(top.plans.length)} different plans.`,
    top.mergedPlans
      ? `${n(top.mergedPlans)} of them were priced by more than one table, and each shows only its newest measurement (${n(top.merged)} older ${top.merged === 1 ? 'one' : 'ones'} merged).`
      : '',
    top.restRepriced
      ? `${n(top.restRepriced)} ${top.restRepriced === 1 ? 'measurement' : 'measurements'} of plans with a checkpoint the account has since passed ${top.restRepriced === 1 ? 'was' : 'were'} replaced by a newer table's measurement of what is left.`
      : '',
    top.passed
      ? `${n(top.passed)} ${top.passed === 1 ? 'plan shows' : 'plans show'} a checkpoint struck through: a newer table shows the account past it and priced nothing of the rest, so the older measurement stands.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const partial =
    loaded.cancelled || loaded.loaded < loaded.total
      ? `From ${loaded.loaded} of ${loaded.total} tables${loaded.cancelled ? ' (stopped)' : ''}:`
      : '';

  return { rows, perCount, anchorNote, summary, partial };
});
</script>
