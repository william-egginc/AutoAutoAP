<!--
  The instant answer: the fastest route from a precomputed table (search/precomputedTable.ts,
  search/routeFinder.ts) instead of a search. Allan's idea (1 Oct 2026): every fresh ascension a maxed
  account can make, simulated once per start TE and Pacific hour of the week, so a route is arithmetic.
  It looks at every checkpoint at every TE and every number of ascensions, in about a second.

  What it is exactly and what it adjusts for:
    - each ascension's time comes from the simulator's own build, and the waits after it are the
      simulator's own arithmetic, so a route priced here matches the simulator to the second when the
      account matches the table's (scripts/precompute.ts --verify);
    - the first ascension is the player's own: continue current ascension from their save when the
      continue rule takes it, otherwise a fresh build moved onto their real egg counts;
    - other gear: the table's account is maxed (perfect delivery, Clothed TE bonus 128.71); with no
      table of this simulator built on the player's gear, the maxed table is moved to it (instant answer
      v2, the form G: search/instantGear.ts): the whole Clothed-TE gap (earnings set, colleggtibles,
      lab) as a row shift, delivery at the player's own rate.
  With "Works inside my hours", each prestige waits for the player's hours and the wait is priced
  (routeFinder.ts `hours`); with held shifts on, the shifts inside each ascension wait for them too, as
  the simulator holds them (instant answer v2: a version 2 table's held tails, `instantTail`).
  What it leaves out: playing hours (or, with that box, only the shifts' hours), time off and dated
  milestones (said beside the result), and the
  history of how a player reached each TE (shown to barely matter on the board). The searches under the
  answer (Fast, Exact, Custom) price routes with the full simulator; this card only points to their result
  (wireframes/price-route-v2, Jordan 23 Oct 2026: nothing prices it here, the instant numbers never change by themselves).
-->
<template>
  <section v-if="!noTable" class="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-base font-black text-slate-900">
        Instant answer
        <span
          class="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-widest"
          >worked out ahead</span
        >
        <span
          v-if="own"
          class="ml-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase tracking-widest"
          >your gear</span
        >
      </h3>
      <span v-if="ms !== null" class="text-[10px] text-slate-400"
        >every route checked in {{ (ms / 1000).toFixed(1) }} s</span
      >
    </div>
    <p v-if="ownChanged" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
      Your gear changed since your instant answer was made ({{ ownChanged }}), so this answer uses the instant answer
      for fully maxed gear instead.
    </p>

    <!-- Waiting for the save (search/startProvenance.ts): nothing is worked out from a restored draft or an
         account switch's quick load; an answer from before stays, labelled, until the new one. -->
    <p
      v-if="result && (resultFromBefore || store.startWait)"
      class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] font-bold text-amber-900"
      data-testid="instant-from-before"
    >
      {{ START_WAIT_LABEL }}
    </p>
    <p v-if="saveWaitText" class="text-[12px] text-slate-500 flex items-center gap-2" data-testid="instant-wait-save">
      <span class="inline-block w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      {{ saveWaitText }}
    </p>
    <p
      v-else-if="atTarget && status !== 'loading'"
      class="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-600"
      data-testid="instant-at-target"
    >
      Your save is already at TE {{ Math.floor(store.currentTE) }}, at or past {{ target }} TE, so there is no route for
      the instant answer to find.{{ deadline || target >= 490 ? '' : ' Pick a higher target TE to plan further.' }}
    </p>
    <p v-else-if="status === 'loading'" class="text-[12px] text-slate-500 flex items-center gap-2">
      <span class="inline-block w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      {{ loadingText }}{{ result ? ' The answer below is the previous one until the new one is ready.' : '' }}
    </p>
    <!-- Below the table's lowest TE: where the answer would be, what to do instead (NoInstantAnswer.vue). -->
    <NoInstantAnswer
      v-else-if="status === 'error' && below"
      :heading="noInstantHeading(below.from)"
      :sub="`Your route starts at TE ${below.te}.`"
      @by-date="emit('by-date')"
    >
      <template v-if="$slots['no-answer']" #default><slot name="no-answer" /></template>
    </NoInstantAnswer>
    <p
      v-else-if="status === 'error'"
      class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900"
    >
      {{ errorText }}
    </p>
    <InstantIntegrity v-if="status !== 'loading' && !atTarget" :state="integrity" />
    <!-- LOW-TE OPENING (auto/lowTeOpening.ts): search/instantIntegrity.ts lowTeOpeningNote. -->
    <p
      v-if="status !== 'loading' && !atTarget && lowTeNote && !below"
      class="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900"
      data-testid="instant-lowte"
    >
      {{ lowTeNote }}
    </p>

    <!-- A table from an older simulator (search/simVersion.ts): still shown, said so. -->
    <p
      v-if="status !== 'loading' && simNote"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900"
      data-testid="instant-sim-version"
    >
      This instant answer was made with {{ simNote }}, not the simulator this page runs. Where one round of
      research, vehicles and habs (C1, K1, I1) maxes the habs, its times are expected to move only a little. Where it
      does not, often at low TE on weaker gear, its routes and dates can move a lot. Fast, Exact or Custom below prices
      them on your account.
    </p>

    <p
      v-if="header?.fake"
      class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] font-bold text-rose-800"
    >
      Test instant answer: rows below what has been simulated are filled in from the nearest real ones, to try the page.
      These routes and dates are not real answers.
    </p>
    <p
      v-if="savedAt"
      class="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3"
      data-testid="saved-answer"
    >
      <span
        >Saved from {{ show(savedAt / 1000) }}: same save, setup and filters, so nothing was worked out again<template
          v-if="answerStart"
        >
          (its dates are for a plan start of {{ show(answerStart) }})</template
        >.</span
      >
      <button
        type="button"
        class="font-black uppercase tracking-widest text-[10px] text-emerald-800 underline hover:text-emerald-900"
        @click="pressRun(true, 'again')"
      >
        Work it out again
      </button>
    </p>
    <InstantRunWarning
      v-if="warnHere(confirming, 'again')"
      at="again"
      @go="confirmRun(false)"
      @remember="confirmRun(true)"
      @cancel="confirming = null"
    />
    <p v-if="!confirming && runBusy && alongside" class="text-[11px] text-slate-500" data-testid="instant-alongside">
      Running alongside your search: this uses more memory.
    </p>
    <p
      v-if="waiting"
      class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 flex flex-wrap items-center gap-x-3"
      data-testid="instant-waits"
    >
      <span>{{ whileWaiting(!!result).text }}</span>
      <button
        type="button"
        class="font-black uppercase tracking-widest text-[10px] text-amber-900 underline"
        @click="pressRun(false, 'anyway')"
      >
        Work it out anyway
      </button>
    </p>
    <InstantRunWarning
      v-if="warnHere(confirming, 'anyway')"
      at="anyway"
      @go="confirmRun(false)"
      @remember="confirmRun(true)"
      @cancel="confirming = null"
    />
    <!-- No routes while the integrity check holds them back (search/instantIntegrity.ts). -->
    <template v-if="!integrityHold">

      <!-- The filters (remembered in this browser): the routes and the headline come from what is left. -->
      <div v-if="result" class="space-y-1">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
          <label v-if="hoursOn" class="flex items-center gap-2 cursor-pointer">
            <input
              :checked="filters.inHours"
              type="checkbox"
              class="rounded border-slate-300"
              data-testid="inside-hours"
              @change="setInsideHours(($event.target as HTMLInputElement).checked)"
            />
            Works inside my hours
          </label>
          <label class="flex items-center gap-2">
            At most
            <select
              v-model="filters.maxAscensions"
              class="min-h-[44px] sm:min-h-0 rounded-lg border-slate-200 text-[11px] py-0.5 pl-2 pr-7"
              data-testid="instant-max-ascensions"
            >
              <option :value="null">any number of</option>
              <option v-for="n in MAX_ASCENSIONS" :key="n" :value="n">{{ n }}</option>
            </select>
            ascensions
          </label>
        </div>
        <p v-if="useHours" class="text-[11px] text-slate-500">
          Each prestige waits for your hours (the times shown include the wait).
        </p>
        <p v-if="backgroundStatus === 'running'" class="text-[11px] text-slate-400">
          Polishing the routes in the background…
        </p>
        <p v-else-if="gainsText" class="text-[11px] text-emerald-800">
          Improved by the background polish: {{ gainsText }}.
        </p>
        <p v-if="bracketStatus === 'running'" class="text-[11px] text-slate-400">
          Pricing your route on the instant answers for the closest stronger and weaker gear on this site…
        </p>
        <p v-else-if="bracketText" class="text-[11px] text-slate-700">{{ bracketText }}</p>
      </div>

      <!-- THE INSTANT CARD (wireframes/price-route-v2, Jordan 23 Oct 2026): the green box and the counts list show the
           instant answer only, and never change by themselves (nothing on this card prices a route). A search below has
           its own result card; once it has one for this goal, the pointer line at the bottom points to it. -->
      <template v-if="result && deadline">
        <div class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1" data-testid="instant-box">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-emerald-700"
              >Highest TE by {{ show(deadline) }}</span
            >
            <!-- Q6: the box leads with the fewest ascensions inside the player's margin (search/preferFewer.ts). -->
            <span
              v-if="preferPicked"
              class="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest"
              data-testid="prefer-fewer-chip"
              >{{ preferCopy.chip }}</span
            >
          </div>
          <template v-if="result.byDate">
            <div class="flex flex-wrap items-baseline gap-x-3">
              <span class="text-2xl font-black text-slate-900">{{ dateBoxOf(result.byDate).endTE }} TE</span>
              <span
                class="text-lg font-black"
                :class="spareOf(dateBoxOf(result.byDate)) < TIGHT_SECONDS ? 'text-amber-700' : 'text-emerald-800'"
                >{{ days(spareOf(dateBoxOf(result.byDate))) }} to spare</span
              >
              <span
                v-if="spareOf(dateBoxOf(result.byDate)) < TIGHT_SECONDS"
                class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-widest"
                >tight</span
              >
              <span class="text-[11px] font-bold text-slate-500" data-testid="box-instant">instant answer</span>
            </div>
            <div class="font-mono-premium text-sm font-bold text-slate-800">
              {{ dateBoxOf(result.byDate).chain.join(' → ') }}
            </div>
            <div class="text-[12px] text-slate-700">
              Reached {{ show(dateBoxOf(result.byDate).end) }} ·
              {{ dateBoxOf(result.byDate).chain.length }} ascensions
            </div>
            <PreferFewerNote :copy="preferCopy" goal="date" :showing-best="preferShowBest" @toggle="preferShowBest = !preferShowBest" />
            <!-- "Prestige by" is worked out on the instant answer's highest-TE route, which the box always shows
                 unless Prefer fewer picked another. -->
            <PrestigeByLine
              v-if="prestigeFlag.enabled.value && !preferPicked"
              :line="prestige?.line ?? null"
              :status="prestigeStatus"
              mismatch=""
              :beta="prestigeFlag.beta"
            />
            <!-- HOOK: "First ascension: N egg shifts" and "One more TE" were here (they need the simulated first leg,
                 gone from the instant card since 23 Oct 2026). When the engine simulates the current ascension live
                 again, feed it to lib/searchPointer.ts `firstAscensionFromLiveLeg` and mount RouteExtras with what it
                 returns, under both boxes (this one and Fastest's below). -->
            <div class="flex flex-wrap items-center gap-2 pt-1" data-testid="box-actions">
              <button
                type="button"
                class="inline-flex items-center min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50"
                :title="SIMULATE_TITLE"
                data-testid="box-simulate"
                @click="openPlan(dateBoxOf(result.byDate).chain)"
              >
                Simulate this plan
              </button>
              <FollowButton v-if="boxFollowable" primary :chain="dateBoxOf(result.byDate).chain" :goal-key="followGoal" from="answer"
                :finish="dateBoxOf(result.byDate).end"
                :end-te="dateBoxOf(result.byDate).endTE"
                :plan-start="answerStart"
                :deadline="deadline"
              />
            </div>
            <!-- A route followed for this date: this answer offered when it is better (lib/searchPlan.ts). -->
            <BetterRoutePrompt
              class="mt-2"
              :goal-key="followGoal"
              goal="date"
              :deadline="deadline ?? null"
              :candidate="instantCandidate(dateBoxOf(result.byDate))"
            />
          </template>
          <p v-else class="text-[12px] text-amber-800">
            No route gets above your TE by then{{ filtering ? ' with these filters' : '' }}.
          </p>
        </div>
        <p v-if="result.byDate" class="text-[12px] text-slate-600 leading-relaxed" data-testid="instant-one-line">
          {{ INSTANT_ONE_LINE }}
        </p>
        <!-- Every number of ascensions, instant numbers only (TE, days spare, when it is reached, the route).
             A table from 30rem up; below it (phones) one stacked row per count (`.counts-stack`, wireframe v1). -->
        <div v-if="result.byDate && dateRows.length > 1" class="space-y-1" data-testid="counts-card">
          <p class="text-[9px] font-black uppercase tracking-widest text-slate-500">Every number of ascensions</p>
          <PreferFewerControl v-model="preferMargin" goal="date" />
          <div class="overflow-x-auto" data-testid="counts-scroll">
            <table class="counts-stack w-full min-[30rem]:min-w-[30rem] text-[12px]" data-testid="counts-table">
              <thead>
                <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 align-bottom">
                  <th class="py-1 pr-2">Ascensions</th>
                  <th class="py-1 pr-2">TE · spare</th>
                  <th class="py-1 pr-2">Reached</th>
                  <th class="py-1">Route</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in dateRows"
                  :key="r.legs.length"
                  class="border-t border-slate-100"
                  :class="dateRowLit(r) ? 'bg-emerald-50/60' : ''"
                >
                  <td class="py-1.5 pr-2 font-bold text-slate-800 whitespace-nowrap align-top">
                    {{ r.legs.length }}
                    <span
                      v-if="datePickedRow(r)"
                      class="block text-[9px] font-black uppercase tracking-widest text-emerald-700"
                      :title="preferCopy.chip"
                      data-testid="prefer-fewer-row"
                      >shown above</span
                    >
                  </td>
                  <td class="py-1.5 pr-2 font-bold text-slate-800 align-top" data-testid="counts-te">
                    <span class="whitespace-nowrap">{{ r.legs[r.legs.length - 1].endTE }} TE</span> ·
                    <span class="whitespace-nowrap">{{ days(deadline - r.end) }} spare</span>
                  </td>
                  <td class="py-1.5 pr-2 text-slate-600 whitespace-nowrap align-top">{{ show(r.end) }}</td>
                  <!-- The route, with its buttons beside it when the card has room and under it when not. -->
                  <td class="py-1.5 align-top" data-testid="counts-route">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span class="font-mono-premium text-slate-800">{{ r.chain.join(' ') }}</span>
                      <button
                        type="button"
                        class="inline-flex items-center min-h-[44px] sm:min-h-0 px-2 py-1 rounded-md border border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-800 whitespace-nowrap"
                        :title="SIMULATE_TITLE"
                        @click="openPlan(r.chain)"
                      >
                        Simulate this plan
                      </button>
                      <FollowButton v-if="rowFollowable(r)" class="min-h-[44px] sm:min-h-0" :chain="r.chain" :goal-key="followGoal" from="count"
                        :finish="r.end"
                        :end-te="r.legs[r.legs.length - 1]?.endTE ?? null"
                        :plan-start="answerStart"
                        :deadline="deadline"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <MaxedWhatIf
            v-if="whatIf"
            v-bind="whatIf"
            @result="onWhatIf"
            :table-url="TABLE_URL"
            :zone="zone"
            :final="target"
            :max-ascensions="MAX_ASCENSIONS"
            :at-most="filters.maxAscensions"
            :deadline="deadline"
          />
        </div>
      </template>

      <template v-if="result && !deadline">
        <div v-if="boxLead" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1" data-testid="instant-box">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-emerald-700">Fastest to {{ store.finalTE }} TE</span>
            <!-- Q6: the box leads with the fewest ascensions inside the player's margin (search/preferFewer.ts). -->
            <span
              v-if="preferPicked"
              class="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest"
              data-testid="prefer-fewer-chip"
              >{{ preferCopy.chip }}</span
            >
          </div>
          <div class="flex flex-wrap items-baseline gap-x-3">
            <span class="text-2xl font-black text-slate-900">{{ show(boxLead.end) }}</span>
            <span class="text-[11px] font-bold text-slate-500" data-testid="box-instant">instant answer</span>
          </div>
          <div class="text-[12px] font-bold text-emerald-800">
            in {{ days(boxLead.seconds) }} · {{ plural(boxLead.legs.length, 'ascension') }}
          </div>
          <div class="font-mono-premium text-sm font-bold text-slate-800">{{ boxLead.chain.join(' → ') }}</div>
          <PreferFewerNote :copy="preferCopy" goal="fastest" :showing-best="preferShowBest" @toggle="preferShowBest = !preferShowBest" />
          <!-- "Prestige by" is worked out on the instant answer's fastest route, which the box always shows unless
               Prefer fewer picked another. -->
          <PrestigeByLine
            v-if="prestigeFlag.enabled.value && !preferPicked"
            :line="prestige?.line ?? null"
            :status="prestigeStatus"
            mismatch=""
            :beta="prestigeFlag.beta"
          />
          <!-- HOOK: First ascension / One more TE (see the By a date box above, lib/searchPointer.ts
               `firstAscensionFromLiveLeg`). -->
          <div class="flex flex-wrap items-center gap-2 pt-1" data-testid="box-actions">
            <button
              type="button"
              class="inline-flex items-center min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50"
              :title="SIMULATE_TITLE"
              data-testid="box-simulate"
              @click="openPlan(boxLead.chain)"
            >
              Simulate this plan
            </button>
            <FollowButton primary :chain="boxLead.chain" :goal-key="followGoal" from="answer"
              :finish="boxLead.end"
              :end-te="boxLead.chain[boxLead.chain.length - 1]"
              :plan-start="answerStart"
            />
          </div>
          <!-- A route followed for this race: this answer offered when it is better (lib/searchPlan.ts). -->
          <BetterRoutePrompt
            class="mt-2"
            :goal-key="followGoal"
            goal="fastest"
            :deadline="null"
            :candidate="instantCandidate({ chain: boxLead.chain, end: boxLead.end, endTE: boxLead.chain[boxLead.chain.length - 1] })"
          />
        </div>
        <p v-else class="text-[12px] text-amber-800">
          No route reaches {{ store.finalTE }} from here in the instant answer{{
            filtering ? ' with these filters' : ''
          }}.
        </p>
        <p v-if="boxLead" class="text-[12px] text-slate-600 leading-relaxed" data-testid="instant-one-line">
          {{ INSTANT_ONE_LINE }}
        </p>
        <!-- Every number of ascensions, instant numbers only. A table from 30rem up; stacked rows below it. -->
        <div v-if="boxLead" class="space-y-1" data-testid="counts-card">
          <p class="text-[9px] font-black uppercase tracking-widest text-slate-500">Every number of ascensions</p>
          <PreferFewerControl v-model="preferMargin" goal="fastest" />
          <div class="overflow-x-auto" data-testid="counts-scroll">
            <table class="counts-stack w-full min-[30rem]:min-w-[30rem] text-[12px]" data-testid="counts-table">
              <thead>
                <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 align-bottom">
                  <th class="py-1 pr-2">Ascensions</th>
                  <th class="py-1 pr-2">Reaches {{ store.finalTE }}</th>
                  <th class="py-1 pr-2">Behind</th>
                  <th class="py-1">Route</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in shownRows"
                  :key="r.legs.length"
                  class="border-t border-slate-100"
                  :class="r === boxLead ? 'bg-emerald-50/60' : ''"
                >
                  <td class="py-1.5 pr-2 font-bold text-slate-800 whitespace-nowrap align-top">
                    {{ r.legs.length }}
                    <span
                      v-if="preferPicked && r === boxLead"
                      class="block text-[9px] font-black uppercase tracking-widest text-emerald-700"
                      :title="preferCopy.chip"
                      data-testid="prefer-fewer-row"
                      >shown above</span
                    >
                  </td>
                  <td class="py-1.5 pr-2 font-bold text-slate-800 whitespace-nowrap align-top">{{ show(r.end) }}</td>
                  <td class="py-1.5 pr-2 text-slate-500 align-top">
                    <span class="whitespace-nowrap">{{ behind(r) }}</span>
                    <span
                      v-if="nearTie(r)"
                      class="block min-w-[9rem] max-w-[13rem] whitespace-normal text-[10px] leading-snug"
                      :class="nearTie(r)!.kind === 'fewer' ? 'font-semibold text-emerald-700' : 'text-slate-400'"
                      :data-testid="`near-tie-${nearTie(r)!.kind}`"
                      >{{ nearTie(r)!.text }}</span
                    >
                  </td>
                  <!-- The route, with its buttons beside it when the card has room and under it when not. -->
                  <td class="py-1.5 align-top" data-testid="counts-route">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span class="font-mono-premium text-slate-800">{{ r.chain.join(' ') }}</span>
                      <button
                        type="button"
                        class="inline-flex items-center min-h-[44px] sm:min-h-0 px-2 py-1 rounded-md border border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-800 whitespace-nowrap"
                        :disabled="r.chain.length < 2"
                        :title="SIMULATE_TITLE"
                        @click="openPlan(r.chain)"
                      >
                        Simulate this plan
                      </button>
                      <FollowButton v-if="r.chain.length" class="min-h-[44px] sm:min-h-0" :chain="r.chain" :goal-key="followGoal" from="count"
                        :finish="r.end"
                        :end-te="r.chain[r.chain.length - 1]"
                        :plan-start="answerStart"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Counts past the best + 1 add stops that no longer help (routeFinder.ts USEFUL_STOP_MAX). -->
          <button
            v-if="hiddenCounts || showMoreCounts"
            type="button"
            class="inline-flex items-center min-h-[44px] sm:min-h-0 mt-1 text-[10px] font-bold text-slate-500 underline hover:text-emerald-800"
            data-testid="instant-more-counts"
            @click="showMoreCounts = !showMoreCounts"
          >
            {{ showMoreCounts ? 'Show fewer ascension counts' : `Show more ascension counts (${hiddenCounts})` }}
          </button>
          <p v-else-if="moreDontHelp" class="mt-1 text-[10px] text-slate-500" data-testid="instant-more-dont-help">
            More ascensions don’t help past TE ~{{ USEFUL_STOP_NOTE }}: a build there already lays at its full rate, so an
            extra stop only adds a prestige.
          </p>
          <MaxedWhatIf
            v-if="whatIf"
            v-bind="whatIf"
            @result="onWhatIf"
            :table-url="TABLE_URL"
            :zone="zone"
            :final="target"
            :max-ascensions="MAX_ASCENSIONS"
            :at-most="filters.maxAscensions"
          />
        </div>
      </template>

      <!-- THE POINTER (lib/searchPointer.ts): a Fast, Exact or Custom result for this goal on this save. The only thing
           on this card a search changes. -->
      <p
        v-if="result && pointer"
        class="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[12px] text-slate-700"
        data-testid="instant-pointer"
      >
        {{ pointer.level }} found <b>{{ pointer.value }}</b> on your account.
        <button
          type="button"
          class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline hover:text-indigo-900"
          data-testid="instant-pointer-link"
          @click="seeResult"
        >
          {{ POINTER_LINK }}
        </button>
      </p>
      <!-- "Share this result" for that search result (search/instantRecord.ts), at the bottom of the search panel
           when the screen has one (`shareTo`). -->
      <Teleport v-if="instantUrl && result" defer :to="shareTo || 'body'" :disabled="!shareTo">
        <InstantShareCheck
          v-if="pointer"
          v-model:share-this="shareThis"
          v-model:keep-sharing="keepSharing"
          :status="shareText"
          :sent="shareNote?.result === 'sent'"
          :title="SHARE_WHAT"
        />
      </Teleport>

      <!-- What the answer above does not account for, on both screens, where it says more than the one line. -->
      <template v-if="result">
        <!-- The gear caveat and "may be optimistic for your gear", one amber box (GearCaveat.vue). -->
        <GearCaveat
          :gear-differs="gearDiffers"
          :optimistic="optimistic"
          :bonus-short="bonusShort"
          :delivery-scale="deliveryScale"
          :full-research-te="FULL_RESEARCH_TE"
        />
        <p
          v-if="leftOut.length"
          class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
        >
          Not in the instant answer's routes: your {{ leftOut.join(', ') }}. Fast, Exact and Custom include them.
        </p>

        <details class="text-[11px] text-slate-500" data-testid="instant-how">
          <summary class="cursor-pointer font-bold text-slate-600 min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0" data-testid="instant-how-summary">How this is worked out</summary>
          <p class="mt-1 leading-relaxed">
            Every ascension {{ own ? 'your account can make, with the gear your save has now,' : 'a maxed account can make' }}
            was simulated ahead of time, from every TE at every hour of the week, so
            {{
              deadline
                ? 'finding the highest TE you can reach by the date is arithmetic'
                : 'finding your fastest route is arithmetic'
            }}: it tries every stop at every TE, with any number of ascensions. Ascend at the times shown: each fresh
            ascension starts on the hour (inside the weekly Research Sale, at once when that ends sooner).
          </p>
          <p v-if="gearTable" class="mt-1 leading-relaxed">
            This instant answer was built on gear exactly like yours (the same artifacts and stones, so the same
            earnings and delivery sets, with epic research and colleggtibles maxed), so its ascensions match the full
            simulator for you<template v-if="(header?.gearTo ?? 489) < 489">
              up to TE {{ header?.gearTo }}; above that it uses the instant answer for fully maxed gear at your own
              delivery rate</template
            >.
          </p>
          <p v-else-if="own" class="mt-1 leading-relaxed">
            This instant answer was built on your own account: your earnings and delivery sets, epic research and
            colleggtibles as your save has them now (Clothed TE bonus {{ header?.cteBonus }}). Each of its ascensions is
            the simulator's own build, and the waiting after it is the simulator's own arithmetic, so a route here
            matches the full simulator on your account. Your first ascension is your own, simulated from your save the
            way Your setup's first ascension says (Continue my build-up, Finish without buying, or Prestige now). If your
            gear changes, the page goes back to the instant answer for fully maxed gear until yours is made again.
          </p>
          <p v-else class="mt-1 leading-relaxed">
            The instant answer was built on a maxed account: perfect delivery set, Clothed TE bonus
            {{ header?.cteBonus }}, all epic research and colleggtibles. Each of its ascensions is the simulator's own
            build, and the waiting after it is the simulator's own arithmetic, so on that account a route here matches
            the full simulator to the second. For you: your first ascension is your own, simulated from your save the
            way Your setup's first ascension says (Continue my build-up, Finish without buying, or Prestige now); the
            waits run at your own peak delivery rate ({{ ((deliveryScale ?? 1) * 100).toFixed(1) }}% of the instant
            answer's: the best set your inventory can wear at full research), and each ascension is read from the row
            for its own TE. The weekly sale is at a fixed Pacific time, so the hour of the week is what matters.
          </p>
          <p class="mt-1 leading-relaxed">{{ simulateNote() }}</p>
          <p class="mt-1 leading-relaxed">
            How it was built and how closely it matches the full simulator:
            <a href="#/science/how" class="font-bold text-indigo-700 underline">{{ NAMES.science }} › {{ NAMES.how }}</a
            >.
          </p>
        </details>
      </template>
    </template>
  </section>
  <!-- The file couldn't be loaded (missing, a web page in its place, cut short, or stalled): say that, not "no
       instant answer for your TE" (only `below` says that), with Retry and what to do meanwhile. -->
  <section v-else class="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3" data-testid="instant-no-table">
    <h3 class="text-base font-black text-slate-900">Instant answer</h3>
    <NoInstantAnswer :heading="TABLE_LOAD_FAILED" @by-date="emit('by-date')">
      <template v-if="$slots['no-answer']" #default><slot name="no-answer" /></template>
    </NoInstantAnswer>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="min-h-[44px] px-4 rounded-lg border border-emerald-300 bg-white text-[11px] font-black uppercase tracking-widest text-emerald-800 hover:bg-emerald-50"
        data-testid="instant-retry"
        @click="run(true)"
      >
        Retry
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { plural } from '@/lib/format';
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInstantSummaryStore } from '@/stores/instantSummary';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { showDateTime } from '@/lib/displayTime';
import { continueTailParams, farmLaying, instantDeliveryScale, saveSiloSeconds } from '@/search/leg';
import { instantFirstLegsBase } from '@/search/instantFirstLegs';
import { noInstantHeading, type InstantState } from '@/search/autoWiden';
import { TABLE_LOAD_FAILED, isTableStall, probeHeader, tableLoadFailed } from '@/search/tableFetch';
import { plainError } from '@/lib/plainError';
import { cteFromArtifacts } from 'lib/virtue';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { findRoutes, type FirstLeg, type FoundRoutes, type PolishOptions, type Route } from '@/search/routeFinder';
import { gearShiftKey, instantGearShift, instantTail, nearMaxedGear } from '@/search/instantGear';
import {
  atMostAscensions,
  describeGains,
  polishGains,
  insideHoursFor,
  readFilters,
  readInsideHoursChoice,
  writeFilters,
  writeInsideHoursChoice,
  type PolishGain,
} from '@/search/instantFilters';
import { availabilityKey, type Availability } from '@/search/availabilitySchedule';
import { describeColleggtibles } from '@/search/progression';
import { poolSize, RoutePool } from '@/search/routePool';
import { describeGear, isMaxed, pickBracket, type TableEntry } from '@/search/tableBracket';
import { isSafari, isSmallDevice, SAFARI_ROUTE_WORKERS } from '@/search/device';
import {
  answerInputsKey,
  backgroundMayStart,
  onArrival,
  pauseForRun,
  resumeAfterRun,
  warnHere,
  whileWaiting,
  type WarnAsk,
  type WarnAt,
} from '@/search/instantDeferral';
import InstantRunWarning from './InstantRunWarning.vue';
import GearCaveat from './GearCaveat.vue';
import { gearReadsMaxed, optimisticForGear, type AnswerTable } from '@/lib/optimisticAnswer';
import InstantShareCheck from './InstantShareCheck.vue';
import PrestigeByLine from './PrestigeByLine.vue';
import { useStrongerStore } from '@/stores/stronger';
import { usePrestigeBy, recordsPrestigeBy } from '@/composables/usePrestigeBy';
import {
  candidatesOf,
  describeCutoff,
  findCutoff,
  HORIZON_HOURS,
  outcomeOf,
  prestigePlan,
  recordOfCutoff,
  startStateAt,
  type Cutoff,
  type PrestigeByRecord,
  type PrestigeLine,
} from '@/search/prestigeBy';
import InstantIntegrity from './InstantIntegrity.vue';
import { holdsRoutes, instantIntegrity, lowTeOpeningNote } from '@/search/instantIntegrity';
import FollowButton from '../FollowButton.vue';
import BetterRoutePrompt from '../BetterRoutePrompt.vue';
import { screenGoalKey } from '@/lib/follow';
import { finishesBefore } from '@/lib/eggDayRule';
import { isConstrained } from '@/search/availability';
import { nearTieOf, type NearTie } from '@/search/nearTie';
import {
  choosePreferFewer,
  preferFewerCopy,
  readPreferFewer,
  writePreferFewer,
  type PreferChoice,
  type PreferCopy,
  type PreferGoal,
  type PreferMargin,
  type PreferRow,
  type PreferSetting,
} from '@/search/preferFewer';
import PreferFewerControl from './PreferFewerControl.vue';
import PreferFewerNote from './PreferFewerNote.vue';
import { useIntegrityProbe } from '@/composables/useIntegrityProbe';
import { useInstantDuringSearch } from '@/composables/useInstantDuringSearch';
import {
  instantGoal,
  instantKey,
  instantSnapKey,
  patchSnapshot,
  readSnapshot,
  recallShown,
  rememberShown,
  snapshotUsable,
  writeSnapshot,
  type SnapMeta,
  type SnapWhatIf,
} from '@/search/instantSnapshot';
import { simulateRoute } from '@/search/simulateRoute';
import { NAMES, SIMULATE_TITLE, simulateNote } from '@/lib/siteNav';
import NoInstantAnswer from './NoInstantAnswer.vue';
import { followedCount } from '@/lib/ascRange';
import { GEAR_RULE, gearChanges, gearStamp, gearTableNames, legacyGearTableName, tableName } from '@/search/tableGear';
import { compositeUrl, gearShiftUrl, parseCompositeUrl, parseGearShiftUrl } from '@/search/precomputedTable';
import type { TableHeader } from '@/search/precomputedTable';
import { useInitialStateStore } from '@/stores/initialState';
import { ownerToken } from '@/search/owner';
import { appBuildId } from '@/search/submission';
import { SIM_VERSION, tableSimMismatch } from '@/search/simVersion';
import { countsShown } from '@/search/instantCounts';
import { priceOnTable, type FirstLegsBase } from '@/search/priceOnTable';
import MaxedWhatIf from './MaxedWhatIf.vue';
import { accountOf } from '@/search/runSaves';
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { describeAvailability } from '@/search/availabilitySchedule';
import { CTE_CLEARS, INTEGRITY_BLOCK_SECONDS, INTEGRITY_WARN_SECONDS } from '@/search/rules';
import {
  buildGapOf,
  exactLegs,
  firstLegOf,
  instantLegs,
  instantUrlOf,
  sendInstantRecordWhy,
  type InstantRecord,
  type InstantSendOutcome,
} from '@/search/instantRecord';
import { useInstantShare } from '@/composables/useInstantShare';
import {
  buildTimeMs,
  finishStartProvenance,
  pageOpenedMs,
  START_WAIT_LABEL,
  startWaitText,
} from '@/search/startProvenance';
import { accountHashNow } from '@/lib/accountHash';
import { selectSearchTab, type SearchTabScreen } from '@/lib/searchTab';
import { INSTANT_ONE_LINE, pointerOf, POINTER_LINK } from '@/lib/searchPointer';
import { bracketLine } from '@/lib/bracketLine';
import { liveSearchResult, newerSearch, readSearch, recordKeptSearch, type SnapSearch } from '@/lib/searchPlan';
import { baselineOfSnapshot, recordBaseline } from '@/lib/instantBaseline';

const props = defineProps<{
  /** Highest TE by a date: the unix second. Without it, the fastest route to the target. */
  deadline?: number;
  /** Where "Share this result" goes (a selector in the search panel, SearchPanel.vue `#search-share-…`); under
   *  this answer without one. */
  shareTo?: string;
}>();
const emit = defineEmits<{
  check: [chain: number[]];
  /** By a date: the route for each number of ascensions, and the "At most N ascensions" filter (null
   *  for any). */
  routes: [byCount: Record<number, number[]>, maxAscensions: number | null];
  /** Whether the answer is still being worked out, in, or settled with none (no instant answer for
   *  this TE, it failed, or it waits on a run), for By a date's Find (search/autoWiden.ts `awaitInstant`). */
  state: [state: InstantState];
  /** The instant answer's file couldn't be loaded (`noTable`): the section's folded line says so, not "none
   *  for your TE". */
  unloaded: [unloaded: boolean];
  /** Fastest, with no instant answer: open By a date for its quick estimate (NoInstantAnswer.vue). */
  'by-date': [];
}>();
/** By a date: hand the panel this answer's route for each number of ascensions, so its chain boxes can be
 *  suggested around them. */
function emitRoutes(found: { byDateByAscensions: (Route | null)[] }): void {
  const byCount: Record<number, number[]> = {};
  found.byDateByAscensions.forEach((r, k) => {
    if (r) byCount[k] = [...r.chain];
  });
  emit('routes', byCount, filters.value.maxAscensions);
}
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const TABLE_URL = `${import.meta.env.BASE_URL}precompute/table.bin`;

/** The table the answer came from: the player's own (search/tableGear.ts) or the maxed one. */
const tableUrl = ref(TABLE_URL);
/** Built on this player's gear (their own table, or a board gear combination's exactly like theirs):
 *  no adjustment, and none of the maxed table's caveats. */
const own = computed(() => tableUrl.value !== TABLE_URL && !shiftedTable.value);
/** INSTANT ANSWER V2: the maxed table moved to the player's gear (search/instantGear.ts, the form G). */
const shiftedTable = computed(() => !!parseGearShiftUrl(tableUrl.value));
/** A gear combination's table below GEAR_TABLE_TO, the maxed one from it. */
const gearTable = computed(() => !!parseCompositeUrl(tableUrl.value));
/** Where gear tables end and the maxed table takes over: from there it is exact for any gear on the
 *  board (the collector analyst, 1 Oct, B2). */
const GEAR_TABLE_TO = 340;
/** What changed since the player's own table was made, when it no longer fits their save. */
const ownChanged = ref('');

/** Where the player's own table would be: a slow hash of their id (search/tableGear.ts), worked
 *  out once per id; the id never leaves the page. Null without a save. */
let ownName: { id: string; name: Promise<string> } | null = null;
async function ownTableUrl(): Promise<string | null> {
  const id = (store.collectInputs().context.rawBackup as { eiUserId?: string } | undefined)?.eiUserId;
  if (!id) return null;
  if (ownName?.id !== id) ownName = { id, name: tableName(id) };
  return `${import.meta.env.BASE_URL}precompute/${await ownName.name}`;
}

const status = ref<'idle' | 'loading' | 'error' | 'done'>('idle');
/** This site has no usable table: only the no-instant-answer card is shown (NoInstantAnswer.vue). */
const noTable = ref(false);
/** The route starts below the table's lowest TE (`from`, the table header's): no instant answer for it. */
const below = ref<{ from: number; te: number } | null>(null);
const loadingText = ref('');
const errorText = ref('');
const result = ref<FoundRoutes | null>(null);
const header = ref<TableHeader | null>(null);
const ms = ref<number | null>(null);
/** The background polish (the user, 6 Oct): running, and what it improved. */
const backgroundStatus = ref<'idle' | 'running' | 'done'>('idle');
const gains = ref<PolishGain[]>([]);
const gainsText = computed(() => describeGains(gains.value, !!props.deadline));

/** The player's earnings set's Clothed TE bonus (read from the save the planner loaded). */
const bonus = computed(() => {
  const inv = store.readInventory();
  return inv.earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(inv.earnings)) : 0;
});

