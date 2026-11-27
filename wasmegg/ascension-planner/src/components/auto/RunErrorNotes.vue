<!--
  A run's warnings (store `runNotes`) and its error, the same two boxes on every search screen.

  The error box says whether the search never started ("Didn't start:", a pre-flight refusal: nothing
  ran, so nothing needs resuming) or failed partway ("Search failed:"); what a failure leaves behind
  differs per search, so that advice is the screen's (default slot, shown only after a start).

  By a date passes `labelled` false: the store doesn't reset `errorBeforeStart` when a date search
  starts, so a "Didn't start" label could be left over from a Fastest run.
-->
<template>
  <p
    v-if="notes.length && !error"
    class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-body text-amber-900"
    data-testid="run-notes"
  >
    <span v-for="n in notes" :key="n" class="block">{{ n }}</span>
  </p>
  <div
    v-if="error"
    class="p-4 bg-red-50 border border-red-200 rounded-xl text-body text-red-800 space-y-1.5"
    data-testid="run-error"
  >
    <p>
      <span v-if="labelled" class="label">{{
        beforeStart ? "Didn't start:" : 'Search failed:'
      }}</span>
      {{ error }}
    </p>
    <!-- A pre-flight refusal: nothing ran, so crash advice would only send people looking for a problem
         that is not there. -->
    <p v-if="labelled && beforeStart" class="text-red-700">
      The search checked your save before starting and stopped, so no time was lost and nothing needs resuming.
    </p>
    <p v-else-if="labelled && $slots.default" class="text-red-700"><slot /></p>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** The run's warnings; shown only when there is no error. */
    notes?: string[];
    /** The error to show, or empty/null for none (the screen leaves out the integrity notice's own). */
    error?: string | null;
    /** The search refused before anything ran. */
    beforeStart?: boolean;
    /** "Didn't start:" / "Search failed:" and the advice under it. */
    labelled?: boolean;
  }>(),
  { notes: () => [], error: null, beforeStart: false, labelled: true }
);
</script>
