<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="p in presets"
        :key="p.key"
        type="button"
        data-testid="weekly-preset"
        class="inline-flex min-h-[44px] sm:min-h-0 items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-small font-bold text-slate-600 hover:bg-slate-50"
        @click="add(p.hours)"
      >
        {{ p.label }}
      </button>
      <button
        v-if="model.length"
        type="button"
        data-testid="weekly-clear"
        class="ml-1 inline-flex min-h-[44px] sm:min-h-0 items-center text-small font-bold text-slate-600 hover:underline"
        @click="model = []"
      >
        {{ WEEKLY_HOURS_WORDS.clear }}
      </button>
    </div>

    <div class="overflow-x-auto">
      <div class="inline-grid select-none gap-px" :style="{ gridTemplateColumns: `2.75rem repeat(24, minmax(2.75rem, 1fr))` }">
        <span />
        <span
          v-for="h in 24"
          :key="`h${h}`"
          class="text-center text-small font-bold text-slate-600"
          :class="(h - 1) % 3 ? 'invisible' : ''"
          >{{ hourName(h - 1) }}</span
        >
        <template v-for="(day, d) in dayLabels" :key="day">
          <span class="pr-1 text-right text-small font-bold uppercase text-slate-600 leading-[44px] sm:leading-6">{{ day }}</span>
          <button
            v-for="h in 24"
            :key="`${d}-${h}`"
            type="button"
            data-testid="weekly-hour"
            class="h-[44px] min-h-[44px] sm:h-6 sm:min-h-0 rounded-sm transition-colors"
            style="touch-action: none"
            :class="blocked.has(d * 24 + h - 1) ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-100 hover:bg-slate-200'"
            :aria-pressed="blocked.has(d * 24 + h - 1)"
            :aria-label="`${day} ${hourName(h - 1)}`"
            @pointerdown="startPaint(d * 24 + h - 1, $event)"
            @pointerenter="paint(d * 24 + h - 1)"
            @keydown.enter.prevent="toggle(d * 24 + h - 1)"
            @keydown.space.prevent="toggle(d * 24 + h - 1)"
          />
        </template>
      </div>
    </div>

    <p class="text-small text-slate-600">
      {{ WEEKLY_HOURS_WORDS.help(timezoneLabel) }}
      <template v-if="model.length"> {{ WEEKLY_HOURS_WORDS.count(model.length) }}</template>
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Weekly hours (R10): a week of 24-hour rows, copied from Joo's BlockedHoursPicker. Each blocked hour is an
 * index 0-167, Monday 00:00-01:00 first. Click or drag paints: the first cell decides whether the drag blocks
 * or unblocks. Filled = blocked (no prestige or egg shift then).
 */
import { computed, onMounted, onUnmounted } from 'vue';
import { WEEKLY_HOURS_WORDS, dailyWindowHours, hourName, presetHours } from '@/lib/weeklyHours';

const model = defineModel<number[]>({ required: true });
const props = defineProps<{
  timezone: string;
  /** Today's single window (From, To, days with Sunday = 0), offered as a preset when given. */
  daily?: { fromHour: number; toHour: number; days: number[] };
}>();

const blocked = computed(() => new Set(model.value));

/** Monday-first weekday names (2024-01-01 was a Monday). */
const dayLabels = Array.from({ length: 7 }, (_, i) =>
  new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
);
const timezoneLabel = computed(() => props.timezone.split('/').pop()!.replace(/_/g, ' '));

const presets = computed(() => [
  { key: 'sleep', label: WEEKLY_HOURS_WORDS.presets.sleep, hours: presetHours('sleep') },
  { key: 'work', label: WEEKLY_HOURS_WORDS.presets.work, hours: presetHours('work') },
  ...(props.daily ? [{ key: 'daily', label: WEEKLY_HOURS_WORDS.presets.daily, hours: dailyWindowHours(props.daily) }] : []),
]);

function set(hours: number[], on: boolean) {
  const next = new Set(model.value);
  for (const h of hours) {
    if (on) next.add(h);
    else next.delete(h);
  }
  model.value = [...next].sort((a, b) => a - b);
}
const add = (hours: number[]) => set(hours, true);
const toggle = (h: number) => set([h], !blocked.value.has(h));

/** While dragging: whether cells passed over are blocked or unblocked. */
let painting: boolean | null = null;
function startPaint(h: number, event: PointerEvent) {
  // Touch captures the pointer to the first cell; release it so the cells dragged over get pointerenter.
  (event.target as Element).releasePointerCapture?.(event.pointerId);
  painting = !blocked.value.has(h);
  set([h], painting);
}
function paint(h: number) {
  if (painting !== null && blocked.value.has(h) !== painting) set([h], painting);
}
const stopPaint = () => (painting = null);
onMounted(() => {
  window.addEventListener('pointerup', stopPaint);
  window.addEventListener('pointercancel', stopPaint);
});
onUnmounted(() => {
  window.removeEventListener('pointerup', stopPaint);
  window.removeEventListener('pointercancel', stopPaint);
});
</script>