/** The player's peak delivery rate against the table's (search/leg.ts `instantDeliveryScale`). Null
 *  until the table's header is in. */
const deliveryScale = computed<number | null>(() => {
  // The player's own table is their own rate already.
  if (own.value) return 1;
  const k3 = header.value?.k3;
  if (!k3) return header.value ? 1 : null;
  return instantDeliveryScale(store.collectInputs(), k3);
});

/** The TE routes are found to: the planner's target, or for a date every TE up to the last. */
const target = computed(() => (props.deadline ? 490 : store.finalTE));
/** The save is already at or past the target: nothing to find, said plainly instead of nothing. */
const atTarget = computed(() => {
  const te = Math.floor(store.currentTE);
  return te > 0 && te >= target.value;
});

/**
 * The rows shown (the user, 2 Oct). Fastest route: 1-10 ascensions, and up to the best plus two when
 * the best is 9 or 10. By a date: from 1 up to the best plus two, the low counts kept even when far
 * behind. "The best" is the exact-checked lead once it is in, the table's until then; the finder looks
 * as far as MAX_ASCENSIONS so those rows exist.
 */
const MAX_ASCENSIONS = 12;
/** The stronger polish (routeFinder.ts `PolishOptions`): three of the finder's routes per count, the
 *  first two stops searched eight TE either way together, then the local search. On the bench
 *  (scripts/precompute.ts --prune-bench --wide 8 --candidates 3) it cut the finder's misses of over an
 *  hour from 7 to 5 of 1,408 and was never worse; ~0.5 s a count in the browser, so it runs after
 *  the answer is shown. */
