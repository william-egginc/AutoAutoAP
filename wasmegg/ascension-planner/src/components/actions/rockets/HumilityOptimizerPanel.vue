<template>
  <div class="space-y-4">
    <p v-if="visitError" class="text-small text-red-600">{{ visitError }}</p>
    <p v-else-if="!current" class="text-small text-gray-600">Shift to Humility to plan this visit's missions.</p>

    <template v-else-if="settings">
      <!-- Where the ships, inventory and crafting level come from. -->
      <div
        v-if="!store.player"
        class="rounded-md border border-amber-200 bg-amber-50 p-2.5 flex flex-wrap items-center justify-between gap-2"
      >
        <p class="text-small text-amber-800">
          The optimizer needs your ship levels, inventory and crafting level, which this plan does not carry.
        </p>
        <button
          type="button"
          class="px-2 py-1 text-body font-bold rounded-md bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
          :disabled="store.saveLoading"
          @click="store.loadSave()"
        >
          <template v-if="store.saveLoading">Loading<AnimatedDots /></template><template v-else>Load my save</template>
        </button>
        <p v-if="store.saveError" class="w-full text-small text-red-600">{{ store.saveError }}</p>
      </div>

      <p v-else class="text-small text-gray-600">
        {{ loadedLine }}
        <button
          type="button"
          class="text-blue-600 hover:text-blue-700 disabled:opacity-50"
          :disabled="store.saveLoading"
          @click="store.loadSave()"
        >
          <template v-if="store.saveLoading">Reloading<AnimatedDots /></template><template v-else>Load a newer copy</template>
        </button>
        <span v-if="store.saveError" class="block text-red-600">{{ store.saveError }}</span>
      </p>

      <!-- What to aim for -->
      <section>
        <h4 class="label text-gray-600 mb-1.5">
          Legendaries to aim for · H{{ current.visit.visitIndex + 1 }} of {{ current.visitCount }}
        </h4>
        <TargetSelector :model-value="settings.targetIds" label="" @update:model-value="setTargets" />
      </section>

      <!-- What the visit has to spend -->
      <section class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <label for="humility-optimizer-time" class="block text-small font-bold text-gray-700">Time on Humility</label>
          <div class="mt-1 flex items-center gap-1.5">
            <input
              id="humility-optimizer-time"
              type="text"
              :value="settings.duration"
              placeholder="e.g. 3d, 36h"
              class="block w-24 px-2 py-1 text-base sm:text-body border rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              :class="timeRejected ? 'border-red-300' : 'border-gray-300'"
              @change="setDuration(($event.target as HTMLInputElement).value)"
            />
            <button
              v-for="preset in DURATION_PRESETS"
              :key="preset"
              type="button"
              class="px-1.5 py-1 text-small rounded-md border"
              :class="
                settings.duration === preset
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              "
              @click="setDuration(preset)"
            >
              {{ preset }}
            </button>
          </div>
          <p class="mt-1 text-small" :class="timeRejected ? 'text-red-600' : 'text-gray-600'">
            {{
              timeRejected
                ? 'Enter a duration such as 3d or 36h.'
                : 'How long the three mission slots may be kept busy.'
            }}
          </p>
        </div>

        <div>
          <span class="block text-small font-bold text-gray-700">{{ CADENCE_HEADING }}</span>
          <div class="mt-1 inline-flex rounded-md border border-gray-200 bg-white overflow-hidden" role="group">
            <button
              v-for="level in EFFORT_LEVELS"
              :key="level"
              type="button"
              class="px-2.5 py-1 text-small border-r border-gray-200 last:border-r-0"
              :class="effort === level ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
              :aria-pressed="effort === level"
              @click="patch({ effort: level, effortChosen: true })"
            >
              {{ EFFORT_META[level].label }}
            </button>
          </div>
          <p class="mt-1 text-small text-gray-600">
            {{ EFFORT_META[effort].hint }} {{ CADENCE_NOTE }}
          </p>
        </div>

        <div>
          <span class="block text-small font-bold text-gray-700">Fuel</span>
          <div class="mt-1 inline-flex rounded-md border border-gray-200 bg-white overflow-hidden" role="group">
            <button
              v-for="option in FUEL_OPTIONS"
              :key="option.value"
              type="button"
              class="px-2.5 py-1 text-small border-r border-gray-200 last:border-r-0"
              :class="
                settings.fuelBudget === option.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              "
              :aria-pressed="settings.fuelBudget === option.value"
              @click="patch({ fuelBudget: option.value })"
            >
              {{ option.label }}
            </button>
          </div>
          <p class="mt-1 text-small text-gray-600">
            <template v-if="settings.fuelBudget === 'banked'">
              {{
                stagedLaunch
                  ? 'Only what the tank holds here before the staged missions burn theirs'
                  : 'Only what is in the tank here'
              }}<template v-if="bankedFuel.length > 0">:</template>
              <span v-for="fuel in bankedFuel" :key="fuel.egg" class="inline-flex items-center gap-0.5 ml-1">
                <img :src="eggIcon(fuel.egg)" class="h-3 w-3" :alt="VIRTUE_EGG_NAMES[fuel.egg]" />
                {{ formatNumber(fuel.amount, 1) }}
              </span>
              <template v-if="bankedFuel.length === 0"> — which is nothing yet. Try a full tank.</template>
            </template>
            <template v-else>
              Plans against a full {{ formatNumber(tankCapacity, 0) }} tank. Staging adds the fuel stores to your
              earlier visits.
            </template>
          </p>
        </div>

        <div>
          <label for="humility-optimizer-gems" class="block text-small font-bold text-gray-700">Ship price limit</label>
          <select
            id="humility-optimizer-gems"
            :value="settings.gemLimit"
            class="mt-1 block pl-2 pr-7 py-1 text-base sm:text-body border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            @change="patch({ gemLimit: ($event.target as HTMLSelectElement).value as GemLimit })"
          >
            <option value="plan">What this visit earns</option>
            <option value="unlimited">No limit</option>
          </select>
          <p class="mt-1 text-small text-gray-600">
            <template v-if="settings.gemLimit === 'plan'">
              <template v-if="!timeInvalid">
                Only ships costing up to {{ formatNumber(gemBudget, 1) }} gems, the visit's earnings over that time.
              </template>
              <template v-else>Only ships the visit's earnings can pay for in that time.</template>
            </template>
            <template v-else>Any ship, however long it takes to afford.</template>
          </p>
        </div>

        <label
          v-if="store.player"
          class="sm:col-span-2 flex items-center gap-2 text-small text-gray-600 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            class="h-3.5 w-3.5 rounded text-blue-600 border-gray-300"
            :checked="settings.capCrafting"
            @change="patch({ capCrafting: ($event.target as HTMLInputElement).checked })"
          />
          Keep the crafting within my golden eggs ({{ formatNumber(store.player.goldenEggs, 1) }})
        </label>

        <div v-if="chainStore.availability" class="sm:col-span-2" data-testid="optimizer-my-hours">
          <label class="flex items-center gap-2 text-small font-bold text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              class="h-3.5 w-3.5 rounded text-blue-600 border-gray-300"
              :checked="settings.useMyHours"
              @change="patch({ useMyHours: ($event.target as HTMLInputElement).checked })"
            />
            Plan around my awake hours
          </label>
          <p v-if="settings.useMyHours" class="mt-1 text-small text-gray-600">
            Your hours from Setup: {{ hoursText }}. Launches go up only while you are awake; a ship that lands at
            night waits for you.
          </p>
          <p v-if="hoursWindow?.note" class="mt-1 text-small text-amber-700" data-testid="optimizer-hours-note">
            {{ hoursWindow.note }}
          </p>
          <p
            v-if="settings.useMyHours && hoursWindow && !hoursOn"
            class="mt-1 text-small text-gray-600"
            data-testid="optimizer-hours-fit"
          >
            This visit fits inside your awake hours, so there is no night to plan around.
          </p>
        </div>
        <p v-else-if="noHoursReason" class="sm:col-span-2 text-small text-gray-600">{{ noHoursReason }}</p>
        <OptimizerScheduleSettings
          class="sm:col-span-2"
          compact
          :hide-sleep="hours !== null"
          :model-value="settings"
          @update:model-value="patch"
        />
      </section>

      <!-- The answer -->
      <section class="rounded-md border border-gray-200 bg-white p-3">
        <p v-if="!store.player" class="text-small text-gray-600">Load your save to find a ship set.</p>
        <p v-else-if="settings.targetIds.length === 0" class="text-small text-gray-600">
          Pick at least one artifact above to find the best ship set for it.
        </p>
        <p v-else-if="timeInvalid" class="text-small text-gray-600">Enter the time on Humility to find a ship set.</p>
        <p v-else-if="scheduleInvalid" class="text-small text-gray-600">
          Enter the time left in the 2× capacity event to find a ship set.
        </p>
        <p v-else-if="error" class="text-small text-red-600">{{ error }}</p>
        <p v-else-if="!shown && computing" role="status" class="flex items-center gap-2 text-small text-gray-600">
          <InlineSpinner class="h-4 w-4 text-gray-600" />
          Finding the best ship set<AnimatedDots />
        </p>
        <p v-else-if="!shown" class="text-small text-gray-600">No ship set yet.</p>

        <div v-else class="relative">
          <div class="space-y-3" :class="stale ? 'opacity-40 pointer-events-none transition-opacity' : ''">
            <p v-if="totalShips === 0" class="text-small text-gray-600">
              No ship set fits these budgets. Try more time, a full tank, or no ship price limit.
            </p>

            <template v-else-if="view && projected">
              <!-- The two answers side by side; the one picked is shown in full below and is what staging uses. -->
              <div v-if="alternatives.length > 0" class="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="optimizer-alternatives">
                <button
                  v-for="alt in alternatives"
                  :key="alt.id"
                  type="button"
                  class="text-left rounded-md border p-2 text-small"
                  :class="picked === alt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'"
                  :aria-pressed="picked === alt.id"
                  :data-testid="`optimizer-alt-${alt.id}`"
                  @click="store.pick = alt.id"
                >
                  <span class="block font-bold text-gray-800">{{ alt.title }}</span>
                  <span class="block text-headline font-bold text-green-700 leading-tight">{{ alt.chance }}</span>
                  <span v-if="alt.sameAsBest" class="block text-gray-600">{{ SAME_CHANCE_AS_BEST }}</span>
                  <span class="block text-gray-600">
                    {{ formatNumber(alt.crafts, 1) }} crafts · {{ alt.ships }} ships · fuel {{ formatNumber(alt.fuel, 1) }}
                  </span>
                  <span class="block" :class="alt.nightLaunches > 0 ? 'text-amber-700' : 'text-gray-600'">
                    {{ nightLaunchesText(alt.nightLaunches) }}
                  </span>
                </button>
                <p v-if="bestPending" role="status" class="text-small text-gray-600 flex items-center gap-2">
                  <InlineSpinner class="h-4 w-4 text-gray-600" />
                  Finding the best ship set without your hours<AnimatedDots />
                </p>
              </div>
              <div class="flex flex-wrap items-end gap-x-3 gap-y-1">
                <span class="text-headline font-bold text-green-700 leading-none">
                  {{ formatProbabilityForDisplay(shown.solution.jointProbability) }}
                </span>
                <span class="text-small text-gray-600 pb-0.5">
                  <template v-if="view.targets.length === 1">
                    chance of a legendary {{ view.targets[0].name }}
                  </template>
                  <template v-else>joint chance of all {{ view.targets.length }} legendaries</template>
                </span>
              </div>

              <ul v-if="view.targets.length > 1" class="flex flex-wrap gap-x-3 gap-y-1">
                <li
                  v-for="target in view.targets"
                  :key="target.nodeId"
                  class="flex items-center gap-1 text-small text-gray-600"
                >
                  <img :src="target.iconUrl" class="h-4 w-4" alt="" />
                  {{ target.name }}
                  <span class="font-bold text-green-700">
                    {{ formatProbabilityForDisplay(target.perTarget.bestProbability) }}
                  </span>
                </li>
              </ul>

              <!-- The same timeline and totals the explorer's card shows, here rather than under the breakdown,
                   since what to launch is what staging puts in the plan. -->
              <OptimizerLaunchPlan
                class="text-body"
                :solution="shown.solution"
                :clock-of="clockOf"
                heading-class="label text-gray-600"
              />

              <dl class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-small">
                <div class="rounded bg-gray-50 px-2 py-1.5">
                  <dt class="text-gray-600">Ships</dt>
                  <dd class="font-bold text-gray-800">{{ totalShips }}</dd>
                </div>
                <div class="rounded bg-gray-50 px-2 py-1.5">
                  <dt class="text-gray-600">Busiest slot</dt>
                  <dd class="font-bold text-gray-800">
                    {{ formatDuration(projected.makespanSeconds) }}
                    <span class="font-normal text-gray-600">of {{ formatDuration(shown.timeSeconds) }}</span>
                  </dd>
                </div>
                <div class="rounded bg-gray-50 px-2 py-1.5">
                  <dt class="text-gray-600">Ship cost</dt>
                  <dd class="font-bold text-gray-800">{{ formatNumber(projected.gemCost, 1) }} gems</dd>
                </div>
                <div class="rounded bg-gray-50 px-2 py-1.5">
                  <dt class="text-gray-600">Fuel</dt>
                  <dd class="font-bold text-gray-800 flex flex-wrap gap-x-2">
                    <span v-for="fuel in fuelNeeds" :key="fuel.egg" class="inline-flex items-center gap-0.5">
                      <img :src="eggIcon(fuel.egg)" class="h-3 w-3" :alt="VIRTUE_EGG_NAMES[fuel.egg]" />
                      {{ formatNumber(fuel.amount, 1) }}
                    </span>
                    <span v-if="fuelNeeds.length === 0" class="font-normal text-gray-600">Humility only</span>
                  </dd>
                </div>
              </dl>

              <p v-if="fuelOverflow > 0" class="text-small text-red-600">
                This ship set needs {{ formatNumber(fuelToStoreTotal, 1) }} more fuel than is banked, and the tank only
                has room for {{ formatNumber(current.tankFree, 1) }}.
                <template v-if="settings.fuelBudget === 'full-tank'">
                  A full tank assumes all of it can hold what these ships burn, and part of yours already holds fuel
                  they do not.
                </template>
                Make room in the Tank tab, give the visit less time, or plan with the banked fuel.
              </p>
              <p v-else-if="fuelToStore.length > 0" class="text-small text-amber-700">
                {{ inPlan ? 'Stored for this launch:' : 'Not in the tank yet:' }}
                <span v-for="fuel in fuelToStore" :key="fuel.egg" class="inline-flex items-center gap-0.5 mr-1.5">
                  <img :src="eggIcon(fuel.egg)" class="h-3 w-3" :alt="VIRTUE_EGG_NAMES[fuel.egg]" />
                  {{ formatNumber(fuel.amount, 1) }}
                </span>
                <template v-if="inPlan">Staging put it in your earlier visits to those eggs.</template>
                <template v-else>
                  Staging stores it in your earlier visits to those eggs, or adds a visit where there is none.
                </template>
              </p>

              <p v-if="current.visit.visitIndex > 0" class="text-small text-gray-600">
                Solved on its own: drops and crafts from earlier Humility visits are not counted, so this may ask for
                more than you still need.
              </p>

              <!-- Applying it -->
              <div class="border-t border-gray-100 pt-3 space-y-2">
                <p v-if="saving?.withEarningsSet !== undefined" class="text-small text-gray-600">
                  Saving for these ships takes {{ formatDuration(saving.seconds) }} on the elr set,
                  {{ formatDuration(saving.withEarningsSet) }} on the earnings set.
                  <label class="ml-1 inline-flex items-center gap-1 cursor-pointer">
                    <input v-model="swapSet" type="checkbox" class="h-3 w-3 rounded text-blue-600 border-gray-300" />
                    Swap to the earnings set for the launch
                  </label>
                </p>
                <p v-else-if="saving && saving.seconds >= 60" class="text-small text-gray-600">
                  The launch waits {{ formatDuration(saving.seconds) }} for the gems these ships cost.
                </p>

                <div class="flex flex-wrap items-center gap-2">
                  <span
                    v-if="inPlan"
                    class="inline-flex items-center gap-1 px-3 py-1.5 text-body font-bold rounded-md border border-green-200 bg-green-50 text-green-700"
                  >
                    ✓ Staged in the plan
                  </span>
                  <button
                    v-else
                    type="button"
                    class="px-3 py-1.5 text-body font-bold rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="staging || stale || fuelOverflow > 0"
                    @click="stage"
                  >
                    <template v-if="staging">Staging<AnimatedDots /></template
                    ><template v-else>{{ stagedLaunch ? 'Restage with this ship set' : 'Stage into plan' }}</template>
                  </button>
                  <span v-if="stagedLaunch && !inPlan && fuelOverflow === 0" class="text-small text-amber-700">
                    The plan has a different answer staged for this visit. Restaging replaces it.
                  </span>
                  <span v-else-if="inPlan" class="text-small text-gray-600">
                    The launch, its fuel and the wait for the ships are in the action history.
                  </span>
                </div>
                <p v-if="stageError" class="text-small text-red-600">{{ stageError }}</p>
                <p v-if="inPlan && missionsStore.drift.length > 0" class="text-small text-red-600">
                  This planner charges different fuel than the optimizer assumed for
                  {{ missionsStore.drift.map(d => VIRTUE_EGG_NAMES[d.egg]).join(', ') }}. The plan uses this planner's
                  amounts.
                </p>
              </div>

              <details class="border-t border-gray-100 pt-2">
                <summary class="text-small font-bold text-blue-600 hover:text-blue-700 cursor-pointer select-none">
                  Full breakdown: odds, crafts and expected drops
                </summary>
                <div class="mt-2">
                  <OptimizerSolutionCard
                    :solution="shown.solution"
                    :max-wait-time-seconds="shown.timeSeconds"
                    :has-inventory="true"
                    :golden-egg-balance="shown.player.goldenEggs"
                    :targets="view.targets"
                    :plan-cost="view.planCost"
                    :over-provisioned="current.visit.visitIndex > 0"
                    :show-launch-plan="false"
                  />
                </div>
              </details>
            </template>
          </div>

          <div v-if="stale && computing" role="status" class="absolute inset-0 flex items-start justify-center pt-6">
            <InlineSpinner class="h-6 w-6 text-gray-600" />
            <span class="sr-only">Finding the best ship set</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';

