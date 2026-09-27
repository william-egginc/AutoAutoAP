<!--
  Which sale plan wins each leg? One mark per leg of the plans that still stand, placed by where the
  leg starts (across) and how much TE it climbs (up), coloured by the sale plan the planner picked.

  WHY IT COMPARES ACROSS ACCOUNTS. The sale plan is a choice made for one leg, given where it starts
  and where it has to get to, against a sale calendar every account shares. It is a per-leg quantity
  placed by TE, which travels between accounts where a total never does (saleChoice.ts). Leg 1 is left
  out: it is the rest of the ascension in progress, so it starts wherever the player happened to be.

  COLOUR HERE IS THE SALE PLAN, NOT AN ACCOUNT, although it is the page's palette. Each plan also has
  its own shape, for readers who cannot tell the hues apart. Legs that unlock research tier 13 are
  drawn larger with a dark ring. Marks on the same spot are fanned out a few pixels so each can be
  hovered; the value each is drawn at stays exact.

  It shows which plan the planner picked for the chains that won, never by how much it won: the stored
  runs keep the winning leg only.
-->
<template>
  <div class="space-y-2">
    <div v-if="legs.length" class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="mode in ZOOMS"
        :key="mode.id"
        type="button"
        class="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
        :class="
          zoom === mode.id
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
        "
        :aria-pressed="zoom === mode.id"
        @click="zoom = mode.id"
      >
        {{ mode.label }}
      </button>
      <span v-if="zoom === 'short' && above" class="text-[10px] font-bold text-slate-500">
        {{ above }} longer leg{{ above === 1 ? '' : 's' }} (mostly the last leg to the target) above {{ SHORT_TE }} TE,
        not drawn; they are in the table below
      </span>
    </div>

    <EChart v-if="legs.length" :option="option" height="380px" />
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No run here that still stands carried per-leg detail past its first leg.
    </p>

    <div
      v-if="legs.length"
      class="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] font-bold text-slate-500"
      aria-label="How to read the marks"
    >
      <span>Colour and shape are the sale plan, not an account; the legend counts legs.</span>
      <span class="inline-flex items-center gap-1">
        <span
          class="inline-block w-3 h-3 rounded-full border-[1.5px] border-slate-800 bg-slate-300"
          aria-hidden="true"
        />
        larger, ringed: the leg unlocks research tier 13 ({{ tier13 }} of {{ legs.length }})
      </span>
    </div>

    <!-- The title sits above the scroll box, not in a <caption>: a caption is as wide as the table, so on a
         phone it ran off the right edge and needed a sideways scroll to read. -->
    <p v-if="legs.length" class="text-[9px] font-black text-slate-400 uppercase tracking-widest" aria-hidden="true">
      The commonest sale plan, by where the leg starts and how much it climbs
    </p>
    <div v-if="legs.length" class="overflow-x-auto">
      <table class="w-full text-[11px]">
        <caption class="sr-only">
          The commonest sale plan, by where the leg starts and how much it climbs
        </caption>
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <th class="text-left py-1 pr-3">Starts at (TE)</th>
            <th v-for="g in summary.gains" :key="g.label" class="text-left py-1 pr-3">Climbs {{ g.label }} TE</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="(band, i) in summary.starts" :key="band.label">
            <th scope="row" class="text-left font-mono-premium font-normal text-slate-600 py-1 pr-3 whitespace-nowrap">
              {{ band.label }}
            </th>
            <td
              v-for="(cell, k) in summary.cells[i]"
              :key="k"
              class="py-1 pr-3 whitespace-nowrap"
              :title="cell ? cellTitle(cell) : 'No leg here'"
            >
              <template v-if="cell">
                <span
                  v-for="p in cell.top"
                  :key="p"
                  class="mr-0.5"
                  :style="{ color: colorAt(SALE_SLOT[p]) }"
                  aria-hidden="true"
                  >{{ SALE_GLYPH[p] }}</span
                >
                <b class="text-slate-700">{{ topText(cell) }}</b>
                <span class="ml-1 text-slate-500">{{ Math.round(cell.share * 100) }}%</span>
                <span class="ml-1 text-[10px] text-slate-400">n {{ cell.n }}</span>
              </template>
              <span v-else class="text-slate-300">—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 px-1 text-[10px] text-slate-500 leading-relaxed max-w-3xl">
        n counts legs; a leg one account sent in several runs counts once. A share under two thirds, or an n of one or
        two, is a lean rather than a rule. Hover a cell for every plan in it and how many accounts it comes from. This
        is which plan the planner picked for the winning chains, not by how much it won: the runs only keep the plan
        that won each leg.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import { finishDateText, localZone } from '@/lib/leaderboardRank';
