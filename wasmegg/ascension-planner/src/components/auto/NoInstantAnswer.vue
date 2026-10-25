<!--
  No instant answer for the player's TE (InstantRoute.vue): below the table's lowest TE, or no table
  at all. Where the answer would be, one clear line and what to do instead (Jordan, 18 Oct 2026: the
  old amber note read as "we don't support you", and the quick scan only ran from Nearby's Find).

  By a date fills the slot with its Get a quick estimate button (DeadlinePanel.vue, which runs its own
  `findWithoutInstant` through Find's `start`). Fastest has no quick estimate of its own: the fallback is
  By a date runs (store `startDeadline`, search/autoWiden.ts `quickScanSpec`), and Fastest's coarse scan
  is off (ChainSearchPanel.vue, removed 12 Oct 2026). So by default it points to By a date's.
-->
<template>
  <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2" data-testid="instant-none">
    <p class="text-sm font-black text-slate-900" data-testid="instant-none-heading">{{ heading }}</p>
    <p v-if="sub" class="text-[11px] text-slate-600">{{ sub }}</p>
    <slot>
      <p class="text-[12px] text-slate-700 leading-relaxed" data-testid="instant-none-fastest">
        The quick estimate is on {{ NAMES.byDate }}: pick a date there and press
        <b>{{ QUICK_ESTIMATE_LABEL }}</b>. The {{ NAMES.smart }} search below still runs here, starting from a route spaced out
        from your TE.
      </p>
      <button
        type="button"
        class="min-h-[44px] px-4 rounded-lg border border-indigo-300 bg-white text-[11px] font-black uppercase tracking-widest text-indigo-800 hover:bg-indigo-50"
        data-testid="instant-none-open-by-date"
        @click="emit('by-date')"
      >
        Open {{ NAMES.byDate }}
      </button>
    </slot>
  </div>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import { QUICK_ESTIMATE_LABEL } from '@/search/autoWiden';

defineProps<{
  /** "No instant answer below TE 120." or "No instant answer for your TE yet." (search/autoWiden.ts
   *  `noInstantHeading`). */
  heading: string;
  /** One more plain line under it, or ''. */
  sub?: string;
}>();
const emit = defineEmits<{ 'by-date': [] }>();
</script>