import { fuelTankSizes, iconURL, virtueShipGemCosts } from 'lib';
import { finalizeSolutions, formatProbabilityForDisplay, solutionView } from 'lib/mission-optimizer';
import { createOptimizerClient, type OptimizerClient } from 'lib/mission-optimizer/optimizer-client';
import { EFFORT_LEVELS, EFFORT_META } from 'lib/mission-optimizer/effort';
import { gemBudgetFor, PlanSaveError, type HumilityVisit } from 'lib/mission-optimizer/plan/read';
import type { PlayerData } from 'lib/mission-optimizer/player-data';
import { projectSolvedVisit } from 'lib/mission-optimizer/plan/write';
import { NON_HUMILITY_EGG_IDS } from 'lib/mission-optimizer/plan/schema';
import { scheduleArgsOf } from 'lib/mission-optimizer/schedule-settings';
import { getSimulationContext } from 'lib/planners/engine/adapter';
import { fuelForLaunches } from 'lib/planners/rockets/launches';
import InlineSpinner from 'ui/components/planners/InlineSpinner.vue';
import OptimizerLaunchPlan from 'ui/components/mission-optimizer/OptimizerLaunchPlan.vue';
import OptimizerScheduleSettings from 'ui/components/mission-optimizer/OptimizerScheduleSettings.vue';
import OptimizerSolutionCard from 'ui/components/mission-optimizer/OptimizerSolutionCard.vue';
import TargetSelector from 'ui/components/mission-optimizer/TargetSelector.vue';