import type { CollectorRow } from './collector';
import type { FinishJudgement } from './analysis';
import {
  overlapOffsets,
  SALE_GLYPH,
  SALE_PLANS,
  SALE_SLOT,
  SALE_SYMBOL,
  saleCellBreakdown,
  saleLegs,
  saleSummary,
  type SaleCell,
  type SaleLeg,
  type SalePlan,
} from './saleChoice';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{
  /** The runs the page shows at the picked target (Proofs only applied), every count. */
  rows: CollectorRow[];
  /** The page's `judgeFinishes`: only runs whose finish still stands are drawn. */
  judged: FinishJudgement;
  accountLabels: Map<string, string>;
}>();

/**
 * Legs up to 100 TE, or every leg. Three quarters of the legs climb under 85 TE and the last legs to
 * 490 climb up to 320; on one axis the short legs, where the choice turns, are squeezed into the
 * bottom tenth.
 */
type Zoom = 'short' | 'all';
const zoom = ref<Zoom>('short');
const SHORT_TE = 100;
const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'short', label: `Legs up to ${SHORT_TE} TE` },
  { id: 'all', label: 'Every leg' },
];

const viewZone = localZone();

const legs = computed(() => saleLegs(props.rows, props.judged));
const summary = computed(() => saleSummary(legs.value));

const planCounts = computed(() => {
  const counts: Record<SalePlan, number> = { '1-sale': 0, '2-sale': 0, '3-sale': 0, continue: 0 };
  for (const l of legs.value) counts[l.plan]++;
  return counts;
});
/** Plans that appear, in legend order: `continue` is a leg-1 strategy and usually absent. */
const plansShown = computed(() => SALE_PLANS.filter(p => planCounts.value[p] > 0));
const tier13 = computed(() => legs.value.filter(l => l.tier13).length);
const above = computed(() => legs.value.filter(l => l.gain > SHORT_TE).length);

function topText(cell: SaleCell): string {
  if (cell.top.length === 1) return cell.top[0];
  return `${cell.top.map(p => (p === 'continue' ? p : p.replace('-sale', ''))).join('/')}${cell.top.includes('continue') ? '' : '-sale'} (tie)`;
}

function cellTitle(cell: SaleCell): string {
  return `${saleCellBreakdown(cell)} · ${cell.n} leg${cell.n === 1 ? '' : 's'} from ${cell.accounts} account${cell.accounts === 1 ? '' : 's'}`;
}

/** What the tooltip reads off a mark. */
interface Tip {
  account: string;
  chain: string;
  leg: number;
  from: number;
  to: number;
  days: string;
  peak: string;
  strategy: string;
  shared: string;
}

function tipOf(l: SaleLeg): Tip {
  const finish = props.judged.byId.get(l.row.id)?.finish ?? null;
  const days =
    l.runs > 1 && l.daysHi - l.daysLo >= 0.05
      ? `${l.days.toFixed(1)} days (${l.daysLo.toFixed(1)}–${l.daysHi.toFixed(1)} across its runs)`
      : `${l.days.toFixed(1)} days`;
  return {
    account: props.accountLabels.get(l.accountKey) ?? 'an account',
    chain: `${l.row.chain.join(' ')} · from ${l.row.currentTE} TE · finishes ${finishDateText(finish, viewZone)}`,
    leg: l.leg,
    from: l.start,
    to: l.te,
    days,
    peak: Number.isFinite(l.peakQph) ? `${l.peakQph.toFixed(2)} q/hr` : 'not recorded',
    strategy: l.tier13 ? `${l.plan}, unlocks research tier 13` : l.plan,
    shared: l.runs > 1 ? `The same leg is in ${l.runs} of this account's standing runs; drawn once.` : '',
  };
}