const STRONG_POLISH = { wide: 8, candidates: 3 };

/**
 * After the answer is shown: the stronger polish on one worker, a row's route swapped in only where
 * it is better (`polishGains`: sooner, or By a date a higher TE or more to spare), then the "Prestige
 * by" line on the answer as it now stands.
 */
async function polishInBackground(
  id: number,
  p: RoutePool,
  url: string,
  options: PolishOptions,
  raw: FoundRoutes,
  shown: FoundRoutes
): Promise<boolean> {
  backgroundStatus.value = 'running';
  polishCut = false;
  gains.value = [];
  // On Safari the polish and "Prestige by" after it run on two route workers (SAFARI MEMORY below); the first answer
  // had them all (`run` gives them back).
  if (SAFARI) p.limitWorkers(SAFARI_ROUTE_WORKERS);
  try {
    const t = performance.now();
    const strong = await p.polish(url, { ...options, ...STRONG_POLISH }, JSON.parse(JSON.stringify(raw)));
    if (id !== runs) return false;
    if (import.meta.env.DEV) console.info(`instant answer: background polish ${Math.round(performance.now() - t)} ms`);
    const better = atMostAscensions({ ...raw, ...strong }, filters.value.maxAscensions);
    const g = polishGains(shown, better, !!props.deadline);
    if (g.length) {
      result.value = better;
      if (props.deadline) emitRoutes(better);
    }
    gains.value = g;
  } catch {
    if (id !== runs) return false;
    // A search started and cut it off (`pauseWorkForRun`): it starts again when the search ends.
    if (polishCut) {
      polishCut = false;
      backgroundStatus.value = 'idle';
      return false;
    }
    // Otherwise the first answer stands.
  }
  backgroundStatus.value = 'done';
  void runPrestigeBy(id, p, url);
  // Saved now (the nearest tables, if any, save it again when they are in).
  saveSnapshot(id);
  return true;
}
/** The background polish was cut off by a search starting, not by a failure. */
let polishCut = false;

/**
 * PRESTIGE BY (experimental; search/prestigeBy.ts, composables/usePrestigeBy.ts): once the answer is
 * in, how long its next prestige can wait before the answer gets worse, worked out on the route
 * workers (the estimate profile, then 2-4 route finder lookups), and said in one line under it.
 */