import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import { useActionsStore } from '@/stores/actions';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useHumilityMissionsStore } from '@/stores/humilityMissions';
import { useHumilityOptimizerStore, type SolvedVisit } from '@/stores/humilityOptimizer';
import { useInitialStateStore } from '@/stores/initialState';
import { usePlanStore } from '@/stores/plan';
import { formatDuration, formatNumber } from '@/lib/format';
import { plainError } from '@/lib/plainError';
import { HumilityMissionsError, launchSchedule, resolveLaunches } from '@/lib/humilityMissions';
import { humilitySourceTag, previewLaunchDurations } from '@/lib/humilityMissionsStage';
import {
  currentHumilityVisit,
  durationSeconds,
  effortFor,
  type CurrentVisit,
  type FuelBudget,
  type GemLimit,
  type OptimizerVisitSettings,
} from '@/lib/humilityOptimizer';
import { buildRequest } from '@/lib/humilityOptimizerEngine';
import { awakeWindowFor, launchClock, launchesInBlockedHours } from '@/lib/optimizerHours';
import { formatMoment } from '@/lib/clock';
import { showSchedule } from '@/lib/displayTime';
import {
  bestAlternativeTitle,
  CADENCE_HEADING,
  CADENCE_NOTE,
  fitsAlternativeTitle,
  loadedSaveLine,
  nightLaunchesText,
  SAME_CHANCE_AS_BEST,
  sameChanceAsBest,
} from '@/lib/optimizerWords';
import { VIRTUE_EGG_NAMES, type VirtueEgg } from '@/types';

