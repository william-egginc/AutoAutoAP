<!--
  Find a run (the third tab): the instant answer for the loaded save (InstantAnswer.vue: goal, setup
  line, filters, rows), Save this plan into the Saved runs (the Auto Planner tab, kept in localStorage
  per account under Joo's hashed ID), then the blurb. Nothing here reads the AutoAutoAP board or sends
  anything anywhere (instant/noBoardRequests.spec.ts checks these folders).
-->
<template>
  <div class="max-w-4xl mx-auto mt-4 space-y-4 pb-24" data-testid="find-a-run">
    <InstantAnswer
      :saved-ids="savedIds"
      @simulate="req => emit('simulate', req)"
      @save="save"
      @edit-setup="emit('editSetup')"
    />
    <p class="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-900" data-testid="find-blurb">
      <b>Want to dive deeper?</b> Go to egg.williamstest.fyi. <span class="opacity-80">Note: it may not be up.</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { SimulateRequest } from '@/instant/simulatePlan';
import { browserStorage, planId, readPlans, recordPlan, type PlanEntry } from '@/instant/plansOnDevice';
import { accountHash } from '@/instant/accountHash';
import InstantAnswer from './InstantAnswer.vue';

const props = defineProps<{
  /** The loaded account; only its hash (Joo's hashID) is used, as the saved list's key. */
  playerId?: string;
  /** A list to use instead of this browser's (specs). */
  plans?: PlanEntry[];
}>();
const emit = defineEmits<{ simulate: [req: SimulateRequest]; editSetup: [] }>();

const plans = ref<PlanEntry[]>(props.plans ?? []);
const savedIds = computed(() => plans.value.map(planId));
const hash = ref<string | null>(null);

onMounted(() => {
  if (props.plans) return;
  watch(
    () => props.playerId,
    async () => {
      hash.value = await accountHash(props.playerId);
      plans.value = readPlans(browserStorage(), hash.value);
    },
    { immediate: true }
  );
});

async function save(entry: PlanEntry): Promise<void> {
  if (props.plans) {
    plans.value = [entry, ...plans.value];
    return;
  }
  const h = hash.value ?? (await accountHash(props.playerId));
  plans.value = recordPlan(browserStorage(), h, entry);
}
</script>
