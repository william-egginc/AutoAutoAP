<!--
  The answer, the same way on both depths of Fastest route (the unified layout, phase 3): the
  route, how long it takes and when it lands, and the same row of things to do with it. Smart search
  and the Full sweep each had their own card with its own buttons ("Use this chain and build the
  plan", "Build this plan in the Auto Planner") in different places on the page.

  The route stays readable during a run -- it's the best so far, and always usable -- and the actions
  appear once the run stops. What each search wants to add (its guarantee, a contradiction it
  found) goes in the default slot.
-->
<template>
  <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
    <div class="flex items-baseline justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
          {{ running ? 'Best so far' : 'Fastest found' }}<template v-if="claim && !running">: {{ claim }}</template>
        </div>
        <div v-if="source" class="text-[10px] font-bold text-emerald-700/80">{{ source }}</div>
        <div class="font-mono-premium text-lg sm:text-xl font-black text-slate-900 break-words">
          {{ chain.join(' ') }}
        </div>
      </div>
      <div class="text-right">
        <div class="text-lg font-black text-slate-900 tabular-nums">
          {{ days > 0 ? `${days.toFixed(3)} d` : 'pricing…' }}
        </div>
        <div v-if="days > 0" class="text-[11px] font-bold text-emerald-800">
          reaches {{ finalTE }} on {{ endLabel }}
        </div>
      </div>
    </div>

    <slot />

    <div v-if="!running && days > 0" class="flex flex-wrap items-center gap-2 pt-2">
      <button
        type="button"
        :disabled="busy"
        class="px-4 py-2 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800 disabled:opacity-40"
        @click="emit('build')"
      >
        Build this plan
      </button>
      <button
        v-if="canFill"
        type="button"
        class="px-3 py-2 rounded-lg border border-emerald-300 bg-white text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:border-emerald-500"
        @click="emit('fill')"
      >
        Just fill it in
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg border border-emerald-300 bg-white text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:border-emerald-500"
        @click="toShare"
      >
        Share
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg border border-emerald-300 bg-white text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:border-emerald-500"
        @click="emit('csv')"
      >
        CSV ↓
      </button>
      <button
        v-if="canSave"
        type="button"
        :disabled="saving"
        class="px-3 py-2 rounded-lg border border-emerald-300 bg-white text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:border-emerald-500 disabled:opacity-40"
        @click="emit('save')"
      >
        {{ saving ? 'Saving...' : 'Save run' }}
      </button>
      <span v-if="note" class="text-[11px] font-semibold text-emerald-800">{{ note }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  }>(),
  { claim: '', source: '', busy: false, canFill: false, canSave: false, saving: false, note: '' }
);
const emit = defineEmits<{ build: []; fill: []; csv: []; save: [] }>();

/** Each panel's Share this result section carries id="share-this-result"; one panel is on screen. */
function toShare(): void {
  document.getElementById('share-this-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>