const prestigeFlag = usePrestigeBy();
const prestige = ref<{ line: PrestigeLine; cutoff: Cutoff; record: PrestigeByRecord } | null>(null);
const prestigeStatus = ref<'idle' | 'running' | 'done' | 'error'>('idle');
/** Bumped by each new answer (and a search starting), so a line for an older one is dropped. */
let prestigeRuns = 0;
/** Cut off by a search starting: worked out again when it ends. */
let prestigeLater = false;
/** The line's own promise, for a shared record to wait on (`recordOf`). */
let prestigeDone: Promise<void> | null = null;
/** What the answer was worked out from, for the line. */
let prestigeInputs: {
  id: number;
  url: string;
  firstLegs: FirstLeg[];
  scale: number;
  planStart: number;
  te: number;
  delivered: number[];
} | null = null;
/** How the waiting farm is counted: laying, for as long as the save's silos hold. */
const PRESTIGE_EGGS = 'silo' as const;
function runPrestigeBy(id: number, p: RoutePool, url: string): Promise<void> {
  prestigeDone = prestigeWork(id, p, url);
  return prestigeDone;
}
async function prestigeWork(id: number, p: RoutePool, url: string): Promise<void> {
  const ctx = prestigeInputs;
  const found = result.value;
  // `id`: the answer's run; the line is tied to its own counter too.
  if (!prestigeFlag.enabled.value || !ctx || ctx.id !== id || !found) return;
  const pid = ++prestigeRuns;
  const mode = props.deadline ? ('date' as const) : ('fastest' as const);
  const inputs = store.collectInputs();
  let farm: ReturnType<typeof farmLaying>;
  try {
    farm = farmLaying(inputs, ctx.planStart);
  } catch {
    farm = null;
  }
  const plan = prestigePlan({
    mode,
    found,
    firstLegs: ctx.firstLegs,
    planStart: ctx.planStart,
    startTE: ctx.te,
    saveDelivered: ctx.delivered,
    farm,
    siloSeconds: saveSiloSeconds(inputs),
    eggs: PRESTIGE_EGGS,
  });
  // "At most N ascensions" counts the player's own first ascension too.
  const maxAfter =
    filters.value.maxAscensions === null ? null : filters.value.maxAscensions - (plan && !plan.fresh ? 1 : 0);
  if (!plan || (maxAfter !== null && maxAfter < 1)) {
    prestige.value = null;
    prestigeStatus.value = 'idle';
    return;
  }
  prestigeStatus.value = 'running';
  prestige.value = null;
  const hours =
    useHours.value && store.availability ? (JSON.parse(JSON.stringify(store.availability)) as Availability) : null;
  const deadline = props.deadline;
  const req = {
    mode,
    prestigeAt: plan.prestigeAt,
    startTE: plan.startTE,
    delivered: plan.delivered,
    laying: plan.laying,
    final: target.value,
    ...(deadline ? { deadline } : {}),
    deliveryScale: ctx.scale,
    candidates: plan.candidates,
    hours: HORIZON_HOURS,
    ...(hours ? { playHours: hours } : {}),
  };
  const stale = () => pid !== prestigeRuns;
  const t0 = performance.now();
  try {
    const cut = await findCutoff({
      mode,
      keep: plan.keep,
      hours: HORIZON_HOURS,
      profile: async (extra, from) => {
        if (stale()) throw new Error('superseded');
        return p.prestigeEstimate(url, { ...req, from, candidates: [...req.candidates, ...extra] });
      },
      exact: async h => {
        if (stale()) throw new Error('superseded');
        const s = startStateAt(req, h);
        const base = {
          startTE: s.startTE,
          start: s.start,
          startDelivered: s.delivered,
          deliveryScale: ctx.scale,
          ...(deadline ? { deadline } : {}),
          ...(hours ? { hours } : {}),
          ...instantTail(hours, store.deferShifts),
        };
        const f = await findRoutes({
          ...base,
          table: () => null,
          final: target.value,
          maxAscensions: MAX_ASCENSIONS,
          expand: (items, settings) => p.expand(url, items, settings),
        });
        if (stale()) throw new Error('superseded');
        const polished = await p.polish(url, base, JSON.parse(JSON.stringify(f)));
        const both = atMostAscensions({ ...f, ...polished }, maxAfter);
        return { outcome: outcomeOf(both, mode, s.startTE), chains: candidatesOf(both, mode, true, false) };
      },
    });
    if (stale()) return;
    const line = describeCutoff(cut, {
      mode,
      prestigeAt: plan.prestigeAt,
      fresh: plan.fresh,
      firstStop: plan.firstStop,
      now: Math.floor(Date.now() / 1000),
      ...(deadline ? { deadline } : {}),
      final: target.value,
      show,
    });
    prestige.value = { line, cutoff: cut, record: recordOfCutoff(cut, line, plan, PRESTIGE_EGGS) };
    prestigeStatus.value = 'done';
    if (import.meta.env.DEV)
      console.info(`instant answer: prestige by ${Math.round(performance.now() - t0)} ms, ${cut.lookups} lookups`);
    saveSnapshot(runs);
  } catch {
    // Superseded, cut off by a search, or a failure: no line (the answer stands as it is).
    if (pid === prestigeRuns) prestigeStatus.value = 'error';
  }
}
// The box ticked in Your setup with an answer on screen: worked out now.
watch(
  () => prestigeFlag.enabled.value,
  on => {
    if (on && result.value && status.value === 'done' && !prestige.value && prestigeStatus.value !== 'running') {
      const ctx = prestigeInputs;
      if (ctx && (!runBusy.value || runsAlongside())) void runPrestigeBy(ctx.id, getPool(), ctx.url);
    }
  }
);

/**
 * NEAREST TABLES ABOVE AND BELOW (search/tableBracket.ts): for a player with no table of their own
 * gear, the route found again on the nearest deployed table for stronger gear and the nearest for
 * weaker, each at its own gear, on two workers of their own (so the player's table stays loaded),
 * after everything else has started. Their date likely falls between the two.
 */
interface BracketSide {
  entry: TableEntry;
  /** Fastest: when the target is reached. By a date: the highest TE by then (0: none). */
  end: number | null;
  te: number;
}
const bracket = ref<{ above: BracketSide | null; below: BracketSide | null } | null>(null);
const bracketStatus = ref<'idle' | 'running' | 'done'>('idle');
/** The bracket's own run number, bumped by each `run` (not by "Check again", which leaves it running). */
let bracketRuns = 0;
/** The bracket's workers while it runs, so a search starting can stop them (`pauseWorkForRun`). */
let bracketPool: RoutePool | null = null;
/** What the running bracket was asked, to start it again after a search. */
let bracketArgs: { legs: FirstLegsBase; hours: Availability | null } | null = null;
/** The bracket, held back until the search running now ends. */
let bracketLater: (() => void) | null = null;

/** "What if you had maxed gear?" (MaxedWhatIf.vue): the last answer's first-legs request and hours,
 *  its own answer, and whether the player is on the maxed table at maxed gear already. */
