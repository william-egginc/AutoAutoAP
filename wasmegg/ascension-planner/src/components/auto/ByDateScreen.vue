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
  <!-- THE LAYOUT CONTRACT (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026): the save line and the
       goal tabs above (App.vue), then the title and its one line, the date, the answer with Follow this route as its one
       main button, what to do now and the one closed More (DeadlinePanel.vue), then the footer. Its explainer (was the
       "How Highest TE by a date works" fold here) is in How this is worked out, inside More, word for word. -->
  <div class="max-w-4xl mx-auto space-y-4">
    <div data-region="title">
      <h1 class="text-headline font-black text-slate-900">{{ NAMES.byDate }}</h1>
      <p class="text-body text-slate-600 max-w-prose" data-testid="bydate-line">{{ BYDATE_LINE }}</p>
    </div>
    <!-- This account's starting-TE override, when it is on (TeOverrideBanner.vue): plans start from it, not the save. -->
    <TeOverrideBanner />
    <!-- The setup is the floating Setup button (SetupDock.vue); here only the save's problems, if any. -->
    <YourSetup screen="by-date" issues-only />
    <!-- The instant answer, the Stronger check (with Nearby routes) and Exhaustive, all on the page
         (DeadlinePanel.vue). Embedded, as on Fastest: no frame of its own round DeadlinePanel's. -->
    <InsanePanel :player-id="playerId" goal="deadline" embedded @update:goal="onGoal" />
  </div>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import { safeAsyncComponent } from 'lib/planners/import';
import YourSetup from './YourSetup.vue';
import { BYDATE_LINE } from '@/lib/layoutWords';
import TeOverrideBanner from '@/components/auto/TeOverrideBanner.vue';

defineProps<{ playerId: string }>();
const emit = defineEmits<{ goal: [goal: 'fastest' | 'deadline'] }>();

const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

/** Carrying on a fastest run from here: App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}
</script>
