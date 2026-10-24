<!--
  THE POINTER (lib/searchPointer.ts) at the TOP of the instant area (23 Oct 2026): "Fast found 313 TE on your account.
  See it ↓" whenever a finished Fast, Exact or Custom result exists for this goal and save, whatever the instant area
  shows below it: the answer, still working, none for this TE, or the file not loaded (InstantRoute.vue, both sections).
-->
<template>
  <p class="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[12px] text-slate-700" data-testid="instant-pointer">
    {{ pointer.level }} found <b>{{ pointer.value }}</b> on your account.{{ ' ' }}<button
      type="button"
      class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline hover:text-indigo-900"
      data-testid="instant-pointer-link"
      @click="emit('see')"
    >
      {{ POINTER_LINK }}
    </button>
  </p>
</template>

<script setup lang="ts">
import { POINTER_LINK, type Pointer } from '@/lib/searchPointer';

defineProps<{ pointer: Pointer }>();
const emit = defineEmits<{ see: [] }>();
</script>
