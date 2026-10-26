<!--
  "Prefer fewer ascensions" (Q6, search/preferFewer.ts): one line in the instant answer's counts card, above the
  table. Off, three ready-made margins and custom (Fastest in hours or days, By a date in TE). Remembered in this
  browser by InstantRoute; it only changes which route the green box leads with.
-->
<template>
  <div class="py-1 space-y-1" data-testid="prefer-fewer">
    <div
      class="flex flex-wrap items-center gap-1 text-small text-slate-600"
      role="radiogroup"
      aria-label="Prefer fewer ascensions"
    >
      <span class="mr-1 font-bold text-slate-700">Prefer fewer ascensions:</span>
      <button
        v-for="p in presets"
        :key="p.label"
        type="button"
        role="radio"
        :aria-checked="!customOpen && sameMargin(p.margin, modelValue)"
        class="min-h-[44px] sm:min-h-0 px-2 py-1 rounded-md border text-small font-bold"
        :class="!customOpen && sameMargin(p.margin, modelValue) ? ON : OFF"
        :data-testid="`prefer-fewer-${p.label}`"
        @click="pick(p.margin)"
      >
        {{ p.label }}
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="customOpen"
        class="min-h-[44px] sm:min-h-0 px-2 py-1 rounded-md border text-body font-bold"
        :class="customOpen ? ON : OFF"
        data-testid="prefer-fewer-custom"
        @click="openCustom"
      >
        custom…
      </button>
      <span v-if="customOpen" class="inline-flex items-center gap-1">
        within
        <input
          v-model.number="amount"
          type="number"
          min="0"
          :step="goal === 'fastest' ? 0.5 : 1"
          class="w-16 min-h-[44px] sm:min-h-0 rounded-md border-slate-300 py-0.5 px-1 text-body"
          :aria-label="goal === 'fastest' ? 'How much slower' : 'How many TE below'"
          data-testid="prefer-fewer-amount"
          @change="applyCustom"
        />
        <select
          v-if="goal === 'fastest'"
          v-model="unit"
          class="min-h-[44px] sm:min-h-0 rounded-md border-slate-300 py-0.5 pl-1 pr-6 text-body"
          aria-label="Hours or days"
          @change="applyCustom"
        >
          <option value="h">hours</option>
          <option value="d">days</option>
        </select>
        <template v-else>TE</template>
      </span>
    </div>
    <p class="text-small text-slate-500" data-testid="prefer-fewer-help">
      Picks the route with the fewest ascensions that is still within that margin of the
      {{ goal === 'fastest' ? 'fastest' : 'highest TE' }}. It only changes which route the green box shows.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  DATE_PRESETS,
  FASTEST_PRESETS,
  PREFER_OFF,
  sameMargin,
  type PreferGoal,
  type PreferMargin,
} from '@/search/preferFewer';

const props = defineProps<{ goal: PreferGoal; modelValue: PreferMargin }>();
const emit = defineEmits<{ 'update:modelValue': [PreferMargin] }>();

const ON = 'border-emerald-700 bg-emerald-700 text-white';
const OFF = 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400';

const presets = computed(() => (props.goal === 'fastest' ? FASTEST_PRESETS : DATE_PRESETS));
const isPreset = (m: PreferMargin) => presets.value.some(p => sameMargin(p.margin, m));

/** Custom is open when the value is not one of the ready-made ones, or the player pressed it. */
const customOpen = ref(!isPreset(props.modelValue));
const amount = ref<number | ''>('');
const unit = ref<'h' | 'd'>('h');
function fill(m: PreferMargin): void {
  if (m.kind === 'time') {
    const d = m.seconds / 86400;
    if (m.seconds >= 86400 && Number.isInteger(d * 2)) {
      unit.value = 'd';
      amount.value = d;
    } else {
      unit.value = 'h';
      amount.value = Math.round((m.seconds / 3600) * 10) / 10;
    }
  } else if (m.kind === 'te') amount.value = m.te;
}
fill(props.modelValue);
watch(
  () => props.modelValue,
  m => {
    if (!isPreset(m)) {
      customOpen.value = true;
      fill(m);
    }
  }
);

function pick(m: PreferMargin): void {
  customOpen.value = false;
  emit('update:modelValue', m);
}
function openCustom(): void {
  customOpen.value = true;
  if (amount.value === '') amount.value = props.goal === 'fastest' ? 6 : 3;
  applyCustom();
}
function applyCustom(): void {
  const v = typeof amount.value === 'number' && Number.isFinite(amount.value) ? Math.max(0, amount.value) : null;
  if (v === null) return;
  if (props.goal === 'fastest') {
    const seconds = Math.round(v * (unit.value === 'd' ? 86400 : 3600));
    emit('update:modelValue', seconds > 0 ? { kind: 'time', seconds } : PREFER_OFF);
  } else emit('update:modelValue', { kind: 'te', te: Math.round(v) });
}
</script>