const MARK_PX = 8;
const TIER13_PX = 11;

const option = computed<ChartOption>(() => {
  const short = zoom.value === 'short';
  const drawn = short ? legs.value.filter(l => l.gain <= SHORT_TE) : legs.value;
  const offsets = overlapOffsets(drawn);
  const starts = legs.value.map(l => l.start);
  const lo = starts.length ? Math.floor(Math.min(...starts) / 20) * 20 : 0;
  const hi = starts.length ? Math.ceil((Math.max(...starts) + 1) / 20) * 20 : 20;

  const series: ChartSeriesOption[] = plansShown.value.map(plan => ({
    name: plan,
    type: 'scatter' as const,
    color: colorAt(SALE_SLOT[plan]),
    symbol: SALE_SYMBOL[plan],
    symbolSize: MARK_PX,
    data: drawn
      .filter(l => l.plan === plan)
      .map(l => ({
        value: [l.start, l.gain],
        symbolSize: l.tier13 ? TIER13_PX : MARK_PX,
        symbolOffset: offsets.get(l.key) ?? [0, 0],
        itemStyle: l.tier13
          ? { borderColor: '#1e293b', borderWidth: 1.2, opacity: 0.9 }
          : { borderColor: '#ffffff', borderWidth: 1, opacity: 0.9 },
        tip: tipOf(l),
      })) as never,
    emphasis: { scale: 1.4 },
  }));

  return {
    grid: { left: 56, right: 16, top: 18, bottom: 70 },
    legend: {
      // One line that scrolls rather than wrapping onto the axis name; small icons so the three plans
      // fit on one line on a phone.
      type: 'scroll',
      bottom: 0,
      itemGap: 14,
      itemWidth: 12,
      itemHeight: 10,
      textStyle: { fontSize: 10, color: '#64748b' },
      data: plansShown.value.map(p => ({ name: p, icon: SALE_SYMBOL[p] })),
      // How many legs each plan won, so the legend says how much each colour stands for.
      formatter: (name: string) => `${name} (${planCounts.value[name as SalePlan] ?? 0})`,
    },
    tooltip: {
      trigger: 'item',
      // Kept inside the chart and wrapped, so it fits a phone.
      confine: true,
      extraCssText: 'max-width: min(320px, 86vw); white-space: normal;',
      formatter: raw => {
        const params = raw as { data?: { tip?: Tip } };
        const t = params.data?.tip;
        if (!t) return '';
        // Escaped throughout: the account name comes from submitted nicknames, and this string
        // becomes innerHTML. See lib/charts/tooltip.ts.
        const shared = t.shared ? `<br/><span style="color:#64748b">${esc(t.shared)}</span>` : '';
        return (
          `<b>${esc(t.account)}</b><br/>` +
          `leg ${esc(t.leg)}: ${esc(t.from)} → ${esc(t.to)} TE (+${esc(t.to - t.from)}) · ${esc(t.strategy)}<br/>` +
          `${esc(t.days)} · peak delivery ${esc(t.peak)}<br/>` +
          `<span style="color:#94a3b8">${esc(t.chain)}</span>${shared}`
        );
      },
    },
    xAxis: {
      type: 'value',
      name: 'TE the leg starts at',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: AXIS_LABEL,
      min: lo,
      max: hi,
      // Every 20 TE, the same bands as the table under the chart.
      interval: 20,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: 'TE gained in the leg',
      nameTextStyle: AXIS_LABEL,
      min: 0,
      max: short ? SHORT_TE : undefined,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