const whatIfInputs = shallowRef<{ legs: FirstLegsBase; hours: Availability | null } | null>(null);
const whatIf = computed(() => {
  const r = result.value;
  const w = whatIfInputs.value;
  if (!r || !w) return null;
  const mine = props.deadline ? r.byDate : r.best;
  return {
    legs: w.legs,
    hours: w.hours,
    // Held as the answer was, so "maxed" and "yours" are priced alike (23 Oct 2026).
    tail: instantTail(w.hours, store.deferShifts),
    mine: { end: mine?.end ?? null, te: mine ? mine.legs[mine.legs.length - 1].endTE : 0 },
    // Check exactly's answer was named beside it until 23 Oct 2026; the instant card is instant only now.
    exact: null,
    alreadyMaxed:
      !own.value && !gearTable.value && deliveryScale.value !== null && isMaxed({ bonus: bonus.value, k: deliveryScale.value }),
  };
});
async function runBracket(bid: number, legs: FirstLegsBase, hours: Availability | null): Promise<void> {
  if (bid !== bracketRuns || own.value || gearTable.value || deliveryScale.value === null) return;
  // Two more route workers, each loading a table: not while a search runs, unless the player chose.
  if (!backgroundMayStart({ runBusy: runBusy.value, alongside: runsAlongside() })) {
    bracketLater = () => void runBracket(bid, legs, hours);
    return;
  }
  // On Safari, not beside the "Prestige by" line's route workers: two more tables and sweep caches on top of
  // theirs (SAFARI MEMORY below). It starts when the line is done.
  if (SAFARI && prestigeStatus.value === 'running') {
    afterPrestige = () => void runBracket(bid, legs, hours);
    return;
  }
  bracketArgs = { legs, hours };
  const player = { bonus: bonus.value, k: deliveryScale.value };
  if (isMaxed(player)) return;
  let entries: TableEntry[];
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}precompute/tables.json`, { cache: 'no-cache' });
    if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) return;
    // Only tables of this simulator: an older one's price is not comparable with the answer on screen (23 Oct 2026).
    entries = ((await res.json()) as TableEntry[]).filter(e => e.from <= legs.startTE && !tableSimMismatch(e));
  } catch {
    return;
  }
  const { above, below } = pickBracket(entries, player);
  if (!above && !below) return;
  bracketStatus.value = 'running';
  const t0 = performance.now();
  const pool = new RoutePool(
    2,
    () => new Worker(new URL('../../workers/routeFinder.worker.ts', import.meta.url), { type: 'module' })
  );
  bracketPool = pool;
  const side = async (entry: TableEntry | null): Promise<BracketSide | null> => {
    if (!entry) return null;
    const url =
      entry.file === 'table.bin'
        ? TABLE_URL
        : compositeUrl(`${import.meta.env.BASE_URL}precompute/${entry.file}`, TABLE_URL, GEAR_TABLE_TO, entry.k);
    const r = await priceOnTable(pool, url, {
      legs,
      final: target.value,
      maxAscensions: MAX_ASCENSIONS,
      atMost: filters.value.maxAscensions,
      ...(props.deadline ? { deadline: props.deadline } : {}),
      hours,
      // Held as the answer on screen was (`instantTail`), so the two are priced alike.
      tail: instantTail(hours, store.deferShifts),
    });
    return { entry, end: r.end, te: r.te };
  };
  try {
    const a = await side(above);
    if (bid !== bracketRuns) return;
    const b = await side(below);
    if (bid !== bracketRuns) return;
    bracket.value = { above: a, below: b };
    if (import.meta.env.DEV)
      console.info(
        `instant answer: nearest tables ${Math.round(performance.now() - t0)} ms (${[above?.file, below?.file].join(', ')})`
      );
  } catch {
    // No bracket: the answer stands on its own.
  } finally {
    pool.terminate();
    if (bracketPool === pool) bracketPool = null;
    if (bid === bracketRuns) {
      bracketStatus.value = 'done';
      // The current run's number, not the one this started under: "Check again" bumps `runs` without
      // superseding the bracket, and the snapshot is waiting on it.
      saveSnapshot(runs);
    }
  }
}
/** The bracket's two ends against the answer on screen (lib/bracketLine.ts): never sooner than a maxed answer,
 *  never contradicting one on the player's gear (the form G); '' when nothing true is left to say. */
const bracketText = computed(() => {
  const b = bracket.value;
  if (!b?.above?.end) return '';
  const name = (s: BracketSide) =>
    s.entry.file === 'table.bin' ? 'the instant answer for fully maxed gear' : describeGear(s.entry);
  const side = (s: BracketSide | null) => (s ? { end: s.end, te: s.te, name: name(s) } : null);
  const r = result.value;
  const mine = props.deadline ? r?.byDate : r?.best;
  return bracketLine({
    goal: props.deadline ? 'date' : 'fastest',
    answer: {
      basis: shiftedTable.value ? 'yours' : 'maxed',
      end: mine?.end ?? null,
      te: mine?.legs.length ? mine.legs[mine.legs.length - 1].endTE : 0,
    },
    hi: side(b.above),
    lo: side(b.below?.end ? b.below : null),
    show,
  });
});

/** "Works inside my hours" (only with "Let me pick my hours") and "At most N ascensions". */
const filters = ref(readFilters());
watch(filters, f => writeFilters(f), { deep: true });
const hoursOn = computed(() => store.scheduleEnabled && !!store.availability);
const useHours = computed(() => hoursOn.value && filters.value.inHours);
/**
 * "Works inside my hours" ticked by default whenever playing hours are set (search/instantFilters.ts
 * `defaultInsideHours`; Jordan, 22 Oct 2026). The player's own tick or untick is remembered and wins: never ticked
 * again by itself once unticked. No hours: as before.
 */
const insideHoursChoice = ref(readInsideHoursChoice());
watch(
  () => [hoursOn.value, isConstrained(store.availability)] as const,
  ([on, constrained]) => {
    const want = insideHoursFor(on, constrained, insideHoursChoice.value, filters.value.inHours);
    if (want !== filters.value.inHours) filters.value = { ...filters.value, inHours: want };
  },
  { immediate: true }
);
function setInsideHours(on: boolean): void {
  insideHoursChoice.value = on ? 'on' : 'off';
  writeInsideHoursChoice(insideHoursChoice.value);
  filters.value = { ...filters.value, inHours: on };
}
const filtering = computed(() => useHours.value || filters.value.maxAscensions !== null);
function fastestRowsOf(found: NonNullable<typeof result.value>): Route[] {
  const top = Math.max(10, (found.best?.legs.length ?? 0) + 2);
  return found.byAscensions.filter((r, k): r is Route => !!r && k <= top);
}
const rows = computed(() => (result.value ? fastestRowsOf(result.value) : []));
/** The per-count table shows counts up to one past the best, the rest behind a toggle: past that, more
 *  ascensions only add stops that no longer help. */
const showMoreCounts = ref(false);
const counts = computed(() => countsShown(rows.value, result.value?.best, null));
const shownRows = computed(() => (showMoreCounts.value ? rows.value : counts.value.shown));
const hiddenCounts = computed(() => counts.value.hidden);
/** No route at all past the best + 1: the finder left them out (USEFUL_STOP_MAX), so say why. */
const moreDontHelp = computed(
  () => !!result.value?.best && !rows.value.some(r => r.legs.length > counts.value.limit)
);
/** The TE the note names: where builds reach their full laying rate (measured 338; the cap is 360). */
const USEFUL_STOP_NOTE = 340;

/** Setup the instant answer does not model, named so nobody reads it as accounted for. Playing hours are in the one
 *  line under the answer (`INSTANT_ONE_LINE`), so only these are named here. */
const leftOut = computed(() => {
  const out: string[] = [];
  if (store.timeOff.length) out.push('time off');
  if (store.milestones.length) out.push('dates to hit');
  return out;
});

/** How far the player's earnings set is from the table's Clothed TE bonus. */
const bonusShort = computed(() => (header.value ? header.value.cteBonus - bonus.value : 0));

/** Which instant answer the card read: the player's own, a gear combination's, or the maxed one scaled. */
const answerTable = computed<AnswerTable>(() => (gearTable.value ? 'gear' : own.value ? 'own' : 'maxed'));
/** "May be optimistic for your gear": the maxed answer scaled to a delivery rate under 95%, a gear combination's too
 *  when the route starts above its own rows (lib/optimisticAnswer.ts). */
const optimistic = computed(() => {
  // A gear combination's answer above its own rows: the maxed one at the composite's scale (the one applied).
  const comp = parseCompositeUrl(tableUrl.value);
  if (comp) return optimisticForGear('gear', comp.scale, gearReadsMaxed(store.currentTE, header.value?.gearTo, comp.split));
  // The form G is at the player's own delivery (measured within about 2%, a little pessimistic).
  if (shiftedTable.value) return optimisticForGear('maxed', 1);
  return optimisticForGear(answerTable.value, deliveryScale.value);
});

/**
 * The start TE from which the table's builds hold for any gear: the build reaches full research, so
 * the delivery adjustment is exact and the earnings set stops mattering. Measured on the board's legs
 * priced the site's way (the collector analyst, 1 Oct): from 340 every account is exact (median
 * 0.00%, 90th percentile at most 0.02%, 168k legs). At 300-339 accounts that earn less than the
 * table's (a smaller bonus or weaker delivery: a build earns eggs shipped times egg value) need one
 * more sale week on many legs (7-57% of identical legs, by account). At 245-251 the earnings set
 * costs ~0.3% of leg time per Clothed TE point and delivery gear on incomplete research is off by
 * 1-2.6% either way.
 */
const FULL_RESEARCH_TE = 340;

/** The player's gear is not the table's account's, and the route starts where that shows. Not with the
 *  form G: it takes the earnings set and the delivery gear off (instant answer v2). */
const gearDiffers = computed(
  () =>
    !own.value &&
    !shiftedTable.value &&
    Math.floor(store.currentTE) < FULL_RESEARCH_TE &&
    (bonusShort.value > 0.05 || Math.abs((deliveryScale.value ?? 1) - 1) > 0.005)
);

/** What the player's epic research and colleggtibles are short of the table's (all maxed), said
 *  plainly; empty when nothing is, or nothing could be read. For the instant answer record only: the
 *  note that said it was dropped with instant answer v2 (the form G takes both off). */
const progressionShort = computed(() => {
  if (own.value) return '';
  const { epicResearch, colleggtibles } = store.progression();
  const out: string[] = [];
  if (epicResearch && !epicResearch.maxed)
    out.push(`${epicResearch.atMax} of ${epicResearch.total} epic research at max`);
  if (colleggtibles && !colleggtibles.maxed) out.push(`colleggtibles ${describeColleggtibles(colleggtibles)}`);
  return out.join(' and ');
});

let pool: RoutePool | null = null;
/** A phone or a small machine (search/device.ts): two route workers, no background polish or nearest
 *  tables, and the exact check only when asked. */
const small = isSmallDevice();
function getPool(): RoutePool {
  pool ??= new RoutePool(
    small ? Math.min(2, poolSize()) : poolSize(),
    () => new Worker(new URL('../../workers/routeFinder.worker.ts', import.meta.url), { type: 'module' })
  );
  return pool;
}
onUnmounted(() => pool?.terminate());
// A chain search (Smart search, Full sweep, By a date) gets the route workers' memory: each holds a
// decoded table, and the browser's heap is shared with every chain worker. The pool sleeps once it
// is idle and the instant answer is not mid-run (never cutting off a request: until then this
// waits); the next request wakes it, reloading the table.
watch(
  () =>
    (store.isRunning || store.deadlineRunning || store.resultSending) &&
    status.value !== 'loading' &&
    backgroundStatus.value !== 'running' &&
    prestigeStatus.value !== 'running',
  free => {
    if (free) pool?.sleep();
  }
);

/** A chain search or By a date run has the cores and the memory. */
// ...and a finished run sending its result: its CSV is built in the memory the run just freed.
const runBusy = computed(() => store.isRunning || store.deadlineRunning || store.resultSending);
/** The panel is holding off working routes out because of a run (shows the line and its button). */
const waiting = ref(false);
/** The polish and exact check, held back to when the run ends. */
let afterRun: (() => void) | null = null;
watch(runBusy, (busy, wasBusy) => {
  if (busy && !wasBusy) pauseWorkForRun();
  if (resumeAfterRun({ wasBusy, busy, waiting: waiting.value })) {
    void run();
    return;
  }
  if (!busy && wasBusy && prestigeLater) {
    prestigeLater = false;
    if (result.value && prestigeInputs) void runPrestigeBy(prestigeInputs.id, getPool(), prestigeInputs.url);
  }
  if (!busy && wasBusy && bracketLater) {
    const go = bracketLater;
    bracketLater = null;
    go();
  }
  if (!busy && wasBusy && afterRun) {
    const go = afterRun;
    afterRun = null;
    go();
  }
});

/** Remembered "let the instant answer run during a search" (also a box in Your setup). */
const instantDuringSearch = useInstantDuringSearch();
/** The warning is open for this press: which button asked ("again" forces, the waits line goes ahead). */
const confirming = ref<WarnAsk | null>(null);
/** The last run started alongside a search, so the short memory note shows while it
 *  is still going. */
const alongside = ref(false);
/** The player chose to run the instant answer alongside the search (search/instantDeferral.ts). */
function runsAlongside(): boolean {
  return instantDuringSearch.value || alongside.value;
}

/**
 * A search just started: the instant answer's own work in flight waits for it to end (the nearest
 * gear tables, the background polish), unless the player chose to run alongside. Each starts again
 * when the search ends, from what is held here.
 */
function pauseWorkForRun(): void {
  const pause = pauseForRun({
    wasBusy: false,
    busy: true,
    alongside: runsAlongside(),
    running: {
      exact: false,
      bracket: bracketStatus.value === 'running',
      // The route finding itself (status 'loading') shares the pool and is never cut off.
      polish: backgroundStatus.value === 'running' && status.value !== 'loading',
    },
  });
  if (pause.bracket) {
    const args = bracketArgs;
    const bid = ++bracketRuns;
    bracketPool?.terminate();
    bracketPool = null;
    bracketStatus.value = 'idle';
    if (args) bracketLater = () => void runBracket(bid, args.legs, args.hours);
  }
  if (pause.polish) {
    polishCut = true;
    pool?.interrupt();
  }
  // The experimental "Prestige by" line stops too, and is worked out again when the search ends.
  if (prestigeStatus.value === 'running' && status.value !== 'loading' && !runsAlongside()) {
    ++prestigeRuns;
    prestigeStatus.value = 'idle';
    prestigeLater = true;
    pool?.interrupt();
  }
}

/**
 * The buttons' press. With no search running it runs at once, as before. During a search it asks
 * first (memory), unless the player chose not to be asked.
 */
function pressRun(force: boolean, at: WarnAt): void {
  if (!runBusy.value || instantDuringSearch.value) {
    confirming.value = null;
    goRun(force);
    return;
  }
  confirming.value = { force, at };
}
/** "Run it anyway" (once) or "Don't ask again, just warn me" (and remember). */
function confirmRun(remember: boolean): void {
  const ask = confirming.value;
  confirming.value = null;
  if (!ask) return;
  if (remember) instantDuringSearch.value = true;
  goRun(ask.force);
}
function goRun(force: boolean): void {
  alongside.value = runBusy.value;
  void run(force, true);
}
// The warning is about a search that is running: when it ends there is nothing left to warn about.
watch(runBusy, busy => {
  if (!busy) {
    confirming.value = null;
    alongside.value = false;
  }
});

/** A thrown message as a player may see it: the loader's own wording says "table", which players never see. */
function playerFacing(message: string): string {
  if (/table/i.test(message)) return 'the instant answer could not be read';
  // Never raw exception text (lib/plainError.ts).
  return plainError(new Error(message), 'something went wrong');
}

/** Each run's number: a run that has been superseded (the save or the date changed) is dropped. */
let runs = 0;

/**
 * The table's header, the player's first ascension and then the search itself, here on the page,
 * with each step's arithmetic split across the workers (search/routePool.ts).
 */
async function run(force = false, goAhead = false): Promise<void> {
  // Never on a restored draft or a half-set-up account (`waitForSave`): it runs again once the save is set up.
  if (store.startWait) return;
  const te = Math.floor(store.currentTE);
  if (!(te > 0)) return;
  if (!(target.value > te)) {
    // Already at or past the target (atTarget says so): drop any answer for an earlier save or target.
    ++runs;
    ++bracketRuns;
    result.value = null;
    status.value = 'idle';
    return;
  }
  const id = ++runs;
  const bid = ++bracketRuns;
  whatIfResult.value = null;
  keptSearch.value = null;
  // The same save, setup and filters as when it was last worked out: show that answer, in full, and
  // skip the work. (The plan start is not in this key, as it is a new minute on every visit: the note says which
  // start the saved dates are for. The "|0" is the retired at-once box, off: snapshots saved before keep loading.)
  snapKey = instantSnapKey(cacheKey());
  savedAt.value = null;
  waiting.value = false;
  afterRun = null;
  afterPrestige = null;
  // A "Prestige by" line for the last answer stops asking the route workers.
  ++prestigeRuns;
  prestigeLater = false;
  prestigeInputs = null;
  if (prestigeStatus.value === 'running') prestigeStatus.value = 'idle';
  // The old saved answer stays until a new one is saved over it (saveSnapshot): a forced run that is
  // stopped, superseded or fails must not leave the player with nothing.
  // One whose gear note an older gear rule gave is not shown again (search/instantSnapshot.ts).
  const saved = !force && snapshotUsable(readSnapshot<InstantSnapshot>(snapKey), GEAR_RULE);
  // Pressing "Work it out again" is the go-ahead: it must not drop to "waits" while a search runs.
  const what = onArrival({ runBusy: runBusy.value, hasSaved: saved, goAhead: goAhead || force });
  if (what === 'restore' && restoreSnapshot()) return;
  if (what === 'wait' || (what === 'restore' && runBusy.value && !goAhead)) {
    // A search has the memory: no route workers until it ends or the player says go ahead. The
    // answer on screen stays, as the previous one (search/instantDeferral.ts whileWaiting); a panel
    // opened again with none shows the one it had when it closed, if it is for the same key.
    if (!result.value) {
      const prev = recallShown<InstantSnapshot>(snapKey);
      if (prev && snapshotUsable(prev, GEAR_RULE)) applySnapshot(prev);
    }
    waiting.value = true;
    savedAt.value = null;
    if (whileWaiting(!!result.value).keepAnswer) {
      // The whole answer is worked out again when the search ends (resumeAfterRun), and so is whatever the
      // superseded run had going (its awaits see a newer run number and stop).
      if (status.value === 'loading') status.value = 'done';
      if (backgroundStatus.value === 'running') backgroundStatus.value = 'idle';
      if (bracketStatus.value === 'running') bracketStatus.value = 'idle';
      return;
    }
    status.value = 'idle';
    backgroundStatus.value = 'idle';
    bracketStatus.value = 'idle';
    result.value = null;
    return;
  }
  status.value = 'loading';
  noTable.value = false;
  below.value = null;
  backgroundStatus.value = 'idle';
  gains.value = [];
  bracket.value = null;
  bracketStatus.value = 'idle';
  loadingText.value = header.value
    ? 'Working out every route…'
    : 'Loading the instant answer (a few MB, once) and working out every route…';
  try {
    const p = getPool();
    // The first answer on every route worker again (Safari keeps two for the polish after it); once idle.
    if (SAFARI) p.limitWorkers(p.size);
    // The player's own table when there is one built on the gear their save has now; else the maxed one.
    let url = TABLE_URL;
    let h: TableHeader | null = null;
    let mismatch = '';
    stampHash.value = '';
    const mine = await ownTableUrl().catch(() => null);
    // No table of their own (the usual case): the maxed one. A stall stops here (`probeHeader`).
    const oh = mine ? await probeHeader(() => p.header(mine)) : null;
    if (oh?.gear && mine) {
      const stamp = gearStamp(store.collectInputs(), store.readInventory().earnings, oh.gear.research);
      const changes = stamp ? gearChanges(oh.gear, stamp) : ['gear'];
      // INSTANT ANSWER V2: only a table made by this simulator; an older one gives way to the form G below.
      if (!changes.length) {
        if (!tableSimMismatch(oh)) {
          url = mine;
          h = oh;
        }
      } else mismatch = changes.join(', ');
    }
    h ??= await p.header(TABLE_URL);
    // No table of their own: one built on a board gear combination exactly like theirs, if there is
    // one (search/tableGear.ts gearTableName), below GEAR_TABLE_TO; the maxed one from there.
    if (url === TABLE_URL && h.k3) {
      const stamp = gearStamp(store.collectInputs(), store.readInventory().earnings, h.k3.research);
      if (stamp) {
        // The gear stamp's hash, for an instant answer record: the legacy name's, which analysis
        // matches to the deployed files (tableGear.ts legacyGearTableName).
        stampHash.value = (await legacyGearTableName(stamp)).replace(/^gear-|\.bin$/g, '');
        const scale = instantDeliveryScale(store.collectInputs(), h.k3);
        // The canonical name first (the same gear however it is worn), then the legacy one.
        let found = false;
        for (const gearName of await gearTableNames(stamp)) {
          const gearUrl = `${import.meta.env.BASE_URL}precompute/${gearName}`;
          const both = compositeUrl(gearUrl, TABLE_URL, GEAR_TABLE_TO, scale);
          try {
            const gh = await p.header(both);
            // INSTANT ANSWER V2: a gear table made by an older simulator gives way to the form G below.
            if (tableSimMismatch(gh)) break;
            h = gh;
            url = both;
            found = true;
            break;
          } catch (e) {
            // Not under this name. Stalled: no other name either (the maxed one is already in).
            if (isTableStall(e)) break;
          }
        }
        // No table for this gear (the usual case): the maxed one.
        if (!found) h = await p.header(TABLE_URL);
      }
    }
    // INSTANT ANSWER V2: no own or gear table of this simulator: the maxed table moved to the player's
    // gear (search/instantGear.ts, the form G), unless they are as good as maxed.
    let gearShifted = false;
    if (url === TABLE_URL) {
      const shift = instantGearShift(store.collectInputs(), h);
      if (shift && !nearMaxedGear(shift)) {
        const shiftedUrl = gearShiftUrl(TABLE_URL, gearShiftKey(shift));
        h = await p.header(shiftedUrl);
        url = shiftedUrl;
        gearShifted = true;
      }
    }
    if (id !== runs) return;
    header.value = h;
    tableUrl.value = url;
    ownChanged.value = mismatch;
    // Every TE from the player's up is needed, and the table starts where virtue players are.
    if (te < h.from) {
      result.value = null;
      status.value = 'error';
      below.value = { from: h.from, te };
      errorText.value = `The instant answer starts at TE ${h.from} and your route starts at ${te}, so there is no instant answer yet. The searches below work as always.`;
      return;
    }
    const inputs = store.collectInputs();
    // The form G is at the player's delivery already.
    const scale = gearShifted ? 1 : (deliveryScale.value ?? 1);
    const t0 = performance.now();
    // The first-legs request, Continue my build-up included (search/instantFirstLegs.ts): the standard
    // build carried on from the farm in the save, simulated on a background worker (a few seconds).
    const legsRequest: FirstLegsBase = await instantFirstLegsBase(inputs, {
      startTE: te,
      final: target.value,
      // Above the table's top it has no row for the player: their one ascension to the target is
      // simulated live instead (search/liveCell.ts), a few seconds on a background worker.
      ...(te > h.to
        ? {
            liveFresh: (t: number, at: number) => {
              loadingText.value = 'Working out your one ascension to the target (your TE is past the top of the instant answer)…';
              return store.liveFreshBuilds(t, at);
            },
          }
        : {}),
      buildUpTails: () => {
        loadingText.value = 'Working out your build-up from your farm as it is…';
        return store.buildUpTails();
      },
    });
    if (id !== runs) return;
    // A plain copy: it goes to the workers.
    const hours =
      useHours.value && store.availability ? (JSON.parse(JSON.stringify(store.availability)) as Availability) : null;
    // INSTANT ANSWER V2: the table's legs (and the first) held for the player's hours as Check exactly holds them.
    const tail = instantTail(hours, store.deferShifts);
    const firstLegs = await p.firstLegs({ url, deliveryScale: scale, ...legsRequest, ...tail, hours });
    if (id !== runs) return;
    prestigeInputs = { id, url, firstLegs, scale, planStart: inputs.planStart, te, delivered: legsRequest.delivered };
    whatIfInputs.value = { legs: legsRequest, hours };
    const found = await findRoutes({
      table: () => null,
      startTE: te,
      start: inputs.planStart,
      final: target.value,
      maxAscensions: MAX_ASCENSIONS,
      firstLegs,
      deliveryScale: scale,
      ...(props.deadline ? { deadline: props.deadline } : {}),
      ...(hours ? { hours } : {}),
      ...tail,
      onProgress: (done, of) => {
        if (id === runs) loadingText.value = `Working out every route: ${done} of ${of} ascension counts done…`;
      },
      expand: (items, settings) => p.expand(url, items, settings),
    });
    if (id !== runs) return;
    // Each answer moved a stop or two on the table where that ends sooner: the search can prune a
    // route whose later, better-aligned start makes it faster (routeFinder.ts `polishFound`).
    const polishOptions: PolishOptions = {
      startTE: te,
      start: inputs.planStart,
      firstLegs,
      deliveryScale: scale,
      ...(props.deadline ? { deadline: props.deadline } : {}),
      ...(hours ? { hours } : {}),
      ...tail,
    };
    const polished = await p.polish(url, polishOptions, JSON.parse(JSON.stringify(found)));
    if (id !== runs) return;
    const raw = { ...found, ...polished };
    const answer = atMostAscensions(raw, filters.value.maxAscensions);
    result.value = answer;
    // The last answer's "Prestige by" line goes with it.
    prestige.value = null;
    prestigeStatus.value = 'idle';
    answerStart.value = inputs.planStart;
    ms.value = performance.now() - t0;
    status.value = 'done';
    if (props.deadline) emitRoutes(answer);
    if (small) {
      // No background polish on a small device: the line (when it is on) straight after the answer.
      if (!runBusy.value) void runPrestigeBy(id, p, url);
      saveSnapshot(id);
      return;
    }
    const polish = (): void =>
      void polishInBackground(id, p, url, polishOptions, raw, answer).then(done => {
        if (done) return runBracket(bid, legsRequest, hours);
        // Cut off by a search starting (`pauseWorkForRun`): again when it ends.
        if (id === runs && runBusy.value)
          afterRun = () => {
            if (id === runs) polish();
          };
      });
    // A search started meanwhile (or this was worked out anyway during one): the polish waits for it to end.
    if (runBusy.value) {
      afterRun = () => {
        if (id === runs) polish();
      };
      return;
    }
    polish();
  } catch (err) {
    if (id !== runs) return;
    const message = err instanceof Error ? err.message : String(err);
    status.value = 'error';
    // No usable table on this site (missing, a web page in its place, or cut short): only the card
    // saying so (NoInstantAnswer.vue), and every search works exactly as without it.
    noTable.value = tableLoadFailed(message);
    errorText.value = noTable.value
      ? TABLE_LOAD_FAILED
      : `The instant answer couldn’t run: ${playerFacing(message)}`;
  }
}

/**
 * THE INTEGRITY CHECK (search/instantIntegrity.ts): the same probe every Start uses, run here too so
 * the instant answer never shows routes for an account that stalls for a week or more on its first
 * Integrity shift. Routes are held back while it runs and for good when it blocks; past an hour they
 * show with a note that their times include the wait.
 */
useIntegrityProbe(() => useInitialStateStore().playerId);
const integrity = computed(() =>
  instantIntegrity(
    store.integrityWait,
    store.integrityChecking,
    store.integrityBlocked ? store.cteParts() : null,
    own.value
  )
);
const integrityHold = computed(() => holdsRoutes(integrity.value));
// LOW-TE OPENING (auto/lowTeOpening.ts)
const lowTeNote = computed(() => lowTeOpeningNote(store.integrityLowTe));
/** Why the table's cells may not be this simulator's (search/simVersion.ts), or null. */
const simNote = computed(() => tableSimMismatch(header.value));


/** Under a day to spare is tight: a slower ascension than planned, or a late start, misses the date. */
const TIGHT_SECONDS = 86400;
/** A By a date route as the box and the counts list read it: its stops, the TE it ends at and when. */
interface DatePick {
  chain: number[];
  endTE: number;
  end: number;
}
const tableDate = (r: Route): DatePick => ({ chain: r.chain, endTE: r.legs[r.legs.length - 1].endTE, end: r.end });
const spareOf = (d: DatePick) => (props.deadline ?? 0) - d.end;
/** The rows By a date shows: the table's best number of ascensions and up to two either side. */
function dateRowsOf(found: NonNullable<typeof result.value>): Route[] {
  const best = found.byDate;
  if (!best) return [];
  const top = best.legs.length + 2;
  const shown = found.byDateByAscensions.filter((r, k): r is Route => !!r && k <= top);
  // (The overall route and its count's row are separate objects for the same route.)
  return [best, ...shown.filter(r => r.legs.length !== best.legs.length)];
}
const dateRows = computed(() =>
  result.value ? [...dateRowsOf(result.value)].sort((a, b) => a.legs.length - b.legs.length) : []
);

const key = (chain: readonly number[]) => chain.join(',');

/** The plan start the answer was worked out from, for "Simulate this plan" and the saved answer's note. */
const answerStart = ref(0);
/**
 * "Simulate this plan" (a row's, or the answer's): this route in Classic, simulated on the player's save from the
 * start the answer was worked out from and with its time off; Classic scrolls to the plan and says where it came
 * from (search/simulateRoute.ts).
 */
function openPlan(chain: number[]): void {
  simulateRoute(chain, props.deadline ? 'by-date' : 'fastest', answerStart.value ? { start: answerStart.value } : {});
}
/** "Follow this route": the goal My runs' Right now follows it for (lib/follow.ts). */
const followGoal = computed(() => screenGoalKey(props.deadline, store.finalTE));
/** When the answer on screen was worked out (ms; a snapshot's own time when restored): a route followed before it is
 *  older, so a better answer is offered (BetterRoutePrompt.vue). */
const answerAt = ref(0);
let restoredAt: number | null = null;
watch(result, r => {
  answerAt.value = r ? (restoredAt ?? Date.now()) : 0;
  restoredAt = null;
});
/** The instant answer as the prompt's new result. */
function instantCandidate(r: { chain: readonly number[]; end: number; endTE: number }) {
  return { chain: [...r.chain], end: r.end, endTE: r.endTE, at: answerAt.value, source: 'instant' as const, planStart: answerStart.value || null };
}
/** "Follow this route" only on a route in time (lib/eggDayRule.ts, 22 Oct 2026). */
const boxFollowable = computed(() => {
  const deadline = props.deadline;
  const found = result.value;
  if (!deadline || !found?.byDate) return true;
  return finishesBefore(dateBoxOf(found.byDate).end, deadline);
});
function rowFollowable(r: Route): boolean {
  return !props.deadline || finishesBefore(r.end, props.deadline);
}
/** A row whose gap to the fastest is under about a tenth of a day (Allan, 14 Oct). With MORE ascensions it is usually the
 *  same route with one ascension cut in two: one more prestige for no gain. With FEWER it is a good option, not a
 *  waste (carpetsage, Discord): one fewer prestige for a little time. */
const NEAR_TIE_SECONDS = 0.1 * 86400;
function nearTie(r: Route): NearTie | null {
  const t = result.value?.best;
  if (!t || r === t) return null;
  const gap = r.seconds - t.seconds;
  if (gap >= NEAR_TIE_SECONDS) return null;
  return nearTieOf(r.legs.length, t.legs.length, gap);
}
/** How far a row is behind the fastest, on the instant answer. */
function behind(r: Route): string {
  const t = result.value?.best;
  if (!t) return '';
  return r === t ? 'fastest' : '+' + days(r.seconds - t.seconds);
}
/**
 * Fastest route only: hand the searches this answer (chainSearch.ts `suggestedCount`/`suggestedRoute`
 * for their "the instant answer suggests N ascensions" notes, and `instantRoutes`, fastest first, for
 * Smart search's starting chain and the Full sweep's Suggest a space).
 */
watch(result, () => {
  if (props.deadline || !result.value) return;
  const ordered = result.value.byAscensions.filter((r): r is Route => !!r).sort((a, b) => a.end - b.end);
  store.instantRoutes = ordered.map(r => [...r.chain]);
  store.suggestedRoute = ordered[0] ? [...ordered[0].chain] : null;
  store.suggestedCount = ordered[0] ? ordered[0].chain.length : null;
});

/** The route the box leads with: the instant answer's fastest. */
const lead = computed(() => result.value?.best ?? null);

/**
 * PREFER FEWER ASCENSIONS (Q6, Wolfcry1993; search/preferFewer.ts). The green box may lead with the route with the
 * fewest ascensions inside the player's margin of the best (Fastest: in time; By a date: in TE). ONLY the box:
 * `lead` and the date answer stay the best for everything else (the summary for the result cards, the searches'
 * suggestions, Prestige by, the share). Right now follows the chosen route only through the box's own Follow this
 * route button. Remembered per browser, one value per screen; "Show the fastest instead ›" shows the best for now.
 * The numbers are the instant answer's (no shifts: none are said).
 */
const preferSetting = ref<PreferSetting>(readPreferFewer());
watch(preferSetting, s => writePreferFewer(s), { deep: true });
const preferGoal = computed<PreferGoal>(() => (props.deadline ? 'date' : 'fastest'));
const preferMargin = computed<PreferMargin>({
  get: () => preferSetting.value[preferGoal.value],
  set: m => {
    preferSetting.value = { ...preferSetting.value, [preferGoal.value]: m };
  },
});
const preferShowBest = ref(false);
watch(preferMargin, () => {
  preferShowBest.value = false;
});
const fastestChoice = computed<PreferChoice<Route> | null>(() => {
  const best = lead.value;
  if (props.deadline || !result.value || !best) return null;
  const rowOf = (r: Route): PreferRow<Route> => ({ item: r, ascensions: r.legs.length, finish: r.end, shifts: null });
  const others = rows.value.filter(r => r !== best).map(rowOf);
  const top = rowOf(best);
  return choosePreferFewer('fastest', [top, ...others], preferMargin.value, top);
});
const dateChoice = computed<PreferChoice<DatePick> | null>(() => {
  const deadline = props.deadline;
  const found = result.value;
  if (!deadline || !found?.byDate) return null;
  const best = tableDate(found.byDate);
  const rowOf = (d: DatePick): PreferRow<DatePick> => ({
    item: d,
    ascensions: d.chain.length,
    finish: d.end,
    endTE: d.endTE,
    spare: deadline - d.end,
    shifts: null,
  });
  const others = dateRows.value.map(tableDate).filter(d => key(d.chain) !== key(best.chain));
  const top = rowOf(best);
  return choosePreferFewer('date', [top, ...others.map(rowOf)], preferMargin.value, top);
});
const preferChoice = computed<PreferChoice<unknown> | null>(() => (props.deadline ? dateChoice.value : fastestChoice.value));
const preferCopy = computed<PreferCopy>(() =>
  preferFewerCopy<unknown>(preferChoice.value, preferGoal.value, preferMargin.value, show)
);
/**
 * The count this screen's default ascension range follows (lib/ascRange.ts; Jordan, 22 Oct 2026): the route the
 * box leads with under Prefer fewer (the setting, not "Show the fastest instead", which is for now), else the
 * best. Fastest's Limits box and By a date's Nearby routes read it (chainSearch.ts `rangeCount`).
 */
watch(
  () => followedCount(preferChoice.value),
  n => {
    store.rangeCount = { ...store.rangeCount, [preferGoal.value]: n };
  },
  { immediate: true }
);
/** The box leads with another route than the best now. */
const preferPicked = computed(() => preferChoice.value?.state === 'fewer' && !preferShowBest.value);
/** Fastest: the route the box shows. */
const boxLead = computed<Route | null>(() =>
  preferPicked.value && fastestChoice.value ? fastestChoice.value.chosen.item : lead.value
);
/** By a date: the answer the box shows (the instant answer's best, or the one Prefer fewer picked). */
function dateBoxOf(fallback: Route): DatePick {
  if (preferPicked.value && dateChoice.value) return dateChoice.value.chosen.item;
  return tableDate(fallback);
}
/** By a date's counts row lit as the box's. */
function dateRowLit(r: Route): boolean {
  const found = result.value;
  return !!found?.byDate && key(r.chain) === key(dateBoxOf(found.byDate).chain);
}
function datePickedRow(r: Route): boolean {
  return preferPicked.value && dateRowLit(r);
}

/**
 * Fastest route only: a read-only summary of the route the box leads with, for the result cards
 * beside it ("The instant answer has a route with 7 ascensions that may finish sooner",
 * lib/longerRouteHint.ts), on the instant answer.
 */
const instantSummary = useInstantSummaryStore();
watch(
  () => {
    const r = lead.value;
    if (props.deadline || !r || status.value === 'loading') return null;
    return { chain: [...r.chain], seconds: r.seconds, exact: false };
  },
  s => {
    instantSummary.fastest = s;
  },
  { immediate: true }
);
// The lead route for the comparison block (SearchCompare.vue, stores/stronger.ts).
const strongerStore = useStrongerStore();

/**
 * SAFARI MEMORY (22 Oct 2026: By a date with hours on reloaded the tab twice in Safari, "using significant memory").
 * On Safari the route workers keep half the sweeps (search/sweepCache.ts), the background polish and "Prestige by" run
 * on two of them (`limitWorkers`), and the nearest tables above and below wait for the "Prestige by" line, so their two
 * extra route workers never run beside it. (Check exactly and Light, which this also waited for, are gone since
 * 23 Oct 2026.)
 */
/** Safari, read once (search/device.ts). */
const SAFARI = isSafari();
/** The nearest tables, held on Safari until the "Prestige by" line is done (`runBracket`). */
let afterPrestige: (() => void) | null = null;
watch(
  () => prestigeStatus.value === 'running',
  running => {
    if (running || !afterPrestige) return;
    const go = afterPrestige;
    afterPrestige = null;
    go();
  }
);

watch(
  () => {
    if (!result.value || status.value === 'loading') return null;
    if (props.deadline) {
      if (!result.value.byDate) return null;
      const d = tableDate(result.value.byDate);
      return { chain: [...d.chain], end: d.end, endTE: d.endTE, spare: props.deadline - d.end, exact: false };
    }
    const r = lead.value;
    if (!r) return null;
    return { chain: [...r.chain], end: r.end, endTE: store.finalTE, exact: false };
  },
  v => {
    strongerStore.instant[props.deadline ? 'date' : 'fastest'] = v;
  },
  { immediate: true }
);
onUnmounted(() => (strongerStore.instant[props.deadline ? 'date' : 'fastest'] = null));

// Every route listed, the lead first, for "When should I start?" (StartTimeCard.vue).
watch(
  () => {
    if (props.deadline || status.value === 'loading' || !lead.value) return [];
    const out = [lead.value.chain, ...rows.value.map(r => r.chain)];
    return out.filter((c, i) => out.findIndex(o => o.join(',') === c.join(',')) === i).map(c => [...c]);
  },
  list => {
    if (props.deadline) return;
    instantSummary.listed = list;
    if (list.length) instantSummary.lastListed = { finalTE: store.finalTE, routes: list };
  },
  { immediate: true }
);
onUnmounted(() => {
  if (!props.deadline) {
    instantSummary.fastest = null;
    instantSummary.listed = [];
  }
});

/**
 * The key the whole answer is saved under (search/instantSnapshot.ts `instantKey`, shared with My runs since 17 Oct
 * 2026: the same hash as before, so answers saved in players' browsers keep matching). Valid only for the same thing
 * asked of the same account: the player, the mode (target, or the date), the TE and every egg's count (a new save
 * moves them), the inventory and epic research, and the setup (playing hours, time off, dates to hit, the continue
 * rule, the filters). Not the plan start: the saved answer's note says which start its dates are for.
 */
function cacheKey(): string | null {
  const inputs = store.collectInputs();
  const raw = inputs.context.rawBackup as { eiUserId?: string } | undefined;
  if (!raw?.eiUserId) return null;
  const inv = store.readInventory();
  return instantKey({
    playerId: raw.eiUserId,
    deadline: props.deadline,
    finalTE: store.finalTE,
    currentTE: store.currentTE,
    eggsDelivered: inputs.baseState.eggsDelivered,
    artifacts: inv.artifacts,
    stones: inv.stones,
    epic: inputs.context.epicResearchLevels,
    availability: store.availability,
    timeOff: store.timeOff,
    milestones: store.milestones,
    firstAscension: inputs.firstAscension,
    useHours: useHours.value,
    maxAscensions: filters.value.maxAscensions,
  });
}
/**
 * THE WHOLE ANSWER, saved when everything has finished (the background polish, the "Prestige by" line and
 * the nearest-tables line) and put back as it was on the next visit with the same key
 * (search/instantSnapshot.ts). It restores the same fields the computation sets, so everything that
 * reads them works unchanged: the searches' seeds (`instantRoutes`, `suggestedRoute`,
 * `suggestedCount`, by the watch below), By a date's box fill (`routes` emit) and Simulate this plan.
 *
 * `exact`, `dateExact` and `dateExactByK` were Check exactly's (gone since 23 Oct 2026): written empty, so My runs
 * reads every new snapshot as the instant answer's; an older snapshot's are never shown here.
 */
interface InstantSnapshot {
  v: 1;
  at: number;
  result: FoundRoutes;
  header: TableHeader | null;
  tableUrl: string;
  ownChanged: string;
  /** The gear rule `ownChanged` was worked out under (tableGear.ts GEAR_RULE); absent before it was kept. */
  gearRule?: number;
  ms: number | null;
  exact: Record<string, unknown>;
  dateExact: unknown;
  dateExactByK: Record<number, unknown>;
  answerStart: number;
  exactMs: number | null;
  gains: PolishGain[];
  bracket: { above: BracketSide | null; below: BracketSide | null } | null;
  /** The experimental "Prestige by" line, when it was worked out. */
  prestige?: { line: PrestigeLine; cutoff: Cutoff; record: PrestigeByRecord } | null;
  /** Which account, goal and save it is for (17 Oct 2026, for My runs; absent before). */
  meta?: SnapMeta;
  /** "What if you had maxed gear?", once worked out for this answer (MaxedWhatIf `result`). */
  whatIf?: SnapWhatIf | null;
  /** The last Fast, Exact or Custom result for this goal and save (lib/searchPlan.ts): My runs' Right now follows it
   *  when it is better than the instant answer (23 Oct 2026). */
  search?: SnapSearch | null;
}
let snapKey: string | null = null;
/** When the answer on screen was saved, while it is a saved one (not worked out in this visit). */
const savedAt = ref<number | null>(null);
function saveSnapshot(id: number): void {
  if (id !== runs || !snapKey || !result.value || status.value !== 'done') return;
  if (backgroundStatus.value === 'running' || bracketStatus.value === 'running') return;
  if (prestigeStatus.value === 'running') return;
  const snap = currentSnapshot();
  if (snap) writeSnapshot(snapKey, snap);
  // The player's instant baseline for this goal and save (lib/instantBaseline.ts): My runs compares each run with it.
  const base = snap ? baselineOfSnapshot(snap) : null;
  if (base) recordBaseline(base);
}
/** The answer on screen as a snapshot: plain copies, without the finder's spare routes (only for the
 *  polish). Null with no answer. */
function currentSnapshot(): InstantSnapshot | null {
  if (!result.value) return null;
  const slim: FoundRoutes = { ...JSON.parse(JSON.stringify(result.value)) };
  delete slim.alternatives;
  delete slim.dateAlternatives;
  return JSON.parse(
    JSON.stringify({
      v: 1,
      at: Date.now(),
      result: slim,
      header: header.value,
      tableUrl: tableUrl.value,
      ownChanged: ownChanged.value,
      gearRule: GEAR_RULE,
      ms: ms.value,
      exact: {},
      dateExact: null,
      dateExactByK: {},
      answerStart: answerStart.value,
      exactMs: null,
      gains: gains.value,
      bracket: bracket.value,
      prestige: prestige.value,
      meta: snapMeta(),
      whatIf: whatIfResult.value,
      search: newerSearch(keptSearch.value, searchFound.value),
    })
  ) as InstantSnapshot;
}
/** What My runs reads to find this answer again from a newer save (search/instantSnapshot.ts SnapMeta). */
function snapMeta(): SnapMeta | undefined {
  const raw = initialState.rawBackup;
  const account = accountOf(raw);
  if (!account) return undefined;
  const earned = initialState.initialTeEarned;
  const delivered = initialState.initialEggsDelivered;
  const order = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const;
  return {
    account,
    goal: instantGoal(props.deadline, store.finalTE),
    backupTime: initialState.lastBackupTime,
    teByEgg: order.map(e => Math.max(earned?.[e] ?? 0, countTEThresholdsPassed(delivered?.[e] ?? 0))),
    // The hours and time off: the key holds them, so these are this snapshot's.
    setup: {
      availability: store.availability ? JSON.parse(JSON.stringify(store.availability)) : null,
      timeOff: JSON.parse(JSON.stringify(store.timeOff)),
    },
  };
}
/** The maxed what-if worked out for the answer on screen (kept with its snapshot; cleared with a new answer). */
const whatIfResult = ref<SnapWhatIf | null>(null);
function onWhatIf(r: SnapWhatIf): void {
  whatIfResult.value = r;
  // Already saved (the usual case: the line is opened after everything finished): kept with it. Not saved yet:
  // it goes in with the answer (`currentSnapshot`).
  patchSnapshot(snapKey, { whatIf: r });
}
// The answer on screen when the panel closes, for a panel opened again during a search (run's wait).
onUnmounted(() => {
  if (status.value === 'done' && snapKey) rememberShown(snapKey, currentSnapshot());
});
function restoreSnapshot(): boolean {
  const s = readSnapshot<InstantSnapshot>(snapKey);
  if (!s || s.v !== 1 || !s.result || !s.header || !snapshotUsable(s, GEAR_RULE)) return false;
  applySnapshot(s);
  return true;
}
function applySnapshot(s: InstantSnapshot): void {
  header.value = s.header;
  tableUrl.value = s.tableUrl;
  ownChanged.value = s.ownChanged;
  restoredAt = typeof s.at === 'number' ? s.at : null;
  result.value = s.result;
  ms.value = s.ms;
  answerStart.value = s.answerStart;
  gains.value = s.gains;
  bracket.value = s.bracket;
  prestige.value = s.prestige ?? null;
  whatIfResult.value = s.whatIf ?? null;
  keptSearch.value = readSearch(s.search);
  prestigeStatus.value = s.prestige ? 'done' : 'idle';
  bracketStatus.value = 'done';
  backgroundStatus.value = 'done';
  status.value = 'done';
  noTable.value = false;
  below.value = null;
  savedAt.value = s.at;
  if (props.deadline) emitRoutes(s.result);
}

// Again whenever what it depends on changes (a new save, a new plan start, another target).
let timer: ReturnType<typeof setTimeout> | null = null;
/** A run is due once the inputs settle (`timer`): the answer on screen is for the inputs before. */
const runDue = ref(false);
/** The answer on screen was worked out before the save now loading was set up (`waitForSave` below). */
const resultFromBefore = ref(false);
watch(
  () =>
    answerInputsKey([
      Math.floor(store.currentTE),
      store.planStart,
      target.value,
      props.deadline,
      store.firstAscension,
      bonus.value,
      useHours.value ? availabilityKey(store.availability) : '',
      filters.value.maxAscensions,
      // Your setup, remembered per account, still loading (stores/chainSearch.ts `loadSetupFor`): wait for
      // it, so a reload doesn't work the answer out on the defaults first.
      store.setupLoaded,
      // The save for the account on screen not set up yet (search/startProvenance.ts): wait, and run again
      // the moment it is.
      store.startWait,
    ]),
  () => {
    if (timer) clearTimeout(timer);
    if (store.startWait) {
      waitForSave();
      return;
    }
    if (!store.setupLoaded) return;
    // (Your setup still loading reads as loading by itself: `instantState`.)
    runDue.value = true;
    timer = setTimeout(() => {
      runDue.value = false;
      void run();
    }, 300);
  },
  { immediate: true }
);
onUnmounted(() => timer && clearTimeout(timer));

/**
 * WAITING FOR THE SAVE (22 Oct 2026, Allan's "36 h faster"). On a fresh load the stores hold the Manual
 * planner's restored draft, and after an account switch the claimed-only TE, until the save is set up the
 * Auto Planner's way; an answer worked out then is for a different start (235 TE against 234, another
 * route). So nothing is worked out until `store.startWait` clears (the watch above runs it then), and
 * whatever was in flight is dropped. An answer already on screen stays, labelled `START_WAIT_LABEL`, until
 * the new one replaces it.
 */
function waitForSave(): void {
  runDue.value = false;
  ++runs;
  ++bracketRuns;
  ++prestigeRuns;
  prestigeLater = false;
  afterRun = null;
  afterPrestige = null;
  if (backgroundStatus.value === 'running') backgroundStatus.value = 'idle';
  if (bracketStatus.value === 'running') bracketStatus.value = 'idle';
  if (prestigeStatus.value === 'running') prestigeStatus.value = 'idle';
  if (status.value === 'loading') status.value = result.value ? 'done' : 'idle';
  if (result.value) resultFromBefore.value = true;
}
// A new answer (or none) replaces the one from before; a saved answer put back is for the save now loaded.
watch(result, () => {
  if (!store.startWait) resultFromBefore.value = false;
});
/** The waiting line ('' when not waiting). */
const saveWaitText = computed(() => startWaitText(store.startWait));

/** By a date: the answer still being worked out (or about to be, or Your setup still loading), in with a
 *  route, or settled with none, for the panel's Find (`state` event). */
const instantState = computed<InstantState>(() => {
  if (runDue.value || !store.setupLoaded || store.startWait || status.value === 'loading') return 'loading';
  return status.value === 'done' && result.value ? 'answer' : 'none';
});
watch(instantState, s => emit('state', s), { immediate: true });
watch(noTable, u => emit('unloaded', u));

const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
function show(unix: number): string {
  return showDateTime(unix, zone.value);
}
function days(seconds: number): string {
  return (seconds / 86400).toFixed(2) + ' days';
}

/**
 * THE SEARCH RESULT FOR THIS GOAL (Jordan, 23 Oct 2026): a finished Fast, Exact or Custom result for the same goal,
 * on this save and account (lib/searchPlan.ts `liveSearchResult`, the rule My runs' Right now reads too). The instant
 * card only points to it (`pointer`); "Share this result" sends it with the instant answer (below). Fastest: the
 * chain search's best once it stops (its kind and effort say the level); By a date: the date search's result for this
 * deadline, started from the TE the save has now. A running search's best so far is not a result yet. It is kept in
 * the snapshot (`search`) for My runs.
 */
type SearchFound = SnapSearch;
/** The result kept with the snapshot on screen (a restored one's), until a newer one is found. */
const keptSearch = ref<SnapSearch | null>(null);
/** A result tagged for another account than the one loaded is not this save's. Unknown on either side: it is. */
function ownerMatches(owner: string): boolean {
  const me = initialState.playerId ? accountHashNow(initialState.playerId) : '';
  return !owner || !me || owner === me;
}
const searchFound = computed<SearchFound | null>(() =>
  liveSearchResult({
    goal: props.deadline ? 'date' : 'fastest',
    deadline: props.deadline ?? null,
    target: store.finalTE,
    currentTE: store.currentTE,
    ownerOk: ownerMatches,
    fastest: {
      running: store.isRunning,
      bestDays: store.bestDays,
      bestChain: store.bestChain,
      bestLegs: store.bestLegs,
      planStart: store.planStartUsed || store.planStart,
      custom: store.runKindUsed === 'full',
      effort: store.runSettingsUsed?.effort,
      at: store.chainResultAt,
      owner: store.chainResultOwner,
    },
    date: { running: store.deadlineRunning, result: store.deadlineResult, owner: store.deadlineResultOwner },
  })
);
// Kept with the snapshot as it lands, so My runs' Right now finds it (the snapshot is saved before a search ends),
// and kept beyond the snapshot's day for this save (lib/searchPlan.ts `recordKeptSearch`).
watch(searchFound, f => {
  if (!f) return;
  const meta = snapMeta();
  if (meta) recordKeptSearch({ account: meta.account, goal: meta.goal, backupTime: meta.backupTime, setup: meta.setup, teByEgg: meta.teByEgg, search: f });
  if (status.value !== 'done' || !snapKey) return;
  if (keptSearch.value && keptSearch.value.at >= f.at) return;
  keptSearch.value = f;
  patchSnapshot(snapKey, { search: JSON.parse(JSON.stringify(f)) });
});
/** "Fast found 312 TE on your account." (lib/searchPointer.ts), or null. */
const pointer = computed(() => pointerOf(props.deadline ? 'date' : 'fastest', searchFound.value, show));
/** "See it ↓": the part of the search panel that holds the result, shown, then scrolled to its result card. */
function seeResult(): void {
  const f = searchFound.value;
  if (!f) return;
  const screen: SearchTabScreen = props.deadline ? 'by-date' : 'fastest';
  const tab = f.level === 'Custom' ? 'exhaustive' : 'nearby';
  selectSearchTab(screen, tab);
  void nextTick(() => {
    const panel = document.getElementById(`search-panel-${screen}-${tab}`);
    const card = panel?.querySelector('[data-result-card]') ?? panel;
    card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/**
 * "SHARE THIS RESULT" (opt-in; search/instantRecord.ts). Was "Share this check", sent when Check exactly finished; since
 * 23 Oct 2026 it sends the search result above (Fast, Exact or Custom) beside the instant answer for the same goal, to
 * the collector, privately (never the player id, never on the board): `exact` is the search's best route, leg by leg,
 * `exactFrom` which search found it, and the rows are the instant answer's only. "Share my search results" (the
 * account's `keepSharingChecks` consent, the same setting as Your setup › Sharing) ticks it for every result found
 * in this visit; a result opened from before is sent only when ticked by hand. At most one per save, mode and target an
 * hour, and never the same one twice.
 */
const share = useInstantShare();
/** "Share my search results": the account's consent itself (composables/useConsent.ts). */
const keepSharing = share.on;
const initialState = useInitialStateStore();
const instantUrl = instantUrlOf(store.submitUrl);
const SHARE_WHAT =
  "Sends this search result's route and times, the instant answer's for the same goal, your TE and Clothed TE, a summary " +
  'of your gear, your plan start, timezone, save time and settings, where your save was loaded from (its claimed and ' +
  'pending TE, eggs and a short code for the save), with an anonymous code for your account. Never your player ID or ' +
  'your save; never shown on the board.';
/** The gear stamp's hash (the 24 hex of `legacyGearTableName`), worked out with the instant answer. */
const stampHash = ref('');
/** Share the result on screen. Ticked for a result found in this visit with "Share my search results" on. */
const shareThis = ref(false);
/** What the last share did, for the line beside the boxes. */
const shareNote = ref<(InstantSendOutcome & { at: number }) | null>(null);
/** The result `shareThis` and `shareNote` are about, and the one last sent (or tried). */
const resultKey = computed(() => {
  const f = searchFound.value;
  return f ? `${f.level}|${f.at}|${key(f.chain)}` : '';
});
let shownKey = '';
let sentKey = '';
/** Found in this visit (a run that ended here), not a result opened from before. */
const freshResult = (): boolean => (searchFound.value?.at ?? 0) >= (pageOpenedMs() ?? 0);
watch(
  resultKey,
  k => {
    if (k === shownKey) return;
    shownKey = k;
    shareNote.value = null;
    shareThis.value = !!k && share.on.value && freshResult();
  },
  { immediate: true }
);
// "Share my search results" ticked: this result goes too (if found in this visit). Withdrawn: nor does this one.
watch(
  () => share.on.value,
  v => {
    shareThis.value = v && freshResult();
  }
);
watch(
  () => [shareThis.value, resultKey.value, status.value] as const,
  ([on, k, st]) => {
    if (on && k && st === 'done' && k !== sentKey) void shareResult(k);
  },
  { immediate: true }
);

/** "11:02 am", in the plan's timezone. */
function clock(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone.value })
      .format(new Date(ms))
      .replace(/\s?([AP])\.?M\.?$/i, (_m, x: string) => ` ${x.toLowerCase()}m`);
  } catch {
    return new Date(ms).toLocaleTimeString();
  }
}

const shareText = computed(() => {
  const n = shareNote.value;
  if (!n) return '';
  if (n.result === 'sent') return `Shared ${clock(n.at)}`;
  switch (n.why) {
    case 'same':
      return 'Already shared.';
    case 'hourly':
      return `Couldn't share: one result per save and goal an hour${n.nextAt ? `; try after ${clock(n.nextAt)}` : ''}.`;
    case 'server':
      return `Couldn't share: the server said no${n.status ? ` (${n.status})` : ''}.`;
    case 'network':
      return "Couldn't share: no connection to the server.";
    case 'too-big':
      return "Couldn't share: this result is too big to send.";
    default:
      return "Couldn't share this result.";
  }
});

