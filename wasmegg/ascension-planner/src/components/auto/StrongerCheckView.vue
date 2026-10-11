<!--
  What "Try: stronger check" shows (StrongerCheck.vue does the work; search/strongerCheck.ts the
  logic). Props in, three events out: simulate a route, start Refine, stop it. Laid out as a list,
  not a table, so it reads at phone width.
-->
<template>
  <div
    class="rounded-xl border px-3 py-2.5 space-y-2 text-[11px]"
    :class="on ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'"
    data-testid="stronger-check"
  >
    <label class="flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer">
      <input
        :checked="on"
        type="checkbox"
        class="rounded border-slate-300"
        data-testid="stronger-toggle"
        @change="emit('update:on', ($event.target as HTMLInputElement).checked)"
      />
      <span class="font-bold text-slate-800">Try: stronger check</span>
      <span class="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase tracking-widest"
        >prototype</span
      >
    </label>
    <p class="text-slate-500 leading-relaxed">
      After Check exactly, also prices your own earlier routes for this
      {{ deadline ? 'date, tries a TE lower when the top route misses it,' : 'target,' }} and can refine the best route
      with a small search around it. Uses the full simulator on your workers.
    </p>

    <template v-if="on">
      <p v-if="waitingFor" class="text-slate-500" data-testid="stronger-waiting">{{ waitingFor }}</p>

      <!-- Best now: whatever this box found that beats the answer above. -->
      <div
        v-if="bestNow"
        class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 space-y-0.5"
        data-testid="stronger-best"
      >
        <div class="text-[9px] font-black uppercase tracking-widest text-emerald-800">
          Best now · found by the stronger check
        </div>
        <div class="font-mono-premium text-[13px] font-black text-slate-900 break-words">
          {{ bestNow.p.chain.join(' → ') }}
        </div>
        <div class="text-[12px] text-slate-800">
          {{ resultText(bestNow.p)
          }}<span v-if="best" class="font-bold text-emerald-800"> · {{ versus(bestNow.p) }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
          <span>{{ bestNow.how }}</span>
          <button type="button" :class="smallButton" @click="emit('simulate', bestNow.p)">Simulate this plan</button>
        </div>
      </div>

      <p v-if="autoStatus === 'running'" class="text-indigo-900 flex items-center gap-2">
        <span
          class="inline-block w-2.5 h-2.5 shrink-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
        />
        {{ autoText }}
      </p>
      <p v-else-if="autoStatus === 'error'" class="text-amber-800">{{ autoText }}</p>

      <!-- a. Your earlier routes -->
      <div v-if="autoStatus === 'done' || earlier.length" class="space-y-1">
        <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">Your earlier routes</div>
        <p v-if="!earlier.length" class="text-slate-500" data-testid="stronger-no-earlier">
          None for this {{ deadline ? 'date' : 'target' }} beyond the routes above: nothing from your searches here,
          your saved {{ deadline ? 'answers' : 'searches' }}, your earlier checks, or your board runs sent from this
          browser.
        </p>
        <ul v-else class="space-y-1">
          <li
            v-for="e in earlier"
            :key="e.route.chain.join(',')"
            class="rounded-lg border bg-white px-2.5 py-1.5 space-y-0.5"
            :class="
              bestNow && e.made && key(bestNow.p.chain) === key(e.made.chain)
                ? 'border-emerald-300'
                : 'border-slate-200'
            "
            data-testid="stronger-earlier"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span class="font-mono-premium text-[12px] font-bold text-slate-800 break-words">{{
                e.route.chain.join(' → ')
              }}</span>
              <span
                class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest"
                >your earlier route</span
              >
            </div>
            <div class="text-slate-500">From {{ sourceLabel(e.route, showMs) }}</div>
            <div class="text-slate-700">
              <template v-if="!e.priced">The full simulator couldn't price it on this save.</template>
              <template v-else-if="deadline && !e.made">
                Misses the date on your account by {{ days(e.priced.end - deadline) }}, and one or two TE lower too.
              </template>
              <template v-else-if="e.made">
                <template v-if="deadline && key(e.made.chain) !== key(e.priced.chain)">
                  Misses the date as it was; with its last stop at {{ e.made.chain[e.made.chain.length - 1] }}:
                </template>
                {{ resultText(e.made)
                }}<span
                  v-if="best"
                  class="font-bold"
                  :class="beats(goal, e.made, best) ? 'text-emerald-800' : 'text-slate-500'"
                >
                  · {{ versus(e.made) }}</span
                >
              </template>
            </div>
            <button v-if="e.made" type="button" :class="smallButton" @click="emit('simulate', e.made)">
              Simulate this plan
            </button>
          </li>
        </ul>
      </div>

      <!-- b. A TE lower (by a date, when the top route misses) -->
      <div v-if="deadline && (steps.length || stepSkipped)" class="space-y-1" data-testid="stronger-step-down">
        <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">A TE lower</div>
        <p v-if="stepSkipped" class="text-slate-500">{{ stepSkipped }}</p>
        <p v-for="s in steps" :key="s.target" class="text-slate-700">
          <template v-if="s.made">
            The top route misses the date on your account, so the instant answer's fastest route to
            <b>{{ s.target }} TE</b> was checked:
            <span class="font-mono-premium">{{ s.made.chain.join(' ') }}</span> makes it with
            <b>{{ days(deadline - s.made.end) }}</b> to spare.
            <button type="button" :class="smallButton" class="ml-1" @click="emit('simulate', s.made)">
              Simulate this plan
            </button>
          </template>
          <template v-else-if="s.tried.length">
            The instant answer's fastest routes to {{ s.target }} TE miss the date on your account too (the closest by
            {{ days(Math.min(...s.tried.map(t => t.end)) - deadline) }}).
          </template>
          <template v-else>The instant answer has no route to {{ s.target }} TE.</template>
        </p>
      </div>

      <!-- c. Refine -->
      <div v-if="refine.plan" class="space-y-1.5 pt-2 border-t border-indigo-100" data-testid="stronger-refine">
        <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">Refine the best route</div>
        <template v-if="refine.status !== 'running'">
          <p class="text-slate-700">
            Around <span class="font-mono-premium">{{ refine.plan.base.chain.join(' ') }}</span
            >. {{ refine.plan.text }}
          </p>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!refine.can"
              :title="refine.blocked || 'Prices the routes near this one with the full simulator on your account'"
              data-testid="stronger-refine-go"
              @click="emit('refine')"
            >
              {{ refine.outcome ? 'Refine again' : 'Refine' }}
            </button>
            <span v-if="refine.blocked" class="text-slate-500">{{ refine.blocked }}</span>
          </div>
        </template>
        <template v-else>
          <div
            class="h-1.5 rounded-full bg-indigo-100 overflow-hidden"
            role="progressbar"
            :aria-valuenow="refine.percent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="h-full bg-indigo-600 transition-all" :style="{ width: `${refine.percent}%` }" />
          </div>
          <p class="text-indigo-900" data-testid="stronger-refine-progress">
            Checked {{ (refine.progress?.done ?? 0).toLocaleString() }} of
            {{ (refine.progress?.total ?? 0).toLocaleString() }} {{ deadline ? 'route shapes' : 'routes' }} ·
            {{ refine.timeLeft
            }}<template v-if="refine.progress && refine.progress.best !== refine.startBase">
              · best so far {{ compareText(goal, refine.progress.best, refine.startBase) }}</template
            >
          </p>
          <button
            type="button"
            class="px-3 py-1 rounded-lg border border-indigo-300 bg-white text-indigo-800 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50"
            @click="emit('stop')"
          >
            Stop
          </button>
        </template>
        <p
          v-if="refine.outcome && refine.status !== 'running'"
          class="text-slate-700"
          data-testid="stronger-refine-result"
        >
          <template v-if="refine.outcome.improved">
            <b class="text-emerald-800">Found a better route</b> among
            {{ refine.outcome.priced.toLocaleString() }} priced:
            <span class="font-mono-premium">{{ refine.outcome.best.chain.join(' ') }}</span
            >, {{ compareText(goal, refine.outcome.best, refine.startBase) }} than the route it started from.<template
              v-if="refine.outcome.stopped"
            >
              Stopped after {{ refine.outcome.done.toLocaleString() }} of
              {{ refine.outcome.total.toLocaleString() }}.</template
            >
          </template>
          <template v-else>
            Nothing better among {{ refine.outcome.priced.toLocaleString() }} routes priced within {{ RADIUS }} TE of
            each stop{{
              refine.outcome.stopped
                ? ` (stopped after ${refine.outcome.done.toLocaleString()} of ${refine.outcome.total.toLocaleString()})`
                : ''
            }}: this route holds.
          </template>
        </p>
        <p v-if="refine.status === 'error'" class="text-amber-800">{{ refine.error }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { showDateTime } from '@/lib/displayTime';
import {
  beats,
  compareText,
  key,
  RADIUS,
  sourceLabel,
  type EarlierPriced,
  type Goal,
  type Priced,
  type RefineView,
  type StepDownStep,
} from '@/search/strongerCheck';

const props = defineProps<{
  on: boolean;
  deadline?: number;
  target: number;
  zone: string;
  waitingFor: string;
  best: Priced | null;
  bestNow: { p: Priced; how: string } | null;
  autoStatus: 'idle' | 'running' | 'done' | 'error';
  autoText: string;
  earlier: EarlierPriced[];
  steps: StepDownStep[];
  stepSkipped: string;
  refine: RefineView;
}>();
const emit = defineEmits<{
  'update:on': [on: boolean];
  simulate: [p: Priced];
  refine: [];
  stop: [];
}>();

const goal = computed<Goal>(() =>
  props.deadline ? { kind: 'date', deadline: props.deadline } : { kind: 'fastest', target: props.target }
);
const smallButton =
  'px-2 py-0.5 rounded-md border border-slate-300 bg-white text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-800';

function show(unix: number): string {
  return showDateTime(unix, props.zone);
}
const showMs = (t: number) => show(t / 1000);
function days(seconds: number): string {
  return (Math.abs(seconds) / 86400).toFixed(2) + ' days';
}
function resultText(p: Priced): string {
  return props.deadline
    ? `${Math.floor(p.endTE)} TE · ${days(props.deadline - p.end)} to spare · reached ${show(p.end)}`
    : `Reaches ${props.target} on ${show(p.end)} · ${days(p.seconds)}`;
}
/** "0.42 days sooner than the answer above", "the same as the answer above". */
function versus(p: Priced): string {
  const c = compareText(goal.value, p, props.best);
  if (!c) return '';
  if (c.startsWith('misses')) return c;
  return `${c} ${c === 'the same' ? 'as' : 'than'} the answer above`;
}
</script>