const DURATION_PRESETS = ['1d', '3d', '7d', '14d'];
const FUEL_OPTIONS: { value: FuelBudget; label: string }[] = [
  { value: 'banked', label: 'Banked fuel' },
  { value: 'full-tank', label: 'Full tank' },
];

const store = useHumilityOptimizerStore();
const actionsStore = useActionsStore();
const initialStateStore = useInitialStateStore();
const planStore = usePlanStore();
const missionsStore = useHumilityMissionsStore();
const chainStore = useChainSearchStore();

/** The save in use is the one already loaded; this says so and when it is from (DRAFT words, lib/optimizerWords.ts). */
const loadedLine = computed(() =>
  loadedSaveLine(store.playerSavedAt > 0 ? formatMoment(store.playerSavedAt * 1000, { year: 'auto' }) : '')
);

const eggIcon = (egg: VirtueEgg) => iconURL(`egginc/egg_${egg}.png`, 64);

// ---------------------------------------------------------------------------
// The visit and what it is being solved for
// ---------------------------------------------------------------------------

// Read together, so a plan the reader rejects shows its message instead of an empty card.
const reading = computed<{ current: CurrentVisit | null; error: string }>(() => {
  try {
    const current = currentHumilityVisit(
      actionsStore.actions,
      actionsStore.actionsBeforeInsertion,
      initialStateStore.epicResearchLevels,
      {
        ascensionDate: planStore.ascensionDate,
        ascensionTime: planStore.ascensionTime,
        ascensionTimezone: planStore.ascensionTimezone,
      }
    );
    return { current, error: '' };
  } catch (err) {
    if (!(err instanceof PlanSaveError)) throw err;
    return { current: null, error: `This plan cannot be read for the optimizer: ${err.message}` };
  }
});
const current = computed(() => reading.value.current);
const visitError = computed(() => reading.value.error);