const round = (x: number, d: number) => Number(x.toFixed(d)) + 0;

/** The record for the instant answer on screen and the search result `f`; null with no instant answer. */
function buildRecord(f: SearchFound): InstantRecord | null {
  const found = result.value;
  if (!found) return null;
  const deadline = props.deadline;
  const pick = deadline ? found.byDate : found.best;
  if (!pick) return null;
  const inputs = store.collectInputs();
  const planStart = f.planStart || answerStart.value || inputs.planStart;
  const backupTime = (initialState.rawBackup as { approxTime?: number } | null)?.approxTime;
  const endTE = (r: Route) => round(r.legs[r.legs.length - 1].endTE, 2);
  const exLegs = f.legs;
  const parts = store.cteParts();
  const wait = store.integrityWait;
  let contPeak: number | null = null;
  try {
    contPeak = continueTailParams(inputs, planStart)?.peakELR ?? null;
  } catch {
    contPeak = null;
  }
  const b = bracket.value;
  const side = (x: BracketSide | null) =>
    x
      ? {
          gear: `${x.entry.file} ${x.entry.bonus.toFixed(1)}/${x.entry.k.toFixed(3)}`.slice(0, 120),
          end: x.end ? Math.round(x.end) : null,
          te: x.te,
        }
      : null;
  const spareH = (end: number) => round(((deadline ?? 0) - end) / 3600, 2);
  const rowsOut = (deadline ? dateRows.value : rows.value).map(r => ({
    n: r.legs.length,
    chain: [...r.chain],
    iEnd: Math.round(r.end),
    ...(deadline ? { iTE: endTE(r) } : {}),
  }));
  const gap = buildGapOf(contPeak, exLegs);
  const build = appBuildId();
  // Where the save on screen was loaded from, with the tab's age now (search/startProvenance.ts).
  const start = finishStartProvenance(store.startProvenanceNow(), {
    now: Date.now(),
    builtAt: buildTimeMs(),
    openedAt: pageOpenedMs(),
  });
  return {
    v: 1,
    ...(build ? { build } : {}),
    simVersion: SIM_VERSION,
    mode: deadline ? 'date' : 'fastest',
    ...(deadline ? { deadline: Math.round(deadline) } : { target: store.finalTE }),
    planStart: Math.round(planStart),
    timezone: zone.value,
    ...(start ? { start } : {}),
    ...(backupTime
      ? { backupTime: Math.round(backupTime), backupAgeHours: round((planStart - backupTime) / 3600, 1) }
      : {}),
    currentTE: Math.floor(store.currentTE),
    ...(initialState.rawBackup ? { backupTE: round(store.backupTE, 2) } : {}),
    ...(parts ? { clothedTE: round(parts.total, 2) } : {}),
    gear: {
      answer: answerTable.value,
      ...(stampHash.value ? { stamp: stampHash.value } : {}),
      ...(ownChanged.value ? { ownChanged: ownChanged.value.slice(0, 80) } : {}),
      earningsShort: round(bonusShort.value, 2),
      ...(deliveryScale.value !== null ? { deliveryScale: round(deliveryScale.value, 4) } : {}),
      adjusted: gearDiffers.value,
      progressionShort: !!progressionShort.value,
      ...(header.value ? { tableFrom: header.value.from, tableSim: header.value.simVersion ?? null } : {}),
      ...(header.value?.gearTo ? { gearTo: header.value.gearTo } : {}),
      ...(b ? { bracket: { above: side(b.above), below: side(b.below) } } : {}),
    },
    stall: {
      ...(parts ? { cte: round(parts.total, 2), belowLine: parts.total < CTE_CLEARS } : {}),
      clears: CTE_CLEARS,
      integrityHours: wait === null ? null : round(wait / 3600, 2),
      notice:
        wait === null
          ? 'unknown'
          : wait > INTEGRITY_BLOCK_SECONDS
            ? 'blocked'
            : wait > INTEGRITY_WARN_SECONDS
              ? 'stalls'
              : 'none',
    },
    settings: {
      firstAscension: store.firstAscension,
      maxAscensions: filters.value.maxAscensions,
      inHours: useHours.value,
      window: store.scheduleEnabled && store.availability ? describeAvailability(store.availability) : null,
      holdShifts: !!store.deferShifts,
      timeOff: store.timeOff.length,
      milestones: store.milestones.length,
      small,
    },
    instant: {
      chain: [...pick.chain],
      end: Math.round(pick.end),
      endTE: endTE(pick),
      ...(deadline ? { spareHours: spareH(pick.end) } : {}),
      legs: instantLegs(pick),
    },
    rows: rowsOut,
    exact: {
      chain: [...f.chain],
      end: Math.round(f.end),
      endTE: round(exLegs.length ? exLegs[exLegs.length - 1].endTE : f.endTE, 2),
      ...(deadline ? { spareHours: spareH(f.end) } : {}),
      ...firstLegOf(exLegs),
      legs: exactLegs(exLegs),
    },
    exactFrom: f.level === 'Fast' ? 'fast' : f.level === 'Exact' ? 'exact' : 'custom',
    ...(gap ? { buildGap: gap } : {}),
  };
}

function shareStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The record with the gear stamp worked out for a saved answer put back (none was worked out with it). */
async function recordOf(f: SearchFound): Promise<InstantRecord | null> {
  const record = buildRecord(f);
  if (!record) return null;
  // A saved answer put back has no stamp worked out: the maxed instant answer's research gives the same one.
  if (!record.gear.stamp && record.gear.answer === 'maxed' && header.value?.k3) {
    try {
      const stamp = gearStamp(store.collectInputs(), store.readInventory().earnings, header.value.k3.research);
      if (stamp) record.gear.stamp = (await legacyGearTableName(stamp)).replace(/^gear-|\.bin$/g, '');
    } catch {
      /* sent without it */
    }
  }
  return record;
}

/**
 * The record with the "Prestige by" prediction added, when the player turned the line on and chose to
 * keep it in shared results (only shared results get here). A line still being worked out is waited for,
 * up to a minute.
 */
async function withPrestigeBy(record: InstantRecord): Promise<InstantRecord> {
  const flag = { enabled: prestigeFlag.enabled.value, record: prestigeFlag.record.value };
  if (!recordsPrestigeBy(flag, true)) return record;
  if (prestigeStatus.value === 'running' && prestigeDone)
    await Promise.race([prestigeDone, new Promise(r => setTimeout(r, 60000))]);
  return prestige.value ? { ...record, prestigeBy: prestige.value.record } : record;
}

