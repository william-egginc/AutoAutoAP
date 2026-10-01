<!--
  Where everything went: the new layout (four tabs, lib/siteNav.ts) explained once, to players who
  knew the old one. Shown until dismissed, remembered in this browser, and reopened from "What moved?"
  under the tabs. Each line is a link to the screen it names (plain hash links; App follows them).
-->
<template>
  <section class="rounded-2xl border border-indigo-200 bg-white p-4 sm:p-5 space-y-3 shadow-sm">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="text-base font-black text-slate-900">The site has a new layout</h2>
        <p class="text-[12px] text-slate-600">Same tools, fewer places to look. Here's where everything went.</p>
      </div>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800"
        @click="emit('close')"
      >
        Got it
      </button>
    </div>

    <ul class="grid gap-2 sm:grid-cols-2 text-[12px] text-slate-700">
      <li v-for="m in MOVES" :key="m.where" class="rounded-lg bg-slate-50 px-3 py-2">
        <a
          v-if="m.href"
          :href="m.href"
          class="font-bold text-indigo-700 hover:text-indigo-900 underline decoration-indigo-200"
          >{{ m.where }}</a
        >
        <span v-else class="font-bold text-slate-800">{{ m.where }}</span>
        <span class="block text-slate-600">{{ m.what }}</span>
      </li>
    </ul>

    <p class="text-[11px] text-slate-500 leading-relaxed">
      Old links, sweep links and the Egg Day link still work, and open the right screen. The Manual Planner and Classic
      are Joo's planners, unchanged; the searches, the leaderboard and the Explorer are built on top of them.
    </p>
  </section>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';

const emit = defineEmits<{ close: [] }>();

const MOVES: { where: string; href?: string; what: string }[] = [
  {
    where: `${NAMES.auto} › Your setup`,
    href: '#/auto/classic',
    what: 'Plan start, awake hours, time off and how much of your computer to use: set once, from the ⚙ Setup button at the bottom right of every Auto Planner screen.',
  },
  {
    where: `${NAMES.fastest} › ${NAMES.smart}`,
    href: '#/auto/fastest',
    what: 'Was Chain Search. Starts from your chain and homes in on faster checkpoints.',
  },
  {
    where: `${NAMES.fastest} › ${NAMES.full}`,
    href: '#/auto/fastest/full',
    what: 'Was Insane mode. Prices every route in a range you set.',
  },
  {
    where: `${NAMES.auto} › ${NAMES.byDate}`,
    href: '#/auto/by-date',
    what: "Was Insane mode's date goal: the highest TE you can reach by a date, Egg Day included.",
  },
  {
    where: NAMES.compare,
    href: '#/compare',
    what: `Was the Leaderboard. The Chain Explorer's charts are its ${NAMES.insights} tab.`,
  },
  {
    where: NAMES.science,
    href: '#/science',
    what: `Was the Explorer's Help fill the gaps and Submit a sweep: the sweeps we still need (they run right there), and where to upload one.`,
  },
  {
    where: 'A search that is running',
    what: 'Shows at the top of every other tab, with its progress and Stop, so you can look around while it works.',
  },
  {
    where: NAMES.manual,
    href: '#/manual',
    what: 'Unchanged.',
  },
];
</script>