const settings = computed<OptimizerVisitSettings | null>(() =>
  current.value ? store.settingsFor(current.value.visit) : null
);

function patch(change: Partial<OptimizerVisitSettings>) {
  if (current.value) store.update(current.value.visit, change);
}
const setTargets = (targetIds: string[]) => patch({ targetIds });
const setDuration = (duration: string) => patch({ duration: duration.trim() });

const timeSeconds = computed(() => (settings.value ? durationSeconds(settings.value.duration) : NaN));
const timeInvalid = computed(() => !Number.isFinite(timeSeconds.value));
// Typed, and not a duration: an empty field is only unanswered.
const timeRejected = computed(() => timeInvalid.value && (settings.value?.duration ?? '') !== '');

const bankedFuel = computed(() => {
  const visit = current.value?.visit;
  if (!visit) return [];
  return NON_HUMILITY_EGG_IDS.map(([egg, id]) => ({ egg, amount: visit.fuelByEgg.get(id) ?? 0 })).filter(
    fuel => fuel.amount > 0
  );
});
const tankCapacity = computed(() => fuelTankSizes[current.value?.visit.tankLevel ?? 0] ?? 0);
const gemBudget = computed(() => (current.value ? gemBudgetFor(current.value.visit, timeSeconds.value) : NaN));

