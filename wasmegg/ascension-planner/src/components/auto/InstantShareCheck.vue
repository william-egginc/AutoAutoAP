<template>
  <!-- Sharing a search result (search/instantRecord.ts; was "Share this check" beside Check exactly until 23 Oct
       2026), at the bottom of the search panel once Fast, Exact or Custom has a result: this one, or every one from
       now on ("Share my search results", the same setting as Your setup › Sharing). That is the account's consent
       (ConsentBox.vue, composables/useConsent.ts, still stored as `keepSharingChecks`): remembered per account,
       folded to one line once on, withdrawn at once (the next result sends nothing). -->
  <div
    class="rounded-lg border border-emerald-200 bg-white/70 px-2.5 py-1.5 text-body text-slate-700 space-y-0.5"
    data-testid="share-check"
  >
    <ConsentBox
      :model-value="keepSharing"
      consent-id="keepSharingChecks"
      testid="keep-sharing"
      box-testid="keep-sharing"
      :title="title"
      label-class="!items-center"
      input-class="border-slate-300 text-indigo-600"
      summary-class="text-slate-700"
      @update:model-value="(v: boolean) => emit('update:keepSharing', v)"
    >
      <template #summary
        ><span>Sharing my search results with the planner's maintainer (anonymous)</span
        ><span
          v-if="status"
          class="text-small font-normal"
          :class="sent ? 'text-emerald-700' : 'text-slate-500'"
          data-testid="share-status"
          >· {{ status }}</span
        ></template
      >
      <template #before>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label class="inline-flex items-center gap-1.5 cursor-pointer" :title="title">
            <input
              :checked="shareThis"
              type="checkbox"
              class="rounded border-slate-300 text-indigo-600"
              data-testid="share-this-check"
              @change="emit('update:shareThis', ($event.target as HTMLInputElement).checked)"
            />
            <span class="font-bold text-slate-800">Share this result</span> (anonymous)
          </label>
          <span
            v-if="status"
            class="text-small"
            :class="sent ? 'text-emerald-700' : 'text-slate-500'"
            data-testid="share-status"
            >{{ status }}</span
          >
        </div>
      </template>
      <template #text><span>Share my search results</span></template>
      <template #after>
        <p class="text-small text-slate-500">
          Sends this result and the instant answer for the same goal to the planner's maintainer when a search
          finishes, to make the instant answer more accurate. Never your player ID, never shown on the board. At most
          once an hour per save.
        </p>
      </template>
    </ConsentBox>
  </div>
</template>

<script setup lang="ts">
import ConsentBox from './ConsentBox.vue';

defineProps<{
  shareThis: boolean;
  keepSharing: boolean;
  /** The line beside the boxes: what the last share did ('' for nothing yet). */
  status: string;
  /** The last share went through (green). */
  sent: boolean;
  /** Hover text: what is sent. */
  title: string;
}>();
const emit = defineEmits<{
  'update:shareThis': [value: boolean];
  'update:keepSharing': [value: boolean];
}>();
</script>
