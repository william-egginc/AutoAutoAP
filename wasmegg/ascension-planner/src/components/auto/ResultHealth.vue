<!--
  The health check on a Fastest answer (search/health.ts, store `resultContradictions`), titled by how
  bad it is. An error (the result can't be right as it stands) keeps the red "This result contradicts
  itself" box and the advice to run it again. Warnings only (a leg that takes very long, say) are an
  amber "Worth checking" box: they used to sit under the red title too (the user, egg-beta review 11 Oct).
  Which issues stop a submission is decided elsewhere (only 'error'), not here.
-->
<template>
  <div
    v-if="issues.length"
    class="rounded-lg border p-3 space-y-1"
    :class="hasError ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'"
    :data-testid="hasError ? 'result-contradicts' : 'result-worth-checking'"
  >
    <p
      class="label"
      :class="hasError ? 'text-rose-800' : 'text-amber-800'"
    >
      {{ hasError ? 'This result contradicts itself' : 'Worth checking' }}
    </p>
    <p
      v-for="(issue, k) in issues"
      :key="k"
      class="text-body"
      :class="hasError ? 'text-rose-900/90' : 'text-amber-900'"
    >
      {{ issue.message }}
    </p>
    <p v-if="hasError" class="text-body text-rose-900/80 max-w-prose">
      Reload your backup and run it again before trusting these dates, and compare leg 1 against the official
      planner. If leg 1 agrees and a later leg doesn't, the fault is in the state carried between legs.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ issues: readonly { level: 'error' | 'warning'; message: string }[] }>();
const hasError = computed(() => props.issues.some(i => i.level === 'error'));
</script>
