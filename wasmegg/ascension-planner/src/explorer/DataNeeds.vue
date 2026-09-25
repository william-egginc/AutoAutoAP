<!--
  "We could use more data for:" -- the gaps in the corpus, worked out from the loaded rows, each with
  the sweep that fills it, how many chains that is from the viewer's TE, and roughly how long it
  takes on three sizes of machine. The coverage rules and the timing model are in needs.ts.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-end gap-3">
      <label class="space-y-1">
        <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Your TE now</span>
        <input
          v-model.number="teNow"
          type="number"
          min="1"
          max="489"
          class="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]"
        />
      </label>
      <p class="text-[10px] text-slate-400 max-w-md">
        The ranges below are fitted to this: your 1st ascension's range starts just above your TE. Times are estimates
        from the speeds other players' runs recorded; the planner's Re-benchmark button measures your own machine.
      </p>
    </div>

    <p v-if="!needs.length" class="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
      Nothing on the list right now: every gap has enough accounts. New kinds of question will show up here as they come
      up.
    </p>

    <!-- Three lists, not one: the everyday gaps, then runs sized for big machines, then the
         longest chains. A 30,000-chain overnight job in the same list as a 20-minute sweep reads as
         the same ask, and the 7-9 ascension runs answer a different question (where adding
         ascensions stops paying) from the rest. -->
    <section v-for="group in groups" :key="group.id" class="space-y-2">
      <div v-if="group.items.length" class="space-y-1 pt-1">
        <p class="text-[12px] font-bold text-slate-800">{{ group.title }}</p>
        <p v-if="group.intro" class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">{{ group.intro }}</p>
      </div>
      <ol v-if="group.items.length" class="space-y-2">
        <li
          v-for="need in group.items"
          :key="need.id"
          class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-[12px] font-bold text-slate-900">{{ need.title }}</span>
            <span class="text-[10px] font-semibold text-slate-500">
              {{ need.have }} of {{ need.want }} accounts · who: {{ need.who }}
            </span>
          </div>
          <p class="text-[11px] text-slate-600 leading-relaxed">{{ need.why }}</p>
          <!-- Only when there is something to run: with no chains there are no buttons to press. -->
          <p v-if="need.chains > 0" class="text-[11px] text-slate-700">
            {{
              need.links.length > 1 ? 'Press both buttons below, one after the other.' : 'Press Run this sweep below.'
            }}
            It opens <b>“{{ need.presetLabel }}”</b> in the planner's Insane mode, trying {{ bandsInWords(need.bands) }}.
            <template v-if="need.minGap > 0">Ascension targets stay at least {{ need.minGap }} TE apart.</template>
            {{ need.note ? need.note : '' }}
          </p>
          <div v-if="need.chains > 0" class="grid gap-1 sm:grid-cols-4 text-[11px]">
            <div class="rounded bg-white px-2 py-1">
              <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Chains</div>
              <div class="font-bold text-slate-800">
                {{ (need.chains * need.runs).toLocaleString()
                }}<template v-if="need.runs > 1"> ({{ need.runs }} runs)</template>
              </div>
            </div>
            <div v-for="t in need.times" :key="t.id" class="rounded bg-white px-2 py-1">
              <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">
                {{ t.label }} · {{ t.detail }}
              </div>
              <div class="font-bold text-slate-800">about {{ t.text }}</div>
            </div>
          </div>
          <p v-else class="text-[10px] font-semibold text-amber-700">
            No plan fits this sweep from {{ teNow }} TE: its ascension ranges, with targets at least
            {{ need.minGap }} TE apart, leave no room above where you already are.
          </p>
          <div v-if="need.chains > 0" class="flex flex-wrap items-center gap-2 pt-1">
            <a
              v-for="link in need.links"
              :key="link.href"
              :href="link.href"
              target="_blank"
              rel="noopener"
              class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
            >
              {{ link.label }} &rarr;
            </a>
            <span class="text-[10px] text-slate-400">
              Opens the planner in a new tab with all of this filled in. You enter your player ID there; this page never
              sees it.
            </span>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CollectorRow } from './collector';
import { COMPUTE_TIERS, dataNeeds, estimateSeconds, formatEstimate, presetBandsFor, presetChains } from './needs';
import { measuredWorkerSeconds } from '@/search/speed';
import { SWEEP_PRESETS } from './upload';
import { sweepRequestQuery } from '@/search/sweepRequest';
import { parseBands } from '@/search/exhaustive';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

/** "181-250:1; 276-300:2" as players read it: "your 1st ascension at TE 181 to 250 (every TE) and
 *  your 2nd at TE 276 to 300 (every 2nd TE)". The `lo-hi:step` notation meant nothing to them. */
