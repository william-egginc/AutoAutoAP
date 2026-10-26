<template>
  <div class="space-y-6">
    <p class="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-6 leading-relaxed">
      Wait for Truth Eggs to accumulate by shipping eggs.
    </p>

    <!-- Current Egg Info -->
    <div class="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 shadow-inner">
      <div class="flex items-center gap-4 mb-4">
        <div
          class="w-12 h-12 rounded-2xl bg-white border border-slate-200/50 shadow-sm flex items-center justify-center p-2"
        >
          <img
            :src="iconURL(`egginc/egg_${virtueStore.currentEgg}.png`, 64)"
            class="w-full h-full object-contain"
            :alt="virtueStore.currentEgg"
          />
        </div>
        <div>
          <div class="text-sm font-bold text-slate-800">
            {{ VIRTUE_EGG_NAMES[virtueStore.currentEgg] }}
          </div>
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Egg</div>
        </div>
      </div>

      <!-- Current TE State -->
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
          <div class="text-slate-400 uppercase tracking-[0.2em] font-black">Metric</div>
          <div class="text-slate-400 uppercase tracking-[0.2em] font-black text-right">Value (Initial → Current)</div>

          <div class="text-slate-600 font-bold uppercase tracking-tight">Eggs Delivered:</div>
          <div class="tabular-nums text-right text-slate-700 font-bold">
            <span class="text-slate-300 font-normal">{{ formatNumber(initialEggsDelivered, 2) }}</span>
            <span class="mx-1 text-slate-200 font-normal">→</span>
            <span>{{ formatNumber(currentEggsDelivered, 2) }}</span>
          </div>

          <div
            class="text-slate-600 font-bold uppercase tracking-tight pt-2 border-t border-slate-100/50 flex items-center"
          >
            Shipped in Plan:
          </div>
          <div class="tabular-nums text-right text-slate-900 font-black pt-2 border-t border-slate-100/50 text-xs">
            {{ formatNumber(Math.max(0, currentEggsDelivered - initialEggsDelivered), 2) }}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 text-[10px] pt-3 border-t border-slate-100/50">
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 uppercase tracking-widest font-black">Claimed TE:</span>
              <span class="tabular-nums text-slate-700 font-bold">{{ claimedTE }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400 uppercase tracking-widest font-black">Pending TE:</span>
              <span class="tabular-nums text-slate-900 font-black">{{ pendingTE }}</span>
            </div>
          </div>
          <div class="flex flex-col justify-end text-right">
            <span class="text-slate-400 uppercase tracking-widest font-black">Total Progress:</span>
            <span class="tabular-nums font-bold text-slate-900 text-sm tracking-tighter"
              >{{ truthEggsStore.totalTE }} <span class="text-slate-300 font-normal">/ 490</span></span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Target TE Selection -->
    <div class="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div class="flex items-center gap-3 mb-5 pb-4 border-b border-slate-50">
        <div
          class="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center p-1.5 shadow-lg border border-slate-800"
        >
          <img :src="iconURL('egginc/egg_truth.png', 64)" class="w-full h-full object-contain" alt="Truth Egg" />
        </div>
        <span class="text-xs font-bold text-slate-700 uppercase tracking-tight">
          Gain Additional TE on {{ VIRTUE_EGG_NAMES[virtueStore.currentEgg] }}
        </span>
      </div>

      <!-- Target TE input with +/- buttons -->
      <div class="flex flex-col gap-3 mb-6">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add how many TE?</span>
        <div class="flex items-center gap-1">
          <button
            class="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-600 hover:bg-white hover:border-slate-200 transition-all active:scale-95 disabled:opacity-20 shadow-sm font-bold"
            :disabled="teToGain <= 1"
            @click="teToGain = Math.max(1, teToGain - 1)"
            v-tippy="minusButtonTooltip"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M20 12H4" />
            </svg>
          </button>
          <input
            ref="inputEl"
            v-model.lazy.number="teToGain"
            type="number"
            inputmode="numeric"
            step="1"
            :min="1"
            :max="98 - currentTE"
            @keydown="e => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()"
            class="flex-1 h-11 text-center text-sm tabular-nums font-bold bg-slate-50/50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none transition-all"
            :disabled="currentTE >= 98"
            @input="onBoxInput"
            @blur="onBoxLeave"
          />
          <button
            class="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-600 hover:bg-white hover:border-slate-200 transition-all active:scale-95 disabled:opacity-20 shadow-sm font-bold"
            :disabled="teToGain >= 98 - currentTE"
            @click="teToGain = Math.min(98 - currentTE, teToGain + 1)"
            v-tippy="plusButtonTooltip"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Calculated values -->
      <div v-if="teToGain > 0" class="space-y-3 bg-slate-50/30 rounded-xl p-4 border border-slate-50">
        <div class="flex justify-between items-center text-[10px]">
          <span class="font-black text-slate-400 uppercase tracking-widest">Reaches:</span>
          <span class="tabular-nums font-black text-slate-900">TE #{{ targetTENumber }}</span>
        </div>
        <div class="flex justify-between items-center text-[10px]">
          <span class="font-black text-slate-400 uppercase tracking-widest">TE to Gain:</span>
          <span class="tabular-nums font-black text-slate-900">+{{ teToGain }} TE</span>
        </div>
        <div class="flex justify-between items-center text-[10px]">
          <span class="font-black text-slate-400 uppercase tracking-widest">Eggs to Lay:</span>
          <span class="tabular-nums font-bold text-slate-700">{{ formatNumber(eggsToLay, 3) }}</span>
        </div>

        <div class="pt-2 mt-1 border-t border-slate-100/50 space-y-2">
          <div class="flex justify-between items-center text-[10px]">
            <div class="flex items-center gap-1">
              <span class="font-black text-slate-400 uppercase tracking-widest">Delivery Rate per hour:</span>
            </div>
            <span class="tabular-nums text-slate-500">{{ formatNumber(elrPerHour, 2) }}</span>
          </div>
          <div class="flex justify-between items-center text-[10px]">
            <div class="flex items-center gap-1">
              <span class="font-black text-slate-400 uppercase tracking-widest">Delivery Rate per day:</span>
            </div>
            <span class="tabular-nums text-slate-500">{{ formatNumber(elrPerDay, 2) }}</span>
          </div>
          <div class="flex justify-between items-center pt-2 mt-1 border-t border-slate-100/50 text-[10px]">
            <span class="font-black text-slate-400 uppercase tracking-widest">Time Required:</span>
            <span class="tabular-nums font-black text-slate-900">{{ formatDuration(timeToLaySeconds) }}</span>
          </div>
          <div class="flex justify-between items-center text-[10px]">
            <span class="font-black text-slate-400 uppercase tracking-widest">Completion Time:</span>
            <span class="tabular-nums font-black text-slate-900">{{ absoluteEarnedTime }}</span>
          </div>
        </div>
      </div>

      <!-- Wait button -->
      <button
        class="btn-premium btn-primary w-full mt-6 py-4 flex items-center justify-center gap-2 group disabled:opacity-20 shadow-lg shadow-slate-900/10"
        :disabled="!canWait"
        @click="handleWaitForTE"
      >
        <img
          :src="iconURL('egginc/egg_truth.png', 64)"
          class="w-5 h-5 object-contain group-hover:scale-110 transition-transform"
          alt="Truth Egg"
        />
        <span>Wait for TE</span>
      </button>
    </div>

    <!-- Not reachable notice -->
    <div
      v-if="teToGain > 0 && eggsToLay > 0 && !isTEWaitReachable(timeToLaySeconds)"
      class="bg-amber-50 border border-amber-100 rounded-2xl p-4"
    >
      <p class="text-[11px] font-bold text-amber-700 uppercase tracking-tight">
        TE #{{ targetTENumber }} is not reachable: it would take over a year at this farm's current delivery
        rate. Build up the farm first.
      </p>
    </div>

    <!-- Max TE notice -->
    <div v-if="currentTE >= 98" class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
      <div class="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p class="text-[11px] font-bold text-emerald-700 uppercase tracking-tight">
        You have reached the maximum TE (98) for {{ VIRTUE_EGG_NAMES[virtueStore.currentEgg] }}!
      </p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { clampBox, showClamped } from '@/lib/showClamped';
const inputEl = ref<HTMLInputElement | null>(null);
defineExpose({ focus: () => inputEl.value?.focus() });
import { iconURL } from 'lib';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { useVirtueStore } from '@/stores/virtue';
import { useActionsStore } from '@/stores/actions';
import { computeDependencies } from '@/lib/actions/executor';
import { formatNumber, formatDuration, formatAbsoluteTime } from '@/lib/format';
import { generateActionId, VIRTUE_EGG_NAMES } from '@/types';
import { eggsNeededForTE, countTEThresholdsPassed, isTEWaitReachable, clampTECount, maxTEToGain } from '@/lib/truthEggs';
import { useActionExecutor } from '@/composables/useActionExecutor';
import { solveForTime } from '@/engine/apply/math';

const truthEggsStore = useTruthEggsStore();
const virtueStore = useVirtueStore();
const actionsStore = useActionsStore();
const { prepareExecution, completeExecution } = useActionExecutor();

// Read all rate values from the engine-computed snapshot, which is the same
// source FloatingStats uses. This guarantees the two always agree and avoids
// any desync between composable-derived values and the simulation engine.
const snapshot = computed(() => actionsStore.effectiveSnapshot);

// Current egg state
const currentEggsDelivered = computed(() => truthEggsStore.eggsDelivered[virtueStore.currentEgg]);
const currentTE = computed(() => {
  // Use the higher of thresholds passed (for pending TE) and claimed TE (for baseline)
  const claimed = truthEggsStore.teEarned[virtueStore.currentEgg] || 0;
  const passed = countTEThresholdsPassed(currentEggsDelivered.value);
  return Math.max(claimed, passed);
});
const pendingTE = computed(() => truthEggsStore.pendingTEForEgg(virtueStore.currentEgg));
const claimedTE = computed(() => truthEggsStore.teEarned[virtueStore.currentEgg] || 0);

// Initial state from backup (for comparative display)
const initialEggsDelivered = computed(() => actionsStore.initialSnapshot.eggsDelivered[virtueStore.currentEgg]);

// Additional TE selection (user wants relative target)
const teToGain = ref(1);
const targetTENumber = computed(() => Math.min(98, currentTE.value + teToGain.value));

// Reset selection when egg changes
watch(
  () => virtueStore.currentEgg,
  () => {
    teToGain.value = 1;
  }
);

// Keep the selection a whole number from 1 to 98 minus the egg's current TE (pending included),
// whatever was typed (1.5, 1e5, '3.48e45', empty) or when currentTE changes (e.g. from previous actions).
watch(
  [teToGain, currentTE],
  () => {
    const valid = clampTECount(teToGain.value, maxTEToGain(currentTE.value));
    if (teToGain.value !== valid) teToGain.value = valid;
    showClamped(inputEl.value, valid);
  },
  { immediate: true }
);

// A paste, a drop or a scripted set skips the keydown filter and may fire no change (QA, 22 Oct 2026):
// the box is clamped as it changes and again when it is left, whatever put the value there.
function onBoxInput(e: Event) {
  const v = clampBox(e.target as HTMLInputElement, maxTEToGain(currentTE.value), 1, 'wait');
  if (v !== null && v !== teToGain.value) teToGain.value = v;
}
function onBoxLeave(e: Event) {
  const v = clampBox(e.target as HTMLInputElement, maxTEToGain(currentTE.value), 1, 'min');
  if (v !== null && v !== teToGain.value) teToGain.value = v;
}

const eggsToLay = computed(() => {
  if (teToGain.value <= 0) return 0;
  return eggsNeededForTE(currentEggsDelivered.value, targetTENumber.value);
});

function getTimeToLayForGain(gain: number): number {
  if (gain <= 0) return 0;
  const target = Math.min(98, currentTE.value + gain);
  const eggsNeeded = eggsNeededForTE(currentEggsDelivered.value, target);
  if (eggsNeeded <= 0) return 0;

  const snap = snapshot.value;
  const P0 = snap.population;
  const I = snap.offlineIHR / 60; // chickens/sec
  const R = snap.ratePerChickenPerSecond; // eggs/chicken/sec
  const S = snap.shippingCapacity; // eggs/sec
  const H = snap.habCapacity; // max chickens

  // The rate is capped by shipping capacity OR by the target population (hab capacity)
  // If we reach hab capacity, the rate becomes constant at R * H (clamped by S).
  const maxPossibleRate = Math.min(S, R * H);

  const time = solveForTime(eggsNeeded, P0, I, R, maxPossibleRate);
  return isFinite(time) ? time : Infinity;
}

const timeToLaySeconds = computed(() => getTimeToLayForGain(teToGain.value));

const elrPerHour = computed(() => snapshot.value.elr * 3600);
const elrPerDay = computed(() => snapshot.value.elr * 86400);

function getAbsoluteEarnedTime(timeSecs: number): string {
  if (!isTEWaitReachable(timeSecs)) return 'Not reachable';
  const planStartSeconds = virtueStore.planStartTime.getTime() / 1000;
  const currentStepTime = snapshot.value.lastStepTime || planStartSeconds;
  const totalSeconds = currentStepTime + timeSecs;
  const relativeSeconds = totalSeconds - planStartSeconds;
  return formatAbsoluteTime(relativeSeconds, virtueStore.planStartTime.getTime(), virtueStore.ascensionTimezone);
}

const absoluteEarnedTime = computed(() => getAbsoluteEarnedTime(timeToLaySeconds.value));

const minusButtonTooltip = computed(() => {
  if (teToGain.value <= 1) return undefined;
  const newGain = teToGain.value - 1;
  const currentTime = timeToLaySeconds.value;
  const newTime = getTimeToLayForGain(newGain);
  const timeSaved = Math.max(0, currentTime - newTime);
  const newDate = getAbsoluteEarnedTime(newTime);
  return `Saves ${formatDuration(timeSaved)} (Finishes ${newDate})`;
});

const plusButtonTooltip = computed(() => {
  if (teToGain.value >= 98 - currentTE.value) return undefined;
  const newGain = teToGain.value + 1;
  const currentTime = timeToLaySeconds.value;
  const newTime = getTimeToLayForGain(newGain);
  const timeAdded = Math.max(0, newTime - currentTime);
  const newDate = getAbsoluteEarnedTime(newTime);
  return `Adds ${formatDuration(timeAdded)} (Finishes ${newDate})`;
});

// Validation
const canWait = computed(
  () => teToGain.value > 0 && eggsToLay.value > 0 && isTEWaitReachable(timeToLaySeconds.value) && targetTENumber.value <= 98
);

function handleWaitForTE() {
  if (!canWait.value) return;

  // Prepare execution (restores stores if editing past group)
  const beforeSnapshot = prepareExecution();

  const payload = {
    egg: beforeSnapshot.currentEgg,
    targetTE: targetTENumber.value,
    teGained: teToGain.value,
    eggsToLay: eggsToLay.value,
    timeSeconds: timeToLaySeconds.value,
    startEggsDelivered: currentEggsDelivered.value,
    startTE: currentTE.value,
  };

  const dependencies = computeDependencies(
    'wait_for_te',
    payload,
    actionsStore.actionsBeforeInsertion,
    actionsStore.initialSnapshot.researchLevels
  );

  // Apply to store - add eggs delivered (TE is calculated from thresholds)
  truthEggsStore.addEggsDelivered(payload.egg, payload.eggsToLay);

  // Complete execution
  completeExecution(
    {
      id: generateActionId(),
      timestamp: Date.now(),
      type: 'wait_for_te',
      payload,
      cost: 0, // Free action
      dependsOn: dependencies,
    },
    beforeSnapshot
  );

  // Reset selection for next action
  teToGain.value = 1;
}
</script>
