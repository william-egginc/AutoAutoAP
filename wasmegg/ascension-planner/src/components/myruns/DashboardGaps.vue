<!--
  My runs' Next steps (lib/myRunsDashboard.ts `buildSteps`, reworked 24 Oct 2026): only what changes what to do, each
  item with a one-line reason and one button. The first few show; the rest fold under "n more". Nothing to do: one
  calm line.
-->
<template>
  <section
    class="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3 sm:p-4 space-y-2"
    aria-label="Next steps"
    data-testid="my-runs-steps"
  >
    <p v-if="!state.steps.length" class="text-body text-emerald-800 font-semibold" data-testid="my-runs-steps-none">
      Nothing to change: keep following your route.
    </p>
    <ul v-if="shown.length" class="space-y-2">
      <li v-for="s in shown" :key="s.id" v-bind="itemAttrs(s)">
        <div class="min-w-0 flex gap-2">
          <span aria-hidden="true" class="mt-0.5 text-small text-emerald-700">☐</span>
          <div class="min-w-0">
            <p class="text-body font-bold text-slate-900">{{ s.text }}</p>
            <p class="text-body text-slate-600">{{ s.reason }}</p>
          </div>
        </div>
        <button type="button" :class="BUTTON" :data-testid="`my-runs-step-${s.id}-button`" @click="act(s)">
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
            <span aria-hidden="true" class="mt-0.5 text-small text-emerald-700">☐</span>
            <div class="min-w-0">
              <p class="text-body font-bold text-slate-900">{{ s.text }}</p>
              <p class="text-body text-slate-600">{{ s.reason }}</p>
            </div>
          </div>
          <button type="button" :class="BUTTON" :data-testid="`my-runs-step-${s.id}-button`" @click="act(s)">
            {{ s.button }}
          </button>
        </li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

/** 44 px tall on a phone (a tap target), compact beside the text from `sm` up. */
const BUTTON =
  'self-start sm:self-auto shrink-0 min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700';

function act(s: DashStep): void {
  emit('act', s.action);
}
</script>
