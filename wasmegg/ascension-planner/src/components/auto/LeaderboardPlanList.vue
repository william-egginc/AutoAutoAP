<!--
  One player's plans as a small table: route, finish date, days left, where it was planned from,
  and either the gap to their best plan or the reason it no longer counts. Used inside an opened
  Race line and on My plans, so a plan reads the same in both.

  The table scrolls sideways inside its own box rather than wrapping: on a phone a long route and a
  wrapped "Planned" line made every plan five lines tall. The box only scrolls when something
  around it gives it a width (the opened Race line does), so it never stretches its parent.
-->
<template>
  <div class="overflow-x-auto">
    <table class="w-full text-[11px]">
      <thead>
        <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-left">
          <th class="py-1.5 pr-3 w-4"></th>
          <th class="py-1.5 pr-3">Route</th>
          <th class="py-1.5 pr-3">{{ showReason ? 'Would finish' : 'Finishes' }}</th>
          <th class="py-1.5 pr-3 text-right">Days left</th>
          <th v-if="gapLabel" class="py-1.5 pr-3 text-right">{{ gapLabel }}</th>
          <th class="py-1.5 pr-3 text-right">From TE</th>
          <th class="py-1.5 pr-3">Planned</th>
          <th class="py-1.5 pr-3">Schedule</th>
          <th v-if="showReason" class="py-1.5 pr-3">Why it does not count</th>
          <th class="py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(p, i) in plans" :key="keyOf(p, i)">
          <tr class="border-t border-slate-100 align-top">
            <td class="py-1.5 pr-3">
              <button
                type="button"
                class="text-slate-400 hover:text-indigo-700"
                :aria-expanded="!!open[keyOf(p, i)]"
                :aria-label="`Show what ${p.row.chain.join(' ')} was simulated with`"
                @click="open[keyOf(p, i)] = !open[keyOf(p, i)]"
              >
                {{ open[keyOf(p, i)] ? '⌄' : '›' }}
              </button>
            </td>
            <td class="py-1.5 pr-3 whitespace-nowrap">
              <span class="font-mono font-bold text-slate-700">{{ p.row.chain.join(' ') }}</span>
              <span
                v-if="p.folded.copies.length > 1"
                class="ml-1.5 px-1 py-0.5 rounded bg-slate-200 text-[9px] font-black text-slate-600"
                :title="`The same result was sent ${p.folded.copies.length} times`"
                >sent ×{{ p.folded.copies.length }}</span
              >
              <span
                v-for="t in tags.get(p.row) ?? []"
                :key="t"
                class="ml-1.5 px-1 py-0.5 rounded bg-sky-100 text-[9px] font-black text-sky-800"
                >{{ t }}</span
              >
              <span
                v-if="stateTag(p.state)"
                class="ml-1.5 px-1 py-0.5 rounded bg-amber-100 text-[9px] font-black uppercase tracking-widest text-amber-800"
                >{{ stateTag(p.state) }}</span
              >
            </td>
            <td class="py-1.5 pr-3 whitespace-nowrap text-slate-700" :title="finishTitle(p.finish, p.row.timezone)">
              {{ finishDateText(p.finish, viewZone) }}
            </td>
            <td class="py-1.5 pr-3 text-right font-bold text-slate-700">{{ daysLeftText(p.finish, now, viewZone) }}</td>
            <td v-if="gapLabel" class="py-1.5 pr-3 text-right whitespace-nowrap">
              <span v-if="p === best" class="font-black text-emerald-700">best</span>
              <span v-else-if="gap(p) != null" class="font-bold text-slate-700">{{ signedDays(gap(p)!) }}</span>
              <span
                v-else
                class="text-slate-400"
                title="Planned from a different save, so the gap would mostly be the time between the two saves. Press Use to price it again from today's save."
                >other save</span
              >
            </td>
            <td class="py-1.5 pr-3 text-right text-slate-600">{{ p.row.currentTE ?? '—' }}</td>
            <td class="py-1.5 pr-3 text-slate-600 whitespace-nowrap">{{ plannedText(p) }}</td>
            <td class="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{{ p.row.window || 'any time' }}</td>
            <td v-if="showReason" class="py-1.5 pr-3 text-slate-600 min-w-[16rem]">{{ p.reason }}</td>
            <td class="py-1.5 text-right">
              <button
                type="button"
                class="px-2 py-0.5 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                :title="`Put ${p.row.chain.join(' ')} into the Auto Planner and price it on your account`"
                @click="emit('use', p.row.chain)"
              >
                Use
              </button>
            </td>
          </tr>
          <tr v-if="open[keyOf(p, i)]" class="bg-slate-50">
            <td :colspan="columns" class="px-3 py-3 space-y-3">
              <div v-if="p.earlier.length" class="text-[11px] text-slate-600">
                <span class="font-bold">Earlier runs of this plan:</span>
                <span v-for="(e, k) in p.earlier" :key="k">
                  {{ k ? ', ' : ' ' }}{{ plannedDay(e) }} (finish {{ finishDateText(e.finish, viewZone) }})
                </span>
              </div>
              <LeaderboardRunDetail :row="p.row" :copies="p.folded.copies" :csv-root="csvRoot" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';
import {
  daysLeftText,
  finishDateText,
  finishTitle,
  formatDate,
  gapToBest,
  plannedText,
  settingTags,
  signedDays,
  stateTag,
  type Plan,
} from '@/lib/leaderboardRank';

const props = defineProps<{
  plans: Plan[];
  /** All of the player's plans, current and dropped, for telling look-alike lines apart across
   *  both lists. Defaults to `plans`. */
  allPlans?: Plan[];
  /** The plan the gap column is measured against. */
  best?: Plan | null;
  now: number;
  /** The timezone finish dates and days left are shown in: the viewer's. */
  viewZone: string;
  csvRoot: string;
  /** Header of the gap column; no column without it. */
  gapLabel?: string;
  /** Show why each plan does not count. */
  showReason?: boolean;
}>();

const emit = defineEmits<{ use: [chain: number[]] }>();

/** Which plans are opened. Per plan, so opening a second one leaves the first open. */
const open = ref<Record<string, boolean>>({});

const columns = computed(() => 8 + (props.gapLabel ? 1 : 0) + (props.showReason ? 1 : 0));

/** Settings words for plans that have a look-alike (same route and start) among the player's plans. */
const tags = computed(() => settingTags((props.allPlans ?? props.plans).map(p => p.row)));

function keyOf(p: Plan, i: number): string {
  return p.row.id ?? `plan-${i}`;
}

function gap(p: Plan): number | null {
  return props.best ? gapToBest(p, props.best) : null;
}

function plannedDay(p: Plan): string {
  return formatDate(p.start, p.row.timezone, { day: 'numeric', month: 'short' });
}
</script>
