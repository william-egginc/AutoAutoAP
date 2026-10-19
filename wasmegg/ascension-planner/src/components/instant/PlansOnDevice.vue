<!--
  "Your plans on this device": the routes this browser opened with "Simulate this plan"
  (instant/plansOnDevice.ts), newest first, each with "Simulate again". Kept in this browser only.
-->
<template>
  <div
    class="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 sm:p-6 space-y-3"
    data-testid="plans-on-device"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-tight">Your plans on this device</h2>
        <p class="text-[11px] text-slate-500 leading-relaxed">Kept in this browser only; nothing is sent anywhere.</p>
      </div>
      <button
        v-if="plans.length"
        type="button"
        class="min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest"
        :class="
          armed ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500 hover:text-slate-700'
        "
        data-testid="plans-clear"
        @click="tapClear"
      >
        {{ armed ? 'Tap again to clear' : 'Clear' }}
      </button>
    </div>

    <p v-if="!plans.length" class="text-xs text-slate-500" data-testid="plans-empty">
      No plans yet: press Simulate this plan on a route above.
    </p>
    <ul v-else class="space-y-2" data-testid="plans-list">
      <li
        v-for="p in plans"
        :key="`${p.goal}|${p.chain.join(' ')}`"
        class="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 flex flex-wrap items-center gap-x-4 gap-y-2"
        data-testid="plan-entry"
      >
        <div class="flex-1 min-w-0 space-y-0.5">
          <div class="text-[10px] font-black uppercase tracking-widest text-indigo-600">{{ p.goal }}</div>
          <div class="font-mono text-xs text-slate-800 break-words">{{ routeText(p.chain) }}</div>
          <div class="text-[11px] text-slate-600">{{ resultOf(p) }}</div>
          <div class="text-[10px] text-slate-400">Simulated {{ when(p.simulatedAt / 1000) }}</div>
        </div>
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600 text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
          data-testid="plan-again"
          @click="emit('again', p)"
        >
          Simulate again
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { routeText, type PlanEntry } from '@/instant/plansOnDevice';

const props = defineProps<{ plans: PlanEntry[]; timezone: string }>();
const emit = defineEmits<{ again: [plan: PlanEntry]; clear: [] }>();

/** Clear asks for a second tap (within 4 seconds). */
const armed = ref(false);
let disarm: ReturnType<typeof setTimeout> | undefined;
function tapClear(): void {
  clearTimeout(disarm);
  if (armed.value) {
    armed.value = false;
    emit('clear');
    return;
  }
  armed.value = true;
  disarm = setTimeout(() => (armed.value = false), 4000);
}
onBeforeUnmount(() => clearTimeout(disarm));

function when(unix: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: props.timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(unix * 1000));
}
function resultOf(p: PlanEntry): string {
  if (p.te !== undefined) return `${p.te} TE${p.finishAt !== undefined ? `, last ascension ${when(p.finishAt)}` : ''}`;
  const days = p.days !== undefined ? `${p.days.toFixed(1)} d` : '';
  const at = p.finishAt !== undefined ? `finishes ${when(p.finishAt)}` : '';
  return [days, at].filter(Boolean).join(', ');
}
</script>
