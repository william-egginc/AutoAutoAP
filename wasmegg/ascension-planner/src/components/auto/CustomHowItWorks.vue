<!--
  How Custom (the Full sweep) works and what it costs, and how the work is split: what InsanePanel's own "How Custom works,
  and what it costs" fold said, word for word. It sits in Custom's one fold now, "How Custom works" (ExhaustivePromise.vue,
  on Fastest; UX fluff review 2, 5 Nov 2026, item C-pre2: two folds for one subject).
-->
<template>
  <div class="pt-2 text-body text-slate-600 space-y-2" data-testid="custom-how-it-works">
    <p>
      This prices <span class="font-bold">every</span> route in the ranges you describe, with no descent, stages or
      pruning, so the winner is the true optimum of that space, not a local one. It is also the mode that gets out
      of hand fastest: the ranges multiply, so halving the step in each does far more than double the work.
    </p>
    <p>
      Nothing here is capped. Above 100,000 routes, Run Custom asks you to confirm first; above 500,000 it asks twice.
      The count and estimate below update as you type, so check them before you press Run Custom.
    </p>
    <!-- How the work is split: explanation, so it sits here with the rest (it was between the
         estimate and Find). -->
    <p class="pt-2 font-bold text-slate-800">How the work is split</p>
    <p>
      <span class="font-bold text-slate-800">Routes are sorted so related ones sit together.</span> Every route
      starting <code class="tabular-nums">195 229</code> sits next to the others that start that way, because
      the expensive unit is the <span class="font-bold">ascension</span>, not the route. Two routes that share their
      first three stops share those three ascensions' simulations exactly.
    </p>
    <p>
      <span class="font-bold text-slate-800"
        >The sorted list is cut into chunks of {{ store.workersInPool * 2 }}</span
      >
      (workers × 2) and handed to the pool one chunk at a time. The pool splits each chunk across workers by
      prefix, so each worker gets a family of related routes instead of a random handful, and its memo pays off.
    </p>
    <p>
      <span class="font-bold text-slate-800">Each worker simulates ascensions and remembers them.</span> An ascension is a full
      farm simulation: research purchases, hab and vehicle upgrades, twelve egg shifts, sale timing. That is
      where the ~15 s goes. A route whose prefix the worker has already priced only pays for its new ascensions, which
      is why the real cost lands well under the estimate.
    </p>
    <p>
      <span class="font-bold text-slate-800">Progress comes from the workers themselves.</span> Each worker
      reports after every route it finishes, so the bar moves steadily and you can tell a dead worker from one
      that is still thinking. The s/route figure under the bar is measured on this machine, not carried over from
      another one.
    </p>
    <p>
      <span class="font-bold text-slate-800">Stop is checked between chunks.</span> A chunk in flight finishes
      first, so on a space with long routes "Stopping…" can sit for a minute or two. Nothing is lost: everything
      priced so far stays, and the best of it is your answer.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';

const store = useChainSearchStore();
</script>