/** Send the result `k` (the one on screen) with the instant answer. Never throws; tried once per result. */
async function shareResult(k: string): Promise<void> {
  const f = searchFound.value;
  if (!instantUrl || store.startWait || !f || resultKey.value !== k) return;
  sentKey = k;
  const record = await recordOf(f);
  if (!record || resultKey.value !== k) return;
  const partition = await store.accountPartition();
  const owner = partition ? ownerToken(partition) : null;
  const out = await sendInstantRecordWhy({
    url: instantUrl,
    owner,
    partition,
    record: await withPrestigeBy(record),
    storage: shareStorage(),
  });
  if (resultKey.value !== k) return;
  shareNote.value = { ...out, at: Date.now() };
}
</script>

<style scoped>
/*
 * The counts list on a phone (wireframes/price-route-v2 v1, 23 Oct 2026): below 30rem each count is one stacked row,
 * the number of ascensions on the left and its TE and spare (or finish), when, and the route with its buttons
 * under each other on the right; nothing scrolls sideways. From 30rem up it is the table.
 */
@media (max-width: 29.99rem) {
  .counts-stack thead {
    display: none;
  }
  .counts-stack,
  .counts-stack tbody {
    display: block;
  }
  .counts-stack tr {
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr);
    column-gap: 0.5rem;
    padding-block: 0.5rem;
  }
  .counts-stack td {
    display: block;
    grid-column: 2;
    padding: 0;
  }
  .counts-stack td:first-child {
    grid-column: 1;
    grid-row: 1 / span 3;
  }
}
</style>