// ---------------------------------------------------------------------------
// The player's awake hours (Setup), as the one sleep window the solver takes
// ---------------------------------------------------------------------------

// The hours Setup has on, or null. The plan's real start: the visit's arrival plus the time the plan spends
// there before the launch point; unknown when the save carries no ascension start.
const hours = computed(() => (settings.value?.useMyHours ? chainStore.availability : null));
const startUnix = computed(() => {
  const visit = current.value?.visit;
  return visit && visit.arrivalTimestamp !== null ? visit.arrivalTimestamp + visit.plannedDurationSeconds : null;
});
const hoursWindow = computed(() =>
  hours.value && startUnix.value !== null && !timeInvalid.value
    ? awakeWindowFor(hours.value, startUnix.value, timeSeconds.value)
    : null
);
// Both answers are made only when the hours change the plan: a visit that stays inside them has one answer.
const hoursOn = computed(() => (hoursWindow.value?.sleepHours ?? 0) > 0);
// The effort in force: Max with the awake hours on, until the player picks one.
const effort = computed(() => (settings.value ? effortFor(settings.value, !!hours.value) : 'medium'));
const hoursText = computed(() => (hours.value ? showSchedule(hours.value) : ''));
const noHoursReason = computed(() => {
  if (!settings.value?.useMyHours) return '';
  if (!chainStore.availability) return 'Turn on your hours in Setup and the plan is made around them.';
  if (startUnix.value === null) return 'This plan has no start date, so the awake hours cannot be placed on it.';
  return '';
});
// What each solve is asked: the player's own sleep window, or the awake hours in its place.
function bestSettings(asked: OptimizerVisitSettings): OptimizerVisitSettings {
  return { ...asked, effort: effort.value, ...(hours.value ? { sleepEnabled: false } : {}) };
}
function fitsSettings(asked: OptimizerVisitSettings): OptimizerVisitSettings {
  const w = hoursWindow.value;
  if (!hours.value || !w) return { ...asked, effort: effort.value };
  return { ...asked, effort: effort.value, sleepEnabled: w.sleepHours > 0, sleepHours: w.sleepHours, hoursSinceWake: w.hoursSinceWake };
}

// ---------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------

// The meaning of the inputs, not their identity: the visit is rebuilt on every plan edit, and only a
// change to what it has to spend should cost a solve.
const questionKey = computed(() => {
  const visit = current.value?.visit;
  const asked = settings.value;
  if (!visit || !asked || !store.player) return '';
  return JSON.stringify({
    visit: visit.visitId,
    settings: asked,
    effort: effort.value,
    // A full tank is solved against the tank's size, whatever it holds.
    fuel: asked.fuelBudget === 'banked' ? [...visit.fuelByEgg] : null,
    tank: visit.tankLevel,
    // The price limit only decides which ships are on the menu, so two budgets that afford the same
    // ships pose the same question. Staging nudges the visit's earnings; this keeps that from
    // re-solving, and possibly replacing, the answer that was just staged.
    ships:
      asked.gemLimit === 'plan'
        ? Object.values(virtueShipGemCosts).filter(price => price <= gemBudget.value).length
        : null,
    ftl: visit.epicResearchFTLLevel,
    zerog: visit.epicResearchZerogLevel,
    save: store.playerRevision,
    // What the awake hours came to, so a change to them re-solves.
    hours: hours.value ? [hoursWindow.value?.sleepHours ?? null, hoursWindow.value?.hoursSinceWake ?? null] : null,
  });
});
// The event's "time left" is the one schedule setting that can be typed wrong.
const scheduleInvalid = computed(() => settings.value !== null && scheduleArgsOf(settings.value) === null);
const posed = computed(
  () =>
    questionKey.value !== '' &&
    !timeInvalid.value &&
    !scheduleInvalid.value &&
    (settings.value?.targetIds.length ?? 0) > 0
);

const computing = ref(false);
const error = ref('');

// Lazy, so opening the panel on a visit with nothing to solve starts no worker.
let client: OptimizerClient | null = null;
let generation = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

async function solveOne(visit: HumilityVisit, asked: OptimizerVisitSettings, player: PlayerData, key: string) {
  const request = buildRequest(visit, asked, player);
  if (!request) return null;
  const solutions = await (client ??= createOptimizerClient()).run(request.input);
  // Null is "no result is coming": superseded, or the worker was torn down.
  if (solutions === null) return null;
  const [solution] = finalizeSolutions(solutions, request.input.recipeDag);
  if (!solution) throw new Error("The optimizer didn't return a ship set. Try again.");
  return {
    visitId: visit.visitId,
    key,
    solution,
    timeSeconds: request.timeSeconds,
    gemBudget: request.gemBudget,
    effort: asked.effort,
    player,
  };
}

