<!--
  My runs' Next steps (lib/myRunsDashboard.ts `buildSteps`): what to do about your runs, each item with a
  one-line reason and one button. The first few show; the rest fold under "n more". Nothing to flag: one
  calm line. No runs at all: the Egg Day item and a line on how runs get here.
-->
<template>
  <section
    class="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3 sm:p-4 space-y-2"
    aria-label="Next steps"
    data-testid="my-runs-steps"
  >
    <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-700">Next steps</h3>
    <p v-if="state.loading" class="text-[11px] text-slate-500" data-testid="my-runs-steps-loading">
      Checking your runs on the board…
    </p>
    <p
      v-if="!state.loading && !state.steps.length"
      class="text-[11px] text-emerald-800 font-semibold"
      data-testid="my-runs-steps-none"
    >
      Nothing to flag: your runs look current.
    </p>
    <ul v-if="shown.length" class="space-y-2">
      <li v-for="s in shown" :key="s.id" v-bind="itemAttrs(s)">
        <div class="min-w-0 flex gap-2">
          <span aria-hidden="true" class="mt-0.5 text-[11px]" :class="s.info ? 'text-slate-400' : 'text-emerald-700'">{{
            s.info ? 'ⓘ' : '☐'
          }}</span>
          <div class="min-w-0">
            <p class="text-[12px] font-bold text-slate-900 leading-snug">{{ s.text }}</p>
            <p class="text-[11px] text-slate-600 leading-snug">{{ s.reason }}</p>
          </div>
        </div>
        <button type="button" :class="buttonClass(s)" :data-testid="`my-runs-step-${s.id}-button`" @click="act(s)">
          {{ s.button }}
        </button>
      </li>
    </ul>
    <details v-if="more.length" data-testid="my-runs-steps-more">
      <summary class="cursor-pointer text-[10px] font-black uppercase tracking-widest text-emerald-800">
        {{ more.length }} more
      </summary>
      <ul class="mt-2 space-y-2">
        <li v-for="s in more" :key="s.id" v-bind="itemAttrs(s)">
          <div class="min-w-0 flex gap-2">
            <span
              aria-hidden="true"
              class="mt-0.5 text-[11px]"
              :class="s.info ? 'text-slate-400' : 'text-emerald-700'"
              >{{ s.info ? 'ⓘ' : '☐' }}</span
            >
            <div class="min-w-0">
              <p class="text-[12px] font-bold text-slate-900 leading-snug">{{ s.text }}</p>
              <p class="text-[11px] text-slate-600 leading-snug">{{ s.reason }}</p>
            </div>
          </div>
          <button type="button" :class="buttonClass(s)" :data-testid="`my-runs-step-${s.id}-button`" @click="act(s)">
            {{ s.button }}
          </button>
        </li>
      </ul>
    </details>
    <p v-if="state.noRuns" class="text-[11px] text-slate-600 leading-relaxed" data-testid="my-runs-steps-guide">
      Nothing here yet. Run a search on {{ fastestName() }} or {{ NAMES.byDate }}, then share it or save it: it shows up
      here.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NAMES, fastestName } from '@/lib/siteNav';
import { STEPS_SHOWN, type DashAction, type DashStep, type DashSteps } from '@/lib/myRunsDashboard';

const props = defineProps<{ state: DashSteps }>();
const emit = defineEmits<{ act: [to: DashAction] }>();

const shown = computed(() => props.state.steps.slice(0, STEPS_SHOWN));
const more = computed(() => props.state.steps.slice(STEPS_SHOWN));

function itemAttrs(s: DashStep) {
  return {
    class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2',
    'data-testid': `my-runs-step-${s.id}`,
  };
}

function buttonClass(s: DashStep): string {
  return [
    'self-start sm:self-auto shrink-0 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest',
    s.info
      ? 'border border-slate-300 text-slate-600 hover:border-slate-400'
      : 'bg-emerald-600 text-white hover:bg-emerald-700',
  ].join(' ');
}

function act(s: DashStep): void {
  emit('act', s.action);
}
</script>
