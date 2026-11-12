<!--
  THE PLAYER LINE (Jordan, 12 Nov 2026): right above Right now's egg row (RightNowCard's #player slot), the words from
  lib/playerLineWords.ts `playerLine`. Claimed and pending TE from the save (lib/playerTe.ts), Clothed TE the value Your
  eggs shows. The full line when it fits on one line; where it doesn't (measured, e.g. a long name with pending TE at
  390 px), the short form with "CTE" and its "?" (CLOTHED_TE_TIP). Each part stays whole, so a line breaks only at a
  dot. The name at heading size (text-title, bold; Jordan, 13 Nov 2026), the TE parts body size. Without the TE
  values: the name alone. The silo line (layout/SiloLine.vue) beside it from lg, under it below.
-->
<template>
  <div ref="row" class="relative flex flex-col gap-y-0.5 lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-4" data-testid="player-line-row">
    <p v-if="name || te" class="min-w-0 break-words text-body text-slate-700 tabular-nums" data-testid="player-line">
      <template v-if="te">
        <span v-if="!short" data-testid="player-line-full"><PartsOf :parts="partsOf(false)" /></span>
        <span v-else data-testid="player-line-short"
          ><PartsOf :parts="partsOf(true)" />{{ ' ' }}<HelpTip>{{ CLOTHED_TE_TIP }}</HelpTip></span
        >
      </template>
      <b v-else class="text-title font-bold text-slate-900">{{ name }}</b>
    </p>
    <!-- The full line on one line, out of sight in a 0 px box (no page scroll), to measure whether it fits. -->
    <span v-if="te" class="invisible absolute left-0 top-0 h-0 w-0 overflow-hidden pointer-events-none" aria-hidden="true"
      ><span ref="probe" class="inline-block whitespace-nowrap text-body tabular-nums"><PartsOf :parts="partsOf(false)" /></span
    ></span>
    <SiloLine :silo="silo" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import HelpTip from '@/components/auto/HelpTip.vue';
import SiloLine from '@/components/layout/SiloLine.vue';
import { CLOTHED_TE_TIP, playerLine } from '@/lib/playerLineWords';
import type { SiloLineState } from '@/lib/saveBanner';

const props = defineProps<{
  /** The save's in-game name (null: left out). */
  name: string | null;
  claimed: number | null;
  pending: number | null;
  /** Your eggs' Clothed TE (the gear's clothedEarnings). */
  clothed: number | null;
  silo: SiloLineState | null;
}>();

/** The TE values are all here: otherwise no TE line. */
const te = computed(() => props.claimed != null && props.clothed != null && Number.isFinite(props.clothed));
/** playerLine's own words, split at its dots so each part stays whole (the name at heading size, Jordan 13 Nov 2026;
 *  the TE parts stay body size). */
function partsOf(short: boolean): string[] {
  return playerLine({ name: props.name, claimed: props.claimed ?? 0, pending: props.pending, clothed: props.clothed, short }).split(' · ');
}
const PartsOf = defineComponent({
  props: { parts: { type: Array as () => string[], required: true } },
  setup: p => () =>
    p.parts.flatMap((part, i) => [
      ...(i ? [' · '] : []),
      i === 0 && props.name
        ? h('b', { class: 'whitespace-nowrap text-title font-bold text-slate-900' }, part)
        : h('span', { class: 'whitespace-nowrap' }, part),
    ]),
});

/** The short form only where the full line, on one line, is wider than the row. */
const row = ref<HTMLElement | null>(null);
const probe = ref<HTMLElement | null>(null);
const short = ref(false);
function fit(): void {
  if (row.value && probe.value) short.value = probe.value.offsetWidth > row.value.clientWidth;
}
let watcher: ResizeObserver | null = null;
onMounted(() => {
  fit();
  if (typeof ResizeObserver !== 'undefined' && row.value) {
    watcher = new ResizeObserver(fit);
    watcher.observe(row.value);
  }
});
onUnmounted(() => watcher?.disconnect());
watch(() => [props.name, props.claimed, props.pending, props.clothed], () => void nextTick(fit));
</script>
