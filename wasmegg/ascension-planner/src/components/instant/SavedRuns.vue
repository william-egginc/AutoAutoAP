<!--
  Saved runs, on top of the Auto Planner tab: the plans saved from Find a run with "Save this plan"
  (instant/plansOnDevice.ts), newest first, kept in this browser only. A row opens to Open in the
  planner (Joo's Auto Planner on that route), Delete, Add shifts to calendar (the current ascension's
  shifts ahead from the entry's exact check; without one it runs the check first, ExactCheck.vue,
  and keeps the exact times in the entry), and its ascensions' starts and ends, marked estimate or exact.
-->
<template>
  <section
    class="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 sm:p-6 space-y-3 max-w-4xl mx-auto mt-4"
    data-testid="saved-runs"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-tight">Saved runs</h2>
        <p class="text-[11px] text-slate-500 leading-relaxed">
          Plans you saved from Find a run, kept on this device<template v-if="list.length"> ({{ list.length }})</template>.
        </p>
      </div>
      <button
        v-if="list.length"
        type="button"
        class="min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest"
        :class="armed === ALL ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500 hover:text-slate-700'"
        data-testid="saved-clear"
        @click="tap(ALL)"
      >
        {{ armed === ALL ? 'Tap again to clear all' : 'Clear all' }}
      </button>
    </div>

    <p v-if="!list.length" class="text-xs text-slate-500" data-testid="saved-empty">
      No saved runs yet. Find a run and press Save this plan.
    </p>
    <ul v-else class="divide-y divide-slate-100 border-t border-slate-100" data-testid="saved-list">
      <li v-for="p in list" :key="planId(p)" data-testid="saved-entry">
        <button
          type="button"
          class="w-full min-h-[44px] py-2 text-left text-xs text-slate-700 hover:bg-slate-50 rounded-lg"
          :aria-expanded="open === planId(p)"
          data-testid="saved-toggle"
          @click="open = open === planId(p) ? null : planId(p)"
        >
          <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span class="text-slate-400 w-3" aria-hidden="true">{{ open === planId(p) ? '▾' : '▸' }}</span>
            <span class="font-black text-slate-900">{{ savedTitle(p, timezone) }}</span>
            <span>· {{ p.chain.length }} asc ·</span>
            <span class="font-mono font-bold text-slate-900 tracking-wide break-words min-w-0">{{ p.chain.join(' ') }}</span>
          </span>
          <span class="block pl-5 text-[11px] text-slate-500" data-testid="saved-line">{{ line(p) }}</span>
        </button>

        <div v-if="open === planId(p)" class="pl-5 pb-3 space-y-3" data-testid="saved-open">
          <ExactCheck
            :check-key="keyOf(p)"
            :route="{ chain: p.chain, a1: p.a1, start: againStart(p) }"
            :timezone="timezone"
            :save-when="p.saveTime ? atText(p.saveTime, timezone) : 'your save'"
            :known="exactOfEntry(p)"
            :deadline="p.dated ? p.deadline : undefined"
            :show-check="false"
            :on-done="(r: ExactResult) => checked(p, r)"
            :now="props.now"
          >
            <button
              type="button"
              class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest"
              data-testid="saved-open-planner"
              @click="emit('open', { chain: [...p.chain], start: againStart(p), a1: p.a1 })"
            >
              Open in the planner
            </button>
            <button
              type="button"
              class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest"
              :class="armed === planId(p) ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500 hover:text-slate-700'"
              data-testid="saved-delete"
              @click="tap(planId(p))"
            >
              {{ armed === planId(p) ? 'Tap again to delete' : 'Delete' }}
            </button>
          </ExactCheck>
          <table v-if="p.ascensions.length" class="w-full text-left text-[11px] sm:text-xs" data-testid="saved-times">
            <thead>
              <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400">
                <th class="py-1.5 pr-2 font-black">Ascension</th>
                <th class="py-1.5 pr-2 font-black">Starts</th>
                <th class="py-1.5 font-black">Ends</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in p.ascensions" :key="i" class="border-t border-slate-100 align-top">
                <td class="py-1.5 pr-2 whitespace-nowrap">{{ i + 1 }} · {{ a.to }} TE</td>
                <td class="py-1.5 pr-2">{{ cellText(a.start, timezone, nowSeconds) }}</td>
                <td class="py-1.5">
                  {{ cellText(a.end, timezone, nowSeconds) }}
                  <span
                    class="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
                    :class="a.kind === 'exact' ? 'text-emerald-800 bg-emerald-50' : 'text-amber-800 bg-amber-50'"
                    data-testid="saved-kind"
                    >{{ a.kind }}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-[11px] text-slate-500">This older entry kept no ascension times.</p>
          <p v-if="p.gear || p.simVersion" class="text-[10px] text-slate-400">
            {{ [p.gear, p.simVersion ? `simulator ${p.simVersion}` : ''].filter(Boolean).join(' · ') }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import type { SimulateRequest } from '@/instant/simulatePlan';
import { saveSyncSeconds } from '@/instant/saveFarm';
import { atText, cellText } from '@/instant/findRun';
import { checkKey, exactOfEntry, withExact, type ExactResult } from '@/instant/exactCheck';
import ExactCheck from './ExactCheck.vue';
import { accountHash } from '@/instant/accountHash';
import {
  againStart,
  browserStorage,
  clearPlans,
  deletePlan,
  planId,
  readPlans,
  savedLine,
  savedTitle,
  updatePlan,
  type PlanEntry,
} from '@/instant/plansOnDevice';

const props = defineProps<{
  /** The loaded account; only its hash (Joo's hashID) is used, as the list's key. */
  playerId?: string;
  /** A list to show instead of this browser's (specs). */
  plans?: PlanEntry[];
  /** Unix seconds now (specs). */
  now?: number;
  /** The entry opened at first (specs: its planId). */
  opened?: string;
}>();
const emit = defineEmits<{ open: [req: SimulateRequest] }>();

const planner = useAutoPlannerStore();
const initialState = useInitialStateStore();
const timezone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
/** The loaded save's time, to say which entries came from an older one. */
const currentSave = computed(() => saveSyncSeconds(initialState.rawBackup) || initialState.lastBackupTime || 0);

const list = ref<PlanEntry[]>(props.plans ?? []);
const hash = ref<string | null>(null);
const open = ref<string | null>(props.opened ?? null);
const nowSeconds = ref(props.now ?? Math.floor(Date.now() / 1000));
let clock: ReturnType<typeof setInterval> | undefined;

/** The exact check's memory key for an entry (the save it came from, its goal, route and first build). */
function keyOf(p: PlanEntry): string {
  return checkKey({ saveTime: p.saveTime ?? 0, goal: p.goal, chain: p.chain, a1: p.a1 });
}

/** A check run from here finished: the entry keeps the exact times, the shifts and the next shift. */
function checked(p: PlanEntry, r: ExactResult): void {
  const updated = withExact(p, r, Math.floor(Date.now() / 1000), currentSave.value || undefined);
  list.value = props.plans ? list.value.map(e => (planId(e) === planId(p) ? updated : e)) : updatePlan(browserStorage(), hash.value, updated);
}

function line(p: PlanEntry): string {
  return savedLine(p, currentSave.value, nowSeconds.value, timezone.value);
}

onMounted(() => {
  if (props.now === undefined) clock = setInterval(() => (nowSeconds.value = Math.floor(Date.now() / 1000)), 60_000);
  if (props.plans) return;
  watch(
    () => props.playerId,
    async () => {
      hash.value = await accountHash(props.playerId);
      list.value = readPlans(browserStorage(), hash.value);
    },
    { immediate: true }
  );
});

/** Delete and Clear all ask for a second tap within 4 seconds. */
const ALL = '\u0000all';
const armed = ref<string | null>(null);
let disarm: ReturnType<typeof setTimeout> | undefined;
function tap(what: string): void {
  clearTimeout(disarm);
  if (armed.value === what) {
    armed.value = null;
    if (what === ALL) {
      if (!props.plans) clearPlans(browserStorage(), hash.value);
      list.value = [];
    } else {
      list.value = props.plans ? list.value.filter(e => planId(e) !== what) : deletePlan(browserStorage(), hash.value, what);
      if (open.value === what) open.value = null;
    }
    return;
  }
  armed.value = what;
  disarm = setTimeout(() => (armed.value = null), 4000);
}
onBeforeUnmount(() => {
  clearTimeout(disarm);
  if (clock) clearInterval(clock);
});
</script>
