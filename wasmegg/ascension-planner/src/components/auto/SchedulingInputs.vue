<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
    <div class="space-y-2">
      <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Start Time</label>
      <div class="flex gap-3">
        <input
          v-model="startDate"
          type="date"
          :min="formatUnixToDateInput(Date.now() / 1000 - 86400 * 7, timezone)"
          class="flex-grow bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500/50 bg-white transition-all"
          @input="handleStartDateInput"
        />
        <input
          ref="startTimeInput"
          v-model="startTime"
          type="time"
          class="w-32 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500/50 bg-white transition-all"
          @input="handleStartTimeInput"
        />
      </div>
      <!-- The default is the backup's own timestamp, which is not obvious from a date box that
           simply has a time in it. Said here so "why is this not now?" has an answer in place. -->
      <p v-if="backupHint" class="text-[10px] font-bold leading-relaxed px-1" :class="backupHint.class">
        {{ backupHint.text }}
      </p>
    </div>

    <div class="space-y-2">
      <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Timezone</label>
      <div class="flex gap-2">
        <div class="relative flex-grow">
          <select
            ref="timezoneSelect"
            v-model="timezone"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-5 pr-10 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500/50 bg-white transition-all"
          >
            <option v-for="tz in allTimezones" :key="tz.value" :value="tz.value">
              {{ tz.label }}
            </option>
          </select>
        </div>
        <button
          @click="setStartTimeToNow"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center justify-center active:scale-95 whitespace-nowrap"
        >
          Now
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { formatUnixToDateInput, formatUnixToTimeInput } from '@/lib/format';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { describeSaveAge, siloSeconds } from '@/lib/saveAge';

const { startDate, startTime, timezone } = storeToRefs(useAutoPlannerStore());
const initialStateStore = useInitialStateStore();

const startTimeInput = ref<HTMLInputElement | null>(null);
const timezoneSelect = ref<HTMLSelectElement | null>(null);

// Native <input type="date">/<input type="time"> elements only report a
// non-empty value once every sub-field has been filled in (year/month/day,
// or hour/minute/AM-PM); the browser itself already advances focus between
// those sub-fields as you type. So the moment a field's value flips from
// incomplete to complete, the user has just finished its last sub-field -
// that's our cue to carry the cursor on into the next field.
let wasStartDateComplete = false;
const handleStartDateInput = (event: Event) => {
  const isComplete = (event.target as HTMLInputElement).value !== '';
  if (isComplete && !wasStartDateComplete) {
    startTimeInput.value?.focus();
  }
  wasStartDateComplete = isComplete;
};

let wasStartTimeComplete = false;
const handleStartTimeInput = (event: Event) => {
  const isComplete = (event.target as HTMLInputElement).value !== '';
  if (isComplete && !wasStartTimeComplete) {
    timezoneSelect.value?.focus();
  }
  wasStartTimeComplete = isComplete;
};

const setStartTimeToNow = () => {
  const nowUnix = Date.now() / 1000;
  startDate.value = formatUnixToDateInput(nowUnix, timezone.value);
  startTime.value = formatUnixToTimeInput(nowUnix, timezone.value);
};

/**
 * Tell the user how the start time they are looking at relates to their last sync.
 *
 * The start defaults to NOW and the farm is caught up from the sync to it, capped at what the silos
 * hold (lib/saveAge.ts). Said out loud, because a caught-up farm is a prediction, and a save older
 * than the silos means the sync is old or something was missed.
 */
const backupHint = computed<{ text: string; class: string } | null>(() => {
  const chosen =
    startDate.value && startTime.value
      ? getLocalTimestampInTimezone(startDate.value, startTime.value, timezone.value)
      : null;
  const note = describeSaveAge(saveSyncSeconds(), chosen, saveSiloSeconds(), !!initialStateStore.currentFarmState);
  if (!note) return null;
  return { text: note.text, class: note.level === 'ok' ? 'text-emerald-600' : 'text-amber-600' };
});

/** The farm's own last sync when there is a virtue farm (what the catch-up runs from), else the backup's. */
function saveSyncSeconds(): number | null {
  const farm = initialStateStore.currentFarmState as { lastStepTime?: number } | null;
  if (farm?.lastStepTime && farm.lastStepTime > 1e9) return farm.lastStepTime;
  const approx = initialStateStore.rawBackup?.approxTime;
  return typeof approx === 'number' ? approx : null;
}

function saveSiloSeconds(): number {
  const farm = initialStateStore.currentFarmState as { numSilos?: number } | null;
  return siloSeconds(farm?.numSilos, initialStateStore.epicResearchLevels?.['silo_capacity']);
}

const allTimezones = computed(() => {
  try {
    const zones = Intl.supportedValuesOf('timeZone');
    return zones
      .map(tz => {
        const parts = tz.split('/');
        const city = parts[parts.length - 1].replace(/_/g, ' ');
        const region = parts.length > 1 ? parts[0] : '';
        return { value: tz, label: region ? `${city} (${region})` : city, region, city };
      })
      .sort((a, b) => {
        if (a.region !== b.region) return a.region.localeCompare(b.region);
        return a.city.localeCompare(b.city);
      });
  } catch {
    return [
      { value: 'America/Los_Angeles', label: 'Los Angeles (America)', region: 'America', city: 'Los Angeles' },
      { value: 'UTC', label: 'UTC', region: '', city: 'UTC' },
    ];
  }
});
</script>