async function solve() {
  const mine = ++generation;
  const visit = current.value?.visit;
  const asked = settings.value;
  const player = store.player;
  const key = questionKey.value;
  if (!visit || !asked || !player) {
    computing.value = false;
    return;
  }
  const both = hoursOn.value;
  const fits = fitsSettings(asked);
  const best = both ? bestSettings(asked) : null;
  try {
    // The answer around the awake hours (or the only one) first, so it shows while the best one is found.
    const first = await solveOne(visit, fits, player, key);
    if (mine !== generation || !first) return;
    store.solved = first;
    if (!both) store.solvedBest = null;
    computing.value = false;
    if (best) {
      const second = await solveOne(visit, best, player, bestKeyOf(key));
      if (mine !== generation || !second) return;
      store.solvedBest = second;
    }
  } catch (err) {
    if (mine !== generation) return;
    error.value = plainError(err, "Couldn't find a ship set. Try again.");
    store.solved = null;
    store.solvedBest = null;
  } finally {
    if (mine === generation) computing.value = false;
  }
}

watch(
  [questionKey, posed],
  () => {
    // Retire a running request before its debounced replacement starts.
    ++generation;
    clearTimeout(debounceTimer);
    error.value = '';
    // An answer kept from before the tab was switched away still stands if the question does.
    computing.value =
      posed.value &&
      (store.solved?.key !== questionKey.value ||
        (hoursOn.value && store.solvedBest?.key !== bestKeyOf(questionKey.value)));
    if (computing.value) debounceTimer = setTimeout(solve, 250);
    // From here on the visit keeps what it was asked, whatever another visit's choices do to the defaults.
    if (posed.value && current.value) store.pin(current.value.visit);
  },
  { immediate: true }
);

onUnmounted(() => {
  ++generation;
  clearTimeout(debounceTimer);
  client?.terminate();
});

// The last answer for this visit, shown dimmed while a newer question is being solved.
const bestKeyOf = (key: string) => `${key}|best`;
const bestAnswer = computed(() => {
  const solved = store.solvedBest;
  return hoursOn.value && posed.value && solved && solved.visitId === current.value?.visit.visitId ? solved : null;
});
const primaryAnswer = computed(() => {
  const solved = store.solved;
  return posed.value && solved && solved.visitId === current.value?.visit.visitId ? solved : null;
});
// Which of the two answers the card shows in full: the one the player picked, while it is there.
const picked = computed<'hours' | 'best'>(() =>
  hoursOn.value && store.pick === 'best' && bestAnswer.value ? 'best' : 'hours'
);
const shown = computed(() => (picked.value === 'best' ? bestAnswer.value : primaryAnswer.value));
const stale = computed(
  () =>
    shown.value !== null &&
    shown.value.key !== (picked.value === 'best' ? bestKeyOf(questionKey.value) : questionKey.value)
);
// The two answers side by side, each with what it comes to against the player's real hours.
const bestPending = computed(() => hoursOn.value && !bestAnswer.value && !error.value && posed.value);
const alternatives = computed(() => {
  if (!hoursOn.value || !primaryAnswer.value) return [];
  const rows: { id: 'hours' | 'best'; title: string; answer: SolvedVisit }[] = [
    { id: 'hours', title: fitsAlternativeTitle, answer: primaryAnswer.value },
  ];
  if (bestAnswer.value) rows.unshift({ id: 'best', title: bestAlternativeTitle, answer: bestAnswer.value });
  const bestChance = bestAnswer.value ? formatProbabilityForDisplay(bestAnswer.value.solution.jointProbability) : null;
  return rows.map(row => {
    const sol = row.answer.solution;
    const ships = sol.choiceHistory.reduce((sum, c) => sum + c.numShipsLaunched, 0);
    return {
      ...row,
      chance: formatProbabilityForDisplay(sol.jointProbability),
      sameAsBest: row.id === 'hours' && sameChanceAsBest(bestChance, formatProbabilityForDisplay(sol.jointProbability)),
      crafts: sol.perTarget.reduce((sum, t) => sum + t.expectedCrafts, 0),
      ships,
      fuel: sol.fuelUsed,
      nightLaunches:
        startUnix.value === null ? 0 : launchesInBlockedHours(sol, startUnix.value, hours.value),
    };
  });
});
// A launch's real time for the timeline: the plan start plus the offset.
const clockOf = computed(() => {
  const start = startUnix.value;
  const zone = hours.value?.timezone;
  return hours.value && start !== null && zone ? (seconds: number) => launchClock(start, seconds, zone) : undefined;
});

const view = computed(() => (shown.value ? solutionView(shown.value.solution, shown.value.player.inventory) : null));

