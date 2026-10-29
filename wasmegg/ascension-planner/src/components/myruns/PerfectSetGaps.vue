<!--
  "Missing for a perfect set" (Q9, 18 Oct 2026), folded under Right now's Gear (GearBlock.vue): each set the Gear
  rows show, against every artifact at T4 Legendary with every stone slot filled at tier 4 (lib/perfectSet.ts).
  From the loaded save only; nothing is priced. The one-line count shows on the fold so a phone need not open it.
-->
<template>
  <details class="mt-1 border-t border-slate-100 py-1.5" data-testid="now-gear-perfect">
    <summary class="cursor-pointer list-none text-small">
      <span class="text-small font-bold text-slate-700">Missing for a perfect set</span>
      <span class="ml-2 text-small text-slate-600" data-testid="now-gear-perfect-headline">{{ headline }}</span>
      <span class="ml-1 text-small font-bold text-indigo-700">▸ slot by slot</span>
    </summary>
    <div class="mt-2 space-y-3 max-w-xl">
      <p v-if="!gaps" class="text-body text-slate-600">{{ headline }}</p>
      <template v-else>
        <p class="text-body text-slate-500 max-w-prose">
          Perfect here is the maxed instant answer's bar: every artifact T4 Legendary, every stone slot filled at tier
          4. Only rarity, tier and stones are compared, not which artifacts or stone types suit each set.
        </p>
        <div v-for="s in gaps.sets" :key="s.id" class="space-y-1" :data-testid="`now-gear-perfect-${s.id}`">
          <p class="label text-slate-500">{{ s.name }}</p>
          <p v-if="s.sameAs" class="text-body text-slate-600">{{ s.sameAs }}</p>
          <p
            v-else-if="!s.upgrades.length && !s.missing.length && !s.tiers.length"
            class="text-body text-emerald-800"
          >
            Nothing missing: every artifact T4 Legendary, every stone tier 4.
          </p>
          <template v-else>
            <div v-for="grp in groupsOf(s)" :key="grp.title">
              <p class="text-body font-bold text-slate-700">{{ grp.title }}</p>
              <ul class="list-disc pl-5 text-small text-slate-700">
                <li v-for="line in grp.lines" :key="line">{{ line }}</li>
              </ul>
            </div>
          </template>
        </div>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SetMatch } from '@/lib/gearMatch';
import { perfectSetGaps, type SetGaps } from '@/lib/perfectSet';

const props = defineProps<{
  equipped: EquippedArtifact[] | null;
  earnings: EquippedArtifact[] | null;
  production: EquippedArtifact[] | null;
  match?: SetMatch;
}>();

const gaps = computed(() =>
  perfectSetGaps({
    equipped: props.equipped,
    earnings: props.earnings,
    production: props.production,
    match: props.match ?? null,
  })
);
const headline = computed(() => gaps.value?.headline ?? 'No virtue gear in the loaded save to compare.');

function groupsOf(s: SetGaps): { title: string; lines: string[] }[] {
  return [
    { title: 'Artifacts to upgrade', lines: s.upgrades },
    { title: 'Missing stones', lines: s.missing },
    { title: 'Stones below tier 4', lines: s.tiers },
  ].filter(g => g.lines.length);
}
</script>
