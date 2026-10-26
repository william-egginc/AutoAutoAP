<!--
  Highest TE by a date: the screen, framed like Fastest route (FastestRoute.vue) so the Auto
  Planner's search screens read the same way: a plain heading and one line, then the panel with
  Your setup, the search's own settings, the Find bar and the answer. The panel is the Full sweep's
  (InsanePanel, `goal="deadline"`), which hosts DeadlinePanel.

  Both searches are on the page, each in its own box with its own Find, as on Fastest: Nearby routes
  (the routes around the instant answer, in the Stronger check box) and Exhaustive (the boxes you set).
  Only the steps differ: the finish line is a date and the answer is the highest TE reached by then.
-->
<template>
  <div class="max-w-4xl mx-auto space-y-4">
    <div>
      <h1 class="text-2xl font-black text-slate-900">{{ NAMES.byDate }}</h1>
      <p class="text-sm text-slate-600">
        Finds the highest TE you can reach by a date (Egg Day by default), from your save and Setup. Plans include
        the weekly Research Sale and the Monday 2× earnings boost, the same as {{ NAMES.classic }}; other game events aren't
        simulated.
      </p>
    </div>
    <!-- Folded under the title, like Fastest's explainer (the user, 12 Oct: it sat in the middle of the page). -->
    <details class="rounded-xl border border-slate-200 bg-white" data-testid="by-date-how">
      <summary class="cursor-pointer px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
        How {{ NAMES.byDate }} works
      </summary>
      <div class="px-4 pb-4 text-xs text-slate-600 leading-relaxed">
        Fast and Exact pick the early stops for you: the
        instant answer's route for each number of ascensions and a few TE either side of each stop. In Custom you
        set the early stops and it tries every route in them. Either way the last stop is found to the exact TE. Like
        any run, it uses the plan start, awake hours, time off and computer settings in Setup.
      </div>
    </details>
    <!-- The setup is the floating Setup button (SetupDock.vue); here only the save's problems, if any. -->
    <YourSetup screen="by-date" issues-only />
    <!-- The instant answer, the Stronger check (with Nearby routes) and Exhaustive, all on the page
         (DeadlinePanel.vue). -->
    <InsanePanel :player-id="playerId" goal="deadline" @update:goal="onGoal" />
  </div>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';
import YourSetup from './YourSetup.vue';

defineProps<{ playerId: string }>();
const emit = defineEmits<{ goal: [goal: 'fastest' | 'deadline'] }>();

const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

/** Carrying on a fastest run from here: App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}
</script>