// The same projection the explorer writes to its humility missions file, so staging takes the one path.
const projected = computed(() => {
  const visit = current.value?.visit;
  if (!visit || !shown.value) return null;
  const { solution, effort, gemBudget: budget } = shown.value;
  return projectSolvedVisit({ visit, solution, effort, gemBudget: budget });
});
const launches = computed(() => (projected.value ? resolveLaunches(projected.value) : []));
const totalShips = computed(() => launches.value.reduce((sum, launch) => sum + launch.count, 0));

// At this planner's own fuel table, which is what the launch will actually be charged.
const fuelNeeds = computed(() => {
  const required = fuelForLaunches(launches.value);
  return NON_HUMILITY_EGG_IDS.map(([egg]) => ({ egg, amount: required[egg] })).filter(fuel => fuel.amount > 0);
});
const fuelToStore = computed(() => {
  const visit = current.value?.visit;
  if (!visit) return [];
  const banked = new Map(NON_HUMILITY_EGG_IDS.map(([egg, id]) => [egg, visit.fuelByEgg.get(id) ?? 0]));
  return (
    fuelNeeds.value
      .map(need => ({ egg: need.egg, need: need.amount, amount: need.amount - (banked.get(need.egg) ?? 0) }))
      // Relative, so rounding in a fuel total that exactly empties the tank does not read as a shortfall.
      .filter(fuel => fuel.amount > fuel.need * 1e-9)
  );
});

const fuelToStoreTotal = computed(() => fuelToStore.value.reduce((sum, fuel) => sum + fuel.amount, 0));
// How far the stores this ship set needs overshoot the room the tank has for them. Known before staging
// tries, so the card can say why rather than let it fail on the tank check.
const fuelOverflow = computed(() => {
  const free = current.value?.tankFree ?? 0;
  const over = fuelToStoreTotal.value - free;
  return over > fuelToStoreTotal.value * 1e-9 ? over : 0;
});

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

// How long the plan waits for the gems before the ships can go, on the set it has on and, where a swap
// can be offered, on the earnings set. The launch's own duration is that wait plus the flight.
const saving = computed(() => {
  if (!projected.value || totalShips.value === 0) return null;
  try {
    const context = getSimulationContext();
    const durations = previewLaunchDurations(actionsStore.actions, projected.value, context);
    if (!durations) return null;
    const flight = launchSchedule(launches.value, context.epicResearchLevels['afx_mission_time'] ?? 0).totalSeconds;
    return {
      seconds: Math.max(0, durations.seconds - flight),
      withEarningsSet:
        durations.withEarningsSet === undefined ? undefined : Math.max(0, durations.withEarningsSet - flight),
    };
  } catch {
    return null;
  }
});

// Ticked whenever the swap is faster; the player can untick it to keep the plan's set.
const swapChoice = ref<boolean | null>(null);
const swapSet = computed({
  get: () => {
    if (swapChoice.value !== null) return swapChoice.value;
    const wait = saving.value;
    return wait?.withEarningsSet !== undefined && wait.withEarningsSet < wait.seconds;
  },
  set: value => {
    swapChoice.value = value;
  },
});
watch(
  () => current.value?.visit.visitId,
  () => {
    swapChoice.value = null;
  }
);

const stagedLaunch = computed(() => {
  const visit = current.value?.visit;
  if (!visit) return null;
  const tag = humilitySourceTag(visit.visitId);
  for (const action of actionsStore.actions) {
    if (action.sourceTag === tag && action.type === 'launch_missions') return action;
  }
  return null;
});

// Whether the plan already holds this answer, so the card can say so instead of offering to stage what is
// there. The same ships can answer two questions, a different effort for one, and those differ in the wait
// staged after the launch, so an answer staged in this session is also matched on what it was asked.
const inPlan = computed(() => {
  const visit = current.value?.visit;
  if (!visit || !shown.value || !stagedLaunch.value || launches.value.length === 0) return false;
  const signature = (
    missions: readonly { ship: number; duration: number; count: number; targetAfxId?: number; doubled?: true }[]
  ) =>
    missions
      .map(m => `${m.ship}|${m.duration}|${m.targetAfxId ?? ''}|${m.doubled ? 2 : 1}|${m.count}`)
      .sort()
      .join(',');
  if (signature(stagedLaunch.value.payload.missions) !== signature(launches.value)) return false;
  const staged = store.stagedAnswers[visit.visitId];
  return !staged || (staged.key === shown.value.key && staged.swap === swapSet.value);
});

const staging = ref(false);
const stageError = ref('');
watch(questionKey, () => {
  stageError.value = '';
});

async function stage() {
  if (!projected.value || !shown.value || staging.value) return;
  staging.value = true;
  stageError.value = '';
  try {
    const swap = swapSet.value;
    const { visitId, key } = shown.value!;
    await missionsStore.stage(projected.value, { equipEarningsSet: swap });
    store.stagedAnswers[visitId] = { key, swap };
  } catch (err) {
    stageError.value =
      err instanceof HumilityMissionsError ? err.message : plainError(err, "Couldn't stage the ship set. Try again.");
  } finally {
    staging.value = false;
  }
}
</script>
