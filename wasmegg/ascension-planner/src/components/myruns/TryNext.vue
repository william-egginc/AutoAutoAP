<!--
  My runs' "Try next" (spec myruns-now v3, section 5; lib/tryNext.ts): up to four runs, each opening its screen set
  up. The player presses Find there; nothing starts from here.
-->
<template>
  <section v-if="pills.length || line" class="rounded-2xl border border-slate-200 bg-white p-4" data-testid="now-try-next">
    <p class="label text-slate-500">Try next</p>
    <div class="mt-1.5 flex flex-wrap gap-1.5">
      <button
        v-for="p in pills"
        :key="p.id"
        type="button"
        class="min-h-[44px] sm:min-h-0 rounded-full border border-indigo-200 bg-white px-3 py-1 text-small font-bold text-indigo-700 hover:bg-indigo-50"
        :data-testid="`now-try-${p.id}`"
        @click="emit('open', p.open)"
      >
        {{ p.label }} ›
      </button>
    </div>
    <p v-if="line" class="mt-1.5 text-body text-slate-600">{{ line }}</p>
  </section>
</template>

<script setup lang="ts">
import type { Pill } from '@/lib/tryNext';
import type { MyRunsOpen } from '@/lib/myRunsDashboard';

defineProps<{ pills: Pill[]; line: string }>();
const emit = defineEmits<{ open: [to: MyRunsOpen] }>();
</script>