function bandsInWords(text: string): string {
  const bands = parseBands(text);
  if (!bands.length) return 'the ranges shown in the planner';
  const every = (b: number[]) => {
    const step = b.length > 1 ? b[1] - b[0] : 1;
    return step <= 1 ? 'every TE' : `every ${ORDINAL[step - 1] ?? `${step}th`} TE`;
  };
  const parts = bands.map((b, i) => {
    const where = b.length > 1 ? `TE ${b[0]} to ${b[b.length - 1]} (${every(b)})` : `TE ${b[0]}`;
    return i === 0 ? `your 1st ascension at ${where}` : `your ${ORDINAL[i] ?? `${i + 1}th`} at ${where}`;
  });
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const props = defineProps<{ rows: CollectorRow[] }>();
/** The board's own sweep speeds by chain length (search/speed.ts), for the time estimates. */
const measuredSpeed = computed(() => measuredWorkerSeconds(props.rows));

const TE_KEY = 'chain-explorer:te-now';
function readTE(): number {
  try {
    const v = Number(localStorage.getItem(TE_KEY));
    return Number.isFinite(v) && v > 0 && v < 490 ? v : 180;
  } catch {
    return 180;
  }
}
const teNow = ref(readTE());
watch(teNow, v => {
  try {
    if (Number.isFinite(v) && v > 0) localStorage.setItem(TE_KEY, String(v));
  } catch {
    /* private window: the default next time is fine */
  }
});

const needs = computed(() => dataNeeds(props.rows));

/**
 * Links into the planner's Insane mode with the sweep filled in. Relative, so they resolve beside
 * this page wherever it is hosted (explorer.html and the planner's index share a directory). The
 * force-continue item is a pair on purpose: one run each way, on the same backup.
 */
function sweepLinks(
  needId: string,
  preset: string,
  label: string,
  bands: string,
  minGap: number
): { label: string; href: string }[] {
  const href = (forceContinue?: boolean) => `./${sweepRequestQuery({ preset, label, bands, minGap, forceContinue })}`;
  if (needId === 'force-continue') {
    return [
      { label: 'Finish my current ascension first', href: href(true) },
      { label: 'Ascend straight away', href: href(false) },
    ];
  }
  return [{ label: 'Run this sweep', href: href() }];
}

const GROUPS: { id: 'main' | 'gear' | 'big' | 'end'; title: string; intro: string }[] = [
  { id: 'main', title: 'We could use more data for:', intro: '' },
  {
    id: 'gear',
    title: "Accounts and gear we haven't seen yet",
    intro:
      'Every account on the board so far is at CTE 240 or more with a T4L Lunar totem and a T4L Demeters necklace, so TE and CTE always rise together. If your account matches one of these, one run teaches more than ten from the accounts we already have.',
  },
  {
    id: 'big',
    title: 'Bigger runs, for big machines',
    intro:
      "5 and 6 ascensions, looked at closely. Most accounts' fastest plans have 5 to 7 ascensions, and ascending even one TE off the best can cost days. M4 only tries every 5th TE, and on shorter plans that has landed 2 to 12 days behind trying every TE, so these runs try far more of the TEs in between. Each is tens of thousands of plans, more on lower accounts; each card shows how many from your TE and how long that takes.",
  },
  {
    id: 'end',
    title: 'The end of the line: 7, 8 and 9 ascensions',
    intro:
      'These show where adding ascensions stops saving time and starts costing it, so nobody plans more ascensions than they need. So far a 7th ascension has changed the total by only about 0.1 days on the saves that tried it, but weaker gear may want more. They try far fewer TEs to stay affordable, so read the result as an upper bound: a close look around the winner can still take a week or two off.',
  },
];

const groups = computed(() =>
  GROUPS.map(g => ({ ...g, items: rowsWithCost.value.filter(n => (n.group ?? 'main') === g.id) }))
);

const rowsWithCost = computed(() =>
  needs.value.map(need => {
    const preset = SWEEP_PRESETS.find(p => p.id === need.preset)!;
    const te = Number.isFinite(teNow.value) && teNow.value > 0 ? teNow.value : 180;
    const { chains, ascensions } = presetChains(need.preset, te);
    const bands = presetBandsFor(need.preset, te);
    return {
      ...need,
      presetLabel: preset.label,
      bands,
      links: sweepLinks(need.id, need.preset, preset.label, bands, preset.minGap),
      minGap: preset.minGap,
      chains,
      times: COMPUTE_TIERS.map(t => ({
        id: t.id,
        label: t.label,
        detail: t.detail,
        text: formatEstimate(estimateSeconds(chains * need.runs, ascensions, t, measuredSpeed.value)),
      })),
    };
  })
);
</script>
