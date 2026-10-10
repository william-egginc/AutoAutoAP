<template>
  <!-- Sharing this check (search/instantRecord.ts), beside the instant answer's Check exactly button: one
       check, or every check from now on ("Keep sharing my checks", the same setting as Your setup › Sharing). -->
  <div
    class="rounded-lg border border-emerald-200 bg-white/70 px-2.5 py-1.5 text-[11px] text-slate-700 space-y-0.5"
    data-testid="share-check"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <label class="inline-flex items-center gap-1.5 cursor-pointer" :title="title">
        <input
          :checked="shareThis"
          type="checkbox"
          class="rounded border-slate-300 text-indigo-600"
          data-testid="share-this-check"
          @change="emit('update:shareThis', ($event.target as HTMLInputElement).checked)"
        />
        <span class="font-bold text-slate-800">Share this check</span> (anonymous)
      </label>
      <label class="inline-flex items-center gap-1.5 cursor-pointer" :title="title">
        <input
          :checked="keepSharing"
          type="checkbox"
          class="rounded border-slate-300 text-indigo-600"
          data-testid="keep-sharing"
          @change="emit('update:keepSharing', ($event.target as HTMLInputElement).checked)"
        />
        Keep sharing my checks
      </label>
      <span
        v-if="status"
        class="text-[10px]"
        :class="sent ? 'text-emerald-700' : 'text-slate-500'"
        data-testid="share-status"
        >{{ status }}</span
      >
    </div>
    <p class="text-[10px] text-slate-500 leading-snug">
      Sends this answer and its exact times to the planner's maintainer when Check exactly finishes, to make the
      instant answer more accurate. Never your player ID, never shown on the board. At most once an hour per save.
    </p>
  </div>
</template>

<script setup lang="ts">
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
