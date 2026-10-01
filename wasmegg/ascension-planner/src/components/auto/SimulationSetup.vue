<!--
  What artifacts the searches will use: the two sets each leg swaps between, and the inventory they
  are solved from. One card in Your setup (YourSetup.vue) for every screen; Smart search and the
  Full sweep each had their own, showing different things (the user, 30 Sept: "it isn't the same in
  every place"). This keeps Smart search's Delivery / Earnings toggle, the full inventory behind a
  second click, and the caveat that the inventory is held fixed for the whole plan. The save's own
  figures and anything wrong with it went to Your setup's "Your save" card: the user asked for this
  one to be just the artifacts.

  WHY IT EXISTS. A search has no opinion about whether its inputs make sense: an empty inventory
  prices every chain consistently against a farm nobody owns and returns a confident answer three
  times too slow. Seeing the sets before pressing Find is the cheapest check there is.
-->
<template>
  <div class="space-y-3">
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 text-left"
      :aria-expanded="open"
      @click="toggle"
    >
      <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">What artifacts it will use</h3>
      <span class="text-[10px] font-bold text-indigo-700">{{ open ? 'hide' : 'show' }}</span>
    </button>

    <div v-if="open && inventory" class="space-y-4">
      <p class="text-[11px] text-slate-500 leading-relaxed">
        The simulator doesn't wear a fixed set, or what you have equipped. It re-solves the best loadout inside
        <span class="font-semibold">every leg</span> from your virtue inventory, and swaps between two: the
        <span class="font-semibold">delivery</span> set while it builds the farm, and the
        <span class="font-semibold">earnings</span> set when it cashes out.
      </p>

      <div class="flex gap-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        <button
          v-for="tab in ['elr', 'earnings'] as const"
          :key="tab"
          type="button"
          class="px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
          :class="setTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          @click="setTab = tab"
        >
          {{ tab === 'elr' ? 'Delivery (leg 1)' : 'Earnings' }}
        </button>
      </div>
      <LoadoutDisplay :loadout="setTab === 'elr' ? inventory.elr : inventory.earnings" />
      <p v-if="setTab === 'elr'" class="text-[11px] text-slate-500 leading-relaxed">
        Solved against your research <span class="font-semibold">as it is today</span>, so this is the set the first leg
        runs with. Every later leg re-solves against its own research and will pick something different.
      </p>
      <p v-else class="text-[11px] text-slate-500 leading-relaxed">
        The best earnings set your inventory can build. It doesn't depend on research, so it's the same in every leg.
      </p>

      <!-- The pile itself, behind a second click: ten thousand chips of T1 commons buried the two sets. -->
      <div class="border-t border-slate-100 pt-3">
        <button
          type="button"
          class="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-700"
          :aria-expanded="rawOpen"
          @click="rawOpen = !rawOpen"
        >
          {{ rawOpen ? '&#8964;' : '&#8250;' }} Everything it chooses from ({{
            totalArtifacts.toLocaleString()
          }}
          artifacts, {{ totalStones.toLocaleString() }} stones)
        </button>
        <div v-if="rawOpen" class="mt-3 space-y-3">
          <div v-if="inventory.artifacts.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="a in inventory.artifacts"
              :key="a.label"
              class="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700"
            >
              <span v-if="a.count > 1" class="text-slate-400">{{ a.count }}&#215; </span>{{ a.label }}
            </span>
          </div>
          <div v-if="inventory.stones.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="st in inventory.stones"
              :key="st.label"
              class="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-800"
            >
              <span v-if="st.count > 1" class="text-indigo-400">{{ st.count }}&#215; </span>{{ st.label }}
            </span>
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            Most of these never get worn. The solver picks from the whole pile, so the pile is its input, but only the
            two sets above are what any leg runs with.
          </p>
        </div>
      </div>

      <p
        v-if="!inventory.artifacts.length && !inventory.stones.length"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed"
      >
        No virtue artifacts found in this save. Every leg is being simulated bare, which makes every plan look
        considerably slower than it will be.
      </p>
      <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
        <span class="font-black uppercase tracking-wide">Held fixed for the whole plan.</span>
        This is what you own <span class="font-semibold">today</span>, and the plan assumes it never changes. You'll
        craft and upgrade along the way, so the real run should come in <span class="font-semibold">faster</span> than
        the dates here. Comparisons between chains stay fair, because every one is simulated with the same inventory.
        After any big crafting, load your latest save and search again.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import LoadoutDisplay from './LoadoutDisplay.vue';

const store = useChainSearchStore();

/**
 * The sets, resolved on first open. Not a computed: `readInventory` solves a set-cover over the
 * whole inventory, and as a computed it would re-run on every unrelated store change, on the main
 * thread, while a search streams progress into that same store. Re-read when opened again, so a
 * newly loaded save shows.
 */
const open = ref(false);
const inventory = ref<ReturnType<typeof store.readInventory> | null>(null);
const rawOpen = ref(false);
const setTab = ref<'elr' | 'earnings'>('elr');
function toggle(): void {
  open.value = !open.value;
  if (open.value) inventory.value = store.readInventory();
}

const totalArtifacts = computed(() => inventory.value?.artifacts.reduce((n, a) => n + a.count, 0) ?? 0);
const totalStones = computed(() => inventory.value?.stones.reduce((n, x) => n + x.count, 0) ?? 0);
</script>
