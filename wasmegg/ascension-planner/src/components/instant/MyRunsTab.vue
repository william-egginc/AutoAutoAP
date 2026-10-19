<!--
  My runs: the instant answer for the loaded save, then "Your plans on this device" (the routes this
  browser opened with "Simulate this plan", kept in localStorage per account under Joo's hashed ID).
  Nothing here reads the AutoAutoAP board or sends anything anywhere (instant/noBoardRequests.spec.ts
  checks these folders).
-->
<template>
  <div class="max-w-4xl mx-auto mt-4 space-y-6 pb-24" data-testid="my-runs-tab">
    <InstantAnswer @simulate="onSimulate" />
    <PlansOnDevice :plans="plans" :timezone="timezone" @again="again" @clear="clear" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { hashID } from '@/lib/storage/db';
import type { SimulateRequest } from '@/instant/simulatePlan';
import { againStart, browserStorage, clearPlans, readPlans, recordPlan, type PlanEntry } from '@/instant/plansOnDevice';
import InstantAnswer from './InstantAnswer.vue';
import PlansOnDevice from './PlansOnDevice.vue';

const props = defineProps<{
  /** The loaded account; only its hash (Joo's hashID) is used, as the list's key. */
  playerId?: string;
  /** A list to show instead of this browser's (specs). */
  plans?: PlanEntry[];
}>();
const emit = defineEmits<{ simulate: [req: SimulateRequest] }>();

const planner = useAutoPlannerStore();
const timezone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

const plans = ref<PlanEntry[]>(props.plans ?? []);
const hash = ref<string | null>(null);

async function accountHash(): Promise<string | null> {
  if (!props.playerId) return null;
  try {
    return await hashID(props.playerId);
  } catch {
    return null;
  }
}

onMounted(() => {
  if (props.plans) return;
  watch(
    () => props.playerId,
    async () => {
      hash.value = await accountHash();
      plans.value = readPlans(browserStorage(), hash.value);
    },
    { immediate: true }
  );
});

function onSimulate(req: SimulateRequest, plan: PlanEntry): void {
  // The tab closes on the emit (the Auto planner opens): record first; the hash is ready after mount.
  if (!props.plans) {
    if (hash.value) plans.value = recordPlan(browserStorage(), hash.value, plan);
    else void accountHash().then(h => (plans.value = recordPlan(browserStorage(), h, plan)));
  }
  emit('simulate', req);
}

function again(p: PlanEntry): void {
  onSimulate({ chain: [...p.chain], start: againStart(p), a1: p.a1 }, { ...p, simulatedAt: Date.now() });
}

function clear(): void {
  if (!props.plans) clearPlans(browserStorage(), hash.value);
  plans.value = [];
}
</script>
