<!--
  The answer, the same way on both depths of Fastest route (the unified layout, phase 3): the
  route, how long it takes and when it lands, and the same row of things to do with it. Its main
  button is "Simulate this plan", the instant answer's name for the same action (glossary, 25 Oct 2026:
  it was "Build this plan"; the fill-only button was "Just fill it in"). Smart search
  and the Full sweep each had their own card with its own buttons ("Use this chain and build the
  plan", "Build this plan in the Auto Planner") in different places on the page.

  The route stays readable during a run -- it's the best so far, and always usable -- and the actions
  appear once the run stops. What each search wants to add (its guarantee, a contradiction it
  found) goes in the default slot.
-->
<template>
  <ResultCardFrame :still-going="running && days > 0">
    <template #heading>
      <template v-if="lastRun && !running">Your last run · {{ lastRun }}</template
      ><template v-else>{{ running ? 'Best so far' : 'Fastest found' }}</template
      ><template v-if="claim && !running">: {{ claim }}</template>
    </template>
    <template #headline>
      <!-- When the search ran, on which save, what it found (lib/lastRunLine.ts). -->
      <p v-if="ranLine && !running" class="text-body font-bold text-emerald-900/80" data-testid="ran-line">
        {{ ranLine }}
      </p>
      <div v-if="source" class="text-small font-bold text-emerald-700/80">{{ source }}</div>
      <div class="tabular-nums text-title font-bold text-slate-900 break-words">
        {{ chain.join(' ') }}
      </div>
    </template>
    <template #aside>
      <div class="text-title font-bold text-slate-900 tabular-nums">
        {{ days > 0 ? `${days.toFixed(3)} d` : 'pricing…' }}
      </div>
      <div v-if="days > 0" class="text-small font-bold text-emerald-800">reaches {{ finalTE }} on {{ endLabel }}</div>
    </template>

    <slot />
    <!-- The hours and time off the run used, named (lib/pricedWith.ts, 16 Oct 2026). -->
    <p v-if="pricedWith && !running && days > 0" :class="CARD_NOTE" data-testid="priced-with">{{ pricedWith }}.</p>

    <template v-if="!running && days > 0" #actions>
      <button
        type="button"
        :disabled="busy"
        :class="PRIMARY_BUTTON"
        @click="emit('build')"
      >
        Simulate this plan
      </button>
      <!-- Follow this route (Jordan, 23 Oct 2026): this result, for Right now and saved online. -->
      <FollowButton
        v-if="follow"
        primary
        :chain="chain"
        :goal-key="follow.goalKey"
        from="saved"
        :source="follow.source"
        :finish="follow.finish"
        :end-t-e="follow.endTE"
        :plan-start="follow.planStart"
        :deadline="follow.deadline ?? null"
      />
      <button
        v-if="canFill"
        type="button"
        :class="SECONDARY_BUTTON"
        @click="emit('fill')"
      >
        Fill in Target TEs only
      </button>
      <button
        type="button"
        :class="SECONDARY_BUTTON"
        @click="toShare"
      >
        Share
      </button>
      <button
        type="button"
        :class="SECONDARY_BUTTON"
        @click="emit('csv')"
      >
        CSV ↓
      </button>
      <button
        v-if="canSave"
        type="button"
        :disabled="saving"
        :class="SECONDARY_BUTTON"
        @click="emit('save')"
      >
        {{ saving ? 'Saving...' : 'Save run' }}
      </button>
      <span v-if="note" class="text-small font-bold text-emerald-800">{{ note }}</span>
      <p class="w-full text-small text-emerald-900/70" data-testid="build-plan-note">
        {{ simulateNote() }}
      </p>
    </template>
  </ResultCardFrame>
</template>

<script setup lang="ts">
import { simulateNote } from '@/lib/siteNav';
import { scrollToShownId } from '@/lib/searchTab';
import ResultCardFrame from './ResultCardFrame.vue';
import FollowButton from '../FollowButton.vue';
import type { ResultFollow } from '@/lib/follow';
import { CARD_NOTE, PRIMARY_BUTTON, SECONDARY_BUTTON } from './resultCardStyle';

withDefaults(
  defineProps<{
    chain: number[];
    days: number;
    finalTE: number;
    /** "Feb 15, 2029, 9:22 PM", in the plan's timezone. */
    endLabel: string;
    running: boolean;
    /** What the finished answer is: "the best of every route in this space", and so on. */
    claim?: string;
    busy?: boolean;
    canFill?: boolean;
    canSave?: boolean;
    saving?: boolean;
    /** Where the answer came from, when it wasn't this depth: the two share one store, so the
     *  Smart search screen shows a Full sweep's result until Smart search runs, and vice versa. */
    source?: string;
    /** A line after the buttons: what the last click did. */
    note?: string;
    /** Not from a run in this visit on these settings: when it was found ("Oct 11, 2026, 4:15 PM"),
     *  and the heading says "Your last run · ..." ('' for a live one). */
    lastRun?: string;
    /** "This Fast search ran on Oct 23 at 6:43 pm, on your save of Oct 23 at 1:03 am, and found 307 TE." (lib/lastRunLine.ts). */
    ranLine?: string;
    /** "Priced with your hours 9 am to 1 am, no time off": the run's own settings (lib/pricedWith.ts). */
    pricedWith?: string;
    /** "Follow this route" for the finished result (lib/follow.ts `ResultFollow`); absent: no button. */
    follow?: ResultFollow | null;
  }>(),
  {
    claim: '',
    source: '',
    busy: false,
    canFill: false,
    canSave: false,
    saving: false,
    note: '',
    lastRun: '',
    ranLine: '',
    pricedWith: '',
    follow: null,
  }
);
const emit = defineEmits<{ build: []; fill: []; csv: []; save: [] }>();

/** Each panel's Share this result section carries id="share-this-result"; both search tabs are on the
 *  page (SearchPanel.vue), so the one laid out is this card's. */
function toShare(): void {
  scrollToShownId('share-this-result');
}
</script>
