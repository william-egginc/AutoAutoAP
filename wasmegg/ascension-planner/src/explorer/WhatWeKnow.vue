<!--
  What the board has taught us so far. The header counts and two numbers in the text (the 5-to-7
  count, the lowest Clothed TE) are COUNTED from the loaded runs (knowStats.ts); the findings
  themselves are the collector analyst's, checked on the date under the header (FINDINGS_CHECKED).
  Update that date, and the text, when the analyst re-checks them. A number in a finding that is not
  one of those two is as of that date and does not move with the board.

  PRIVACY: never list which accounts have their own tables (finding 1), or which accounts' tables
  were built from older runs (What we need next).

  Each finding is its own <details> in a plain <div> list, with the number drawn by hand. It used to
  be <li><details> under list-decimal, where the browser's number sat against the disclosure
  triangle ("1▶").
-->
<template>
  <section class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
    <div class="space-y-0.5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-black text-slate-900">What we know so far</h2>
        <span v-if="stats" class="text-[10px] font-bold text-slate-500" data-testid="know-header">
          {{ stats.runsTo490 }} runs to 490 TE · {{ stats.accounts }} accounts<template
            v-if="stats.te"
          >
            · TE {{ stats.te.min }}-{{ stats.te.max }}</template
          >
          · {{ stats.plans.toLocaleString('en-US') }} plans timed<template v-if="stats.byDate > 0">
            · {{ stats.byDate }} by a date<template v-if="stats.byDateAccounts > 0"> from {{ stats.byDateAccounts }} {{ stats.byDateAccounts === 1 ? 'account' : 'accounts' }}</template></template
          >
        </span>
        <span v-else class="text-[10px] font-bold text-slate-400">Counting the board…</span>
      </div>
      <p class="text-[10px] text-slate-500">Findings checked {{ FINDINGS_CHECKED }}</p>
    </div>

    <div class="rounded-lg border border-emerald-200 bg-white p-3 space-y-1 text-[12px] text-slate-800 leading-relaxed">
      <p class="text-[10px] font-black text-emerald-700 uppercase tracking-widest">The short answer</p>
      <p>
        <b>Use the instant answer, then Check exactly.</b> It finds your fastest route (or the highest TE by a date) for
        your gear in seconds, and Check exactly prices it with the full simulator.
      </p>
      <p>
        <b>Plan for 5 to 7 ascensions.</b>
        <template v-if="stats && stats.sweet.total">
          On {{ stats.sweet.of }} of {{ stats.sweet.total }} accounts the earliest-finishing plan has 5 to 7
          ascensions.
        </template>
        A 3rd is worth weeks to months at low TE; past 6 or 7 they add hours, not days.
      </p>
      <p><b>Ascend at the time the plan shows,</b> and run the instant answer again after each ascension.</p>
      <p><b>Below about 220 Clothed TE,</b> upgrade your earnings set first: your first ascension stalls.</p>
    </div>

    <p class="text-[11px] text-slate-500 leading-relaxed">
      Tap a point for the detail. The header counts are worked out from the board each time the page loads; the points
      were checked on the date above. The charts and tables further down are live too and show dates in your timezone.
    </p>

    <div class="space-y-1.5 text-[12px] text-slate-700 leading-relaxed">
      <details v-for="(f, i) in findings" :key="f.id" class="finding rounded-lg border border-emerald-100 bg-white">
        <summary class="finding-summary flex cursor-pointer items-start gap-2 px-3 py-2 font-bold text-slate-800">
          <span
            class="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-800"
            aria-hidden="true"
            >{{ i + 1 }}</span
          >
          <span class="flex-1">{{ f.headline }}</span>
          <span class="finding-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
        </summary>
        <div class="px-3 pb-3 pl-10 text-slate-700 space-y-2">
          <p v-if="f.id === 'match'">
            Each ascension lands within about an hour of the full simulator; a whole route can move by a day or two if
            an ascension falls near a sale-timed cliff (the instant answer ascends on the hour), so use Check exactly
            for the final word.
            Checked on Fliris (32 of 34 ascensions within 30 minutes), Halceyx (median within 0.3 hours on ~2,400
            ascensions), Allan (4 routes within an hour) and every new run this week. For the accounts it has
            precomputed on their own gear (10 so far) it reproduces their submitted runs to a median of 0.15% or
            better.
          </p>
          <p v-else-if="f.id === 'wider'">
            Halceyx's 120,000-plan sweep allowed only 5 ascensions, and its second checkpoint couldn't go below 201.
            From the same moment, his earlier small search's 198 231 291 was 0.73 days faster, and the instant answer's
            7-ascension route (198 220 249 281 315) is about 7.7 days faster still. Allan's Egg Day search allowed up
            to 4 stops; a 5-stop route (209 234 261 291 334) has about 17-19 hours more spare.
          </p>
          <p v-else-if="f.id === 'misses'">
            On 36 submitted runs it found a route at least as fast as the run's own best every time, and faster on 33.
            One miss is known: Fliris at 4 ascensions, where a full brute-force check found a route 12 hours better.
            Brute-force runs from more accounts would show how often that happens.
          </p>
          <template v-else-if="f.id === 'count'">
            <p>Finish brought forward by one more ascension (the instant answer's best routes):</p>
            <div class="overflow-x-auto">
              <table class="text-[11px] tabular-nums border-collapse">
                <thead>
                  <tr class="text-left text-slate-500">
                    <th class="py-1 pr-4 font-bold">from TE</th>
                    <th v-for="h in COUNT_HEADS" :key="h" class="py-1 pr-4 font-bold">{{ h }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in COUNT_TABLE" :key="r.te" class="border-t border-slate-100">
                    <td class="py-1 pr-4 font-bold text-slate-800">{{ r.te }}</td>
                    <td v-for="(cell, j) in r.cells" :key="j" class="py-1 pr-4">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              The board's runs agree. The last checkpoint before 490 sits around 280 with 2-3 ascensions and 285-335
              with 5-7.
            </p>
          </template>
          <template v-else-if="f.id === 'eggday'">
            <template v-if="stats && stats.eggDay.length">
              <p>Each account's best TE by Egg Day, so far:</p>
              <ul class="space-y-0.5 tabular-nums" data-testid="know-eggday">
                <li v-for="(e, k) in stats.eggDay" :key="k">
                  <b class="text-slate-800">{{ e.label }}</b
                  >: from TE {{ e.from }} reaches {{ e.reaches }}, in {{ e.ascensions }}
                  {{ e.ascensions === 1 ? 'ascension' : 'ascensions' }}
                </li>
              </ul>
            </template>
            <p>
              Where an account tried several counts, more ascensions reached higher, by 1-3 TE: Allan 333 with 3, 334
              with 4, 336 with 5. The instant answer finds Allan a 5-ascension route that reaches 335 with 6 hours to
              spare where his 4-ascension search reached 334. The highest TE usually leaves little slack: Allan's 336
              has 54 minutes to spare, while one TE lower (334) leaves 35 hours.
            </p>
          </template>
          <p v-else-if="f.id === 'bydate'">
            Checked on Fliris (6 Egg Day routes: 32 of 34 ascensions within 30 minutes of the real run), Allan (4
            routes, each within an hour once started from his real first stop) and this week's first By a date run with
            per-ascension times (within 0.4 hours per ascension, median). Where it differs from a by-date search, it's
            because the search's range left out better routes (Allan's 5-ascension route above), not because it priced
            them wrongly.
          </p>
          <p v-else-if="f.id === 'stall'">
            Under roughly 218-225 CTE it sits on Integrity saving up for habs; the planner won't run a plan that stalls
            more than a week. Every account on the board is above it<template v-if="stats && stats.lowestCte !== null">
              (lowest {{ cteText(stats.lowestCte) }})</template
            >. A full T4L earnings set with T4 Lunar stones adds +128.7 to CTE.
          </p>
          <p v-else-if="f.id === 'gear'">
            Waiting time scales with your delivery rate: a set at 94% of the best waits about 6% longer. The earnings
            set matters only while research is still being bought: nothing from about TE 340 up, most around TE
            190-216, where tier 13 opens. The site uses an instant answer built for your exact gear when there is one, or the
            closest, and tells you which.
          </p>
          <p v-else-if="f.id === 'sale'">
            Every build ends at the Saturday 9:00 am (Pacific) sale. A third sale week pays on long jumps below about TE
            300 (up to 33 days on the final leg from 225-270, up to 194 days from 120-150), but never on short jumps or
            from about TE 300 up. Tier 13 is offered from TE 190. Starting a leg a few hours either side of the sale can
            move it by days, which is why the best checkpoints are so sharp.
          </p>
          <p v-else-if="f.id === 'one-te'">
            Moving a single checkpoint by one TE costs up to about a month (typically 2-3 weeks on 2-3 ascension plans),
            and the best TEs differ for every account and start time. That's why the instant answer prices every TE
            instead of guessing, and why it's worth re-running.
          </p>
        </div>
      </details>
    </div>

    <details class="rounded-lg border border-emerald-200 bg-white p-3 text-[12px] text-slate-700 leading-relaxed">
      <summary class="cursor-pointer text-[10px] font-black text-emerald-700 uppercase tracking-widest">
        What we need next
      </summary>
      <div class="mt-2 space-y-1.5">
        <p class="text-[11px] text-slate-500">
          These are the asks on the
          <a v-if="scienceHref" :href="scienceHref" class="font-bold text-indigo-700 underline">Science tab</a
          ><template v-else>Science tab</template>.
        </p>
        <p>
          <b>Egg Day "By a date" runs:</b> 1-4 ascensions at every TE, 5 at ±3 TE around the instant answer's route, 6
          at ±2. They check the instant answer leg by leg and measure how often it misses.
        </p>
        <p>
          <b>The six gear sets on the Science tab</b> (epic earnings set, rare earnings set, rare/common delivery set,
          epic everything, rare everything, legendary set on T3 stones). Nothing on the board covers earnings bonuses
          between 63 and 115, or weak delivery with a full earnings set. Every account so far has a T4L Lunar totem and a
          T4L Demeters necklace.
        </p>
        <p>
          <b>A run from an account missing epic research or colleggtibles;</b> every instant answer assumes both maxed.
        </p>
        <p>
          <b>One more run from accounts whose instant answers were built from older runs,</b> on today's planner, to recheck
          them.
        </p>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import type { KnowStats } from './knowStats';

/** The date the analyst last checked the findings against the board. */
const FINDINGS_CHECKED = '7 Oct 2026';

defineProps<{
  /** Counted from the loaded runs; absent until the board has answered. */
  stats?: KnowStats | null;
  /** The Science tab's address, when the page can link to it. */
  scienceHref?: string;
}>();

const findings = [
  { id: 'match', headline: 'The instant answer lands within about an hour of a real run on each ascension.' },
  { id: 'wider', headline: 'Wider searches would have found faster routes.' },
  { id: 'misses', headline: 'The instant answer rarely misses, but it can.' },
  { id: 'count', headline: 'More ascensions help, then level off.' },
  { id: 'eggday', headline: 'By Egg Day 2027, a well-geared account gains about 100-135 TE, with 3-5 ascensions.' },
  { id: 'bydate', headline: 'The instant answer matches By a date runs ascension by ascension.' },
  { id: 'stall', headline: 'Below about 220 Clothed TE, the first ascension stalls.' },
  { id: 'gear', headline: 'Your delivery set sets the pace; your earnings set matters early.' },
  { id: 'sale', headline: 'The research sale shapes every route.' },
  { id: 'one-te', headline: 'One TE off the best can still cost weeks.' },
];

const COUNT_HEADS = ['2→3', '3→4', '4→5', '5→6'];
const COUNT_TABLE = [
  { te: 135, cells: ['173 d', '22 d', '11 d', '5.5 d'] },
  { te: 165, cells: ['118 d', '20 d', '4 d', '2.4 d'] },
  { te: 195, cells: ['38 d', '6 d', '1.5 d', 'about 0'] },
];

function cteText(n: number): string {
  return String(Math.round(n * 10) / 10);
}
</script>

<style scoped>
.finding-summary {
  list-style: none;
}
.finding-summary::-webkit-details-marker {
  display: none;
}
.finding[open] .finding-chevron {
  transform: rotate(180deg);
}
</style>
