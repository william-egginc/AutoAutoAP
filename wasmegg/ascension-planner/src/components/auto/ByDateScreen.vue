<!--
  Highest TE by a date: the screen, framed like Fastest route (FastestRoute.vue) so the Auto
  Planner's search screens read the same way: a plain heading and one line, then the panel with
  Your setup, the search's own settings, the Find bar and the answer. The panel is the Full sweep's
  (InsanePanel, `goal="deadline"`), which hosts DeadlinePanel.
-->
<template>
  <div class="max-w-4xl mx-auto space-y-4">
    <div>
      <h2 class="text-2xl font-black text-slate-900">{{ NAMES.byDate }}</h2>
      <p class="text-sm text-slate-600">
        Finds the highest TE you can reach by a date (Egg Day by default), from your save and your setup. Plans include
        the weekly Research Sale and the Monday 2× earnings boost, the same as Your plan; other game events aren't
        simulated.
      </p>
    </div>
    <InsanePanel :player-id="playerId" goal="deadline" @update:goal="onGoal" />
  </div>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';

defineProps<{ playerId: string }>();
const emit = defineEmits<{ goal: [goal: 'fastest' | 'deadline'] }>();

const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

/** Carrying on a fastest run from here: App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}
</script>
