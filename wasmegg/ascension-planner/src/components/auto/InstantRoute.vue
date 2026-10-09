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
    - other gear: the table's account is maxed (perfect delivery, Clothed TE bonus 128.71); a player's
      waits run at their own peak delivery rate, and their builds are the table's for their own TE (a
      weaker earnings set is not taken off; the page says so when it is).
  What it leaves out: playing hours, time off and dated milestones (said beside the result), and the
  history of how a player reached each TE (shown to barely matter on the board). "Check exactly" hands
  any route to the Full sweep, which prices it with the full simulator.
-->
<template>
  <section v-if="!noTable" class="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-base font-black text-slate-900">
        Instant answer
        <span
          class="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-widest"
          >precomputed</span
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
    <p class="text-[12px] text-slate-600 leading-relaxed">
      Every ascension {{ own ? 'your account can make, with the gear your save has now,' : 'a maxed account can make' }}
      was simulated ahead of time, from every TE at every hour of the week, so
      {{
        deadline
          ? 'finding the highest TE you can reach by the date is arithmetic'
          : 'finding your fastest route is arithmetic'
      }}: it tries every checkpoint at every TE, with any number of ascensions.{{
        own ? ' The instant answer was built on your own gear.' : " It's adjusted for your gear."
      }}
      <b>Check exactly</b> prices a route with the full simulator.
    </p>
    <p v-if="ownChanged" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
      Your gear changed since your instant answer was made ({{ ownChanged }}), so this answer uses the instant answer for fully maxed gear instead.
    </p>

    <p v-if="status === 'loading'" class="text-[12px] text-slate-500 flex items-center gap-2">
      <span class="inline-block w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      {{ loadingText }}
    </p>
    <p
      v-else-if="status === 'error'"
      class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900"
    >
      {{ errorText }}
    </p>

    <p
      v-if="header?.fake"
      class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] font-bold text-rose-800"
    >
      Test instant answer: rows below what has been simulated are filled in from the nearest real ones, to try the page. These
      routes and dates are not real answers.
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
        @click="run(true)"
      >
        Work it out again
      </button>
    </p>
    <p
      v-if="waiting && !result"
      class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 flex flex-wrap items-center gap-x-3"
      data-testid="instant-waits"
    >
      <span>A search is running, so the instant answer waits to save memory.</span>
      <button
        type="button"
        class="font-black uppercase tracking-widest text-[10px] text-amber-900 underline"
        @click="run(false, true)"
      >
        Work it out anyway
      </button>
    </p>
    <!-- The last checked answer for this save and setup, at once; then whether the new check beat it. -->
    <p
      v-if="cached && exactStatus !== 'done'"
      class="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-700"
    >
      <b>Last checked {{ show(cached.at / 1000) }}</b> (exact, your account):
      <span class="font-mono-premium">{{ cached.chain.join(' → ') }}</span>
      <template v-if="deadline"> · {{ cached.endTE }} TE · {{ days(deadline - cached.end) }} to spare</template>
      <template v-else> · reaches {{ store.finalTE }} on {{ show(cached.end) }}</template
      >. Checking again…
    </p>
    <p
      v-if="sinceCache"
      class="rounded-lg px-3 py-2 text-[12px] font-bold"
      :class="
        sinceCache.better ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-50 border border-slate-200 text-slate-700'
      "
    >
      {{ sinceCache.text }}
    </p>

    <!-- The filters (remembered in this browser): the routes and the headline come from what is left. -->
    <div v-if="result" class="space-y-1">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <label v-if="hoursOn" class="flex items-center gap-2 cursor-pointer">
          <input v-model="filters.inHours" type="checkbox" class="rounded border-slate-300" />
          Works inside my hours
        </label>
        <label class="flex items-center gap-2">
          At most
          <select v-model="filters.maxAscensions" class="rounded-lg border-slate-200 text-[11px] py-0.5 pl-2 pr-7">
            <option :value="null">any number of</option>
            <option v-for="n in MAX_ASCENSIONS" :key="n" :value="n">{{ n }}</option>
          </select>
          ascensions
        </label>
      </div>
      <p v-if="useHours" class="text-[11px] text-slate-500">
        Only routes where you ascend inside your hours each time. The exact check prices it with your hours, so TE keeps
        collecting while you wait.
      </p>
      <p v-if="outOfHoursShown.length" class="text-[11px] text-amber-800">
        No route with {{ countList(outOfHoursShown) }} ascensions keeps every prestige inside your hours.
      </p>
      <p v-if="backgroundStatus === 'running'" class="text-[11px] text-slate-400">
        Polishing the routes in the background…
      </p>
      <p v-else-if="gainsText" class="text-[11px] text-emerald-800">
        Improved by the background polish: {{ gainsText }}.
      </p>
      <p v-if="bracketStatus === 'running'" class="text-[11px] text-slate-400">
        Pricing your route on the instant answers for the closest stronger and weaker gear we have…
      </p>
      <p v-else-if="bracketText" class="text-[11px] text-slate-700">{{ bracketText }}</p>
    </div>

    <template v-if="result && deadline">
      <div class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1">
        <div class="text-[10px] font-black uppercase tracking-widest text-emerald-700">
          Highest TE by {{ show(deadline) }}
        </div>
        <template v-if="result.byDate">
          <!-- The simulator's answer leads once it is in; the table's stays beside it. -->
          <div class="flex flex-wrap items-baseline gap-x-3">
            <span class="text-2xl font-black text-slate-900"
              >{{ (dateExact ?? tableDate(result.byDate)).endTE }} TE</span
            >
            <span
              class="text-lg font-black"
              :class="
                spareOf(dateExact ?? tableDate(result.byDate)) < TIGHT_SECONDS ? 'text-amber-700' : 'text-emerald-800'
              "
              >{{ days(spareOf(dateExact ?? tableDate(result.byDate))) }} to spare</span
            >
            <span
              v-if="spareOf(dateExact ?? tableDate(result.byDate)) < TIGHT_SECONDS"
              class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-widest"
              >tight</span
            >
            <span v-if="dateExact" class="text-[11px] font-bold text-emerald-700">exact, your account</span>
          </div>
          <div class="font-mono-premium text-sm font-bold text-slate-800">
            {{ (dateExact ?? tableDate(result.byDate)).chain.join(' → ') }}
          </div>
          <div class="text-[12px] text-slate-700">
            Reached {{ show((dateExact ?? tableDate(result.byDate)).end) }} ·
            {{ (dateExact ?? tableDate(result.byDate)).chain.length }} ascensions
          </div>
          <p class="text-[11px] text-slate-600">
            Ascend at the times shown: each fresh ascension starts on the hour (inside the weekly research sale, at once
            when that ends sooner), and Check exactly prices it the same way.
          </p>
          <label class="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
            <input v-model="tryAtOnce" type="checkbox" class="rounded border-slate-300" />
            Also try ascending the moment each ascension ends, not only on the hour (slower check)
          </label>
          <p v-if="atOnceNote(dateExact)" class="text-[11px] font-bold text-emerald-800">{{ atOnceNote(dateExact) }}</p>
          <div v-if="dateExact" class="text-[11px] text-slate-500">
            The instant answer said {{ result.byDate.legs[result.byDate.legs.length - 1].endTE }} TE via
            {{ result.byDate.chain.join(' ') }} with {{ days(deadline - result.byDate.end) }} to spare<template
              v-if="missedBy !== null"
              >; on your account that route arrives {{ days(missedBy) }} after the date</template
            >.
          </div>
          <p v-if="exactStatus === 'running'" class="text-[11px] text-emerald-800 flex items-center gap-2">
            <span
              class="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"
            />
            {{ exactText }}
          </p>
          <p v-else-if="exactStatus === 'done' && !dateExact" class="text-[11px] text-amber-800">
            On your account none of these routes reaches above your TE by the date. Check exactly searches for yours.
          </p>
          <p v-if="small && exactStatus === 'idle'" class="text-[11px] text-slate-500">
            On this device the full simulator's check runs only when you press Check exactly: it uses every core for a
            minute or more.
          </p>
          <button
            type="button"
            :class="
              exactStatus === 'running'
                ? 'opacity-60 cursor-not-allowed hover:bg-emerald-700'
                : 'hover:bg-emerald-800'
            "
            class="mt-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5"
            :disabled="exactStatus === 'running'"
            title="Prices every route below with the full simulator on your account"
            @click="checkAgain()"
          >
            <span
              v-if="exactStatus === 'running'"
              class="inline-block w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin"
            />
            {{ exactStatus === 'running' ? 'Checking exactly…' : exactStatus === 'done' ? 'Check all again' : 'Check exactly' }}
          </button>
          <button
            type="button"
            class="mt-1 ml-2 px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50"
            title="Opens this route in Your plan, simulated step by step on your save"
            @click="openPlan((dateExact ?? tableDate(result.byDate)).chain)"
          >
            Simulate this plan
          </button>
        </template>
        <p v-else class="text-[12px] text-amber-800">
          No route gets above your TE by then{{ filtering ? ' with these filters' : '' }}.
        </p>
      </div>
      <div v-if="dateRows.length > 1" class="overflow-x-auto">
        <p class="text-[11px] text-slate-500">
          Exact = the full simulator on your account; filled in automatically. Simulate this plan opens that route in
          Your plan, simulated step by step on your save: each ascension, its dates and purchases.
        </p>
        <table class="w-full text-[12px]">
          <thead>
            <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
              <th class="py-1 pr-3">Ascensions</th>
              <th class="py-1 pr-3">Instant answer</th>
              <th class="py-1 pr-3">Exact, your account</th>
              <th class="py-1 pr-3">Spare</th>
              <th class="py-1 pr-3">Route</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in dateRows"
              :key="r.legs.length"
              class="border-t border-slate-100"
              :class="dateExact && dateExactByK[r.legs.length]?.chain === dateExact.chain ? 'bg-emerald-50/60' : ''"
            >
              <td class="py-1.5 pr-3 font-bold text-slate-800">{{ r.legs.length }}</td>
              <td class="py-1.5 pr-3 text-slate-600 whitespace-nowrap">
                {{ r.legs[r.legs.length - 1].endTE }} TE · {{ days(deadline - r.end) }}
              </td>
              <td class="py-1.5 pr-3 whitespace-nowrap font-bold text-slate-800">
                <template v-if="dateExactByK[r.legs.length]">{{ dateExactByK[r.legs.length]!.endTE }} TE</template>
                <template v-else-if="dateExactByK[r.legs.length] === null">misses</template>
                <span v-else-if="exactStatus === 'running'" class="text-slate-400 font-normal">…</span>
              </td>
              <td class="py-1.5 pr-3 whitespace-nowrap">
                <template v-if="dateExactByK[r.legs.length]">
                  <span
                    :class="
                      spareOf(dateExactByK[r.legs.length]!) < TIGHT_SECONDS
                        ? 'text-amber-700 font-black'
                        : 'text-emerald-800 font-bold'
                    "
                    >{{ days(spareOf(dateExactByK[r.legs.length]!)) }}</span
                  >
                  <span
                    v-if="spareOf(dateExactByK[r.legs.length]!) < TIGHT_SECONDS"
                    class="ml-1 px-1 py-0.5 rounded bg-amber-100 text-amber-800 text-[8px] font-black uppercase"
                    >tight</span
                  >
                </template>
              </td>
              <td class="py-1.5 pr-3 font-mono-premium text-slate-800">
                {{ (dateExactByK[r.legs.length] ?? tableDate(r)).chain.join(' ') }}
              </td>
              <td class="py-1.5 text-right">
                <button
                  type="button"
                  class="px-2 py-1 rounded-md border border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-800"
                  title="Opens this route in Your plan, simulated step by step on your save"
                  @click="openPlan((dateExactByK[r.legs.length] ?? tableDate(r)).chain)"
                >
                  Simulate this plan
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="result && !deadline">
      <div v-if="lead" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1">
        <div class="text-[10px] font-black uppercase tracking-widest text-emerald-700">Fastest route</div>
        <div class="font-mono-premium text-base font-black text-slate-900">{{ lead.chain.join(' → ') }}</div>
        <div v-if="exactOf(lead)" class="text-[12px] text-slate-800">
          Reaches {{ store.finalTE }} on <b>{{ show(exactOf(lead)!.end) }}</b> · {{ days(exactOf(lead)!.seconds) }} ·
          {{ lead.legs.length }} ascensions
          <span class="text-[11px] font-bold text-emerald-700">exact, your account</span>
        </div>
        <div :class="exactOf(lead) ? 'text-[11px] text-slate-500' : 'text-[12px] text-slate-700'">
          {{ exactOf(lead) ? 'The instant answer said ' : 'Reaches ' + store.finalTE + ' on '
          }}<b v-if="!exactOf(lead)">{{ show(lead.end) }}</b
          ><template v-else>{{ show(lead.end) }}</template> · {{ days(lead.seconds)
          }}<template v-if="!exactOf(lead)"> · {{ lead.legs.length }} ascensions</template>
        </div>
        <p class="text-[11px] text-slate-600">
          Ascend at the times shown: each fresh ascension starts on the hour (inside the weekly research sale, at once
          when that ends sooner), and Check exactly prices it the same way.
        </p>
        <label class="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
          <input v-model="tryAtOnce" type="checkbox" class="rounded border-slate-300" />
          Also try ascending the moment each ascension ends, not only on the hour (slower check)
        </label>
        <p v-if="atOnceNote(exactOf(lead))" class="text-[11px] font-bold text-emerald-800">
          {{ atOnceNote(exactOf(lead)) }}
        </p>
        <p v-if="reranked && result.best" class="text-[11px] text-amber-800">
          The instant answer ranked the {{ result.best.legs.length }}-ascension route first ({{ result.best.chain.join(' ') }});
          on your account the full simulator has this one
          {{ days(exactOf(result.best)!.end - exactOf(lead)!.end) }} sooner.
        </p>
        <p v-if="exactStatus === 'running'" class="text-[11px] text-emerald-800 flex items-center gap-2">
          <span
            class="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"
          />
          {{ exactText }}
        </p>
        <p v-if="small && exactStatus === 'idle'" class="text-[11px] text-slate-500">
          On this device the full simulator's check runs only when you press Check exactly: it uses every core for a
          minute or more.
        </p>
        <button
          type="button"
          :class="
              exactStatus === 'running'
                ? 'opacity-60 cursor-not-allowed hover:bg-emerald-700'
                : 'hover:bg-emerald-800'
            "
            class="mt-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5"
          :disabled="exactStatus === 'running'"
          title="Prices every route below with the full simulator on your account"
          @click="checkAgain()"
        >
          <span
              v-if="exactStatus === 'running'"
              class="inline-block w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin"
            />
            {{ exactStatus === 'running' ? 'Checking exactly…' : exactStatus === 'done' ? 'Check all again' : 'Check exactly' }}
        </button>
        <button
          type="button"
          class="mt-1 ml-2 px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50"
          title="Opens this route in Your plan, simulated step by step on your save"
          @click="openPlan(lead.chain)"
        >
          Simulate this plan
        </button>
      </div>
      <p v-else class="text-[12px] text-amber-800">
        No route reaches {{ store.finalTE }} from here in the instant answer{{ filtering ? ' with these filters' : '' }}.
      </p>
    </template>

    <p v-if="result && exactStatus === 'error'" class="text-[11px] text-amber-800">{{ exactText }}</p>
    <p v-if="result && exactStatus === 'waiting'" class="text-[11px] text-slate-500">
      The exact check on your account waits while a search is running.
    </p>
    <p v-if="result && exactStatus === 'done' && exactMs !== null" class="text-[10px] text-slate-400">
      Checked on your account with the full simulator in {{ (exactMs / 1000).toFixed(0) }} s.
    </p>

    <!-- What the answer above does not account for, on both screens. -->
    <template v-if="result">
      <p v-if="gearDiffers" class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Your gear isn't the gear the instant answer was built on (<template v-if="bonusShort > 0.05"
          >earnings set {{ bonusShort.toFixed(2) }} Clothed TE short, </template
        >delivery {{ ((deliveryScale ?? 1) * 100).toFixed(1) }}% of its at full research). Ascensions that start below
        about TE {{ FULL_RESEARCH_TE }} can take a few percent more or less than these, and may need a longer build (one
        more research sale) than shown: your earnings set, and how your delivery gear does before research is complete,
        aren't fully taken off. From there up they match. Check exactly gives your own times.
      </p>
      <p
        v-if="progressionShort"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      >
        The account the instant answer was built on has every epic research and colleggtible maxed; yours has {{ progressionShort }}. Your real
        ascensions run slower than these, more so the further short you are. Check exactly gives your own times.
      </p>
      <p
        v-if="leftOut.length"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      >
        Not in the instant answer's routes: your {{ leftOut.join(', ') }}.
        {{ deadline ? '' : 'They are the fastest without them; ' }}the exact times on your account include them.
      </p>
    </template>

    <template v-if="result && !deadline">
      <div class="overflow-x-auto">
        <p class="text-[11px] text-slate-500">
          Exact = the full simulator on your account; filled in automatically. Simulate this plan opens that route in
          Your plan, simulated step by step on your save: each ascension, its dates and purchases.
        </p>
        <table class="w-full text-[12px]">
          <thead>
            <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
              <th class="py-1 pr-3">Ascensions</th>
              <th class="py-1 pr-3">Reaches {{ store.finalTE }}</th>
              <th class="py-1 pr-3">Behind</th>
              <th class="py-1 pr-3">Exact, your account</th>
              <th class="py-1 pr-3">Route</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.legs.length"
              class="border-t border-slate-100"
              :class="r === lead ? 'bg-emerald-50/60' : ''"
            >
              <td class="py-1.5 pr-3 font-bold text-slate-800">{{ r.legs.length }}</td>
              <td class="py-1.5 pr-3 text-slate-700 whitespace-nowrap">{{ show(r.end) }}</td>
              <td class="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
                {{ behind(r) }}
              </td>
              <td
                class="py-1.5 pr-3 whitespace-nowrap"
                :class="r === exactBest ? 'font-bold text-emerald-800' : 'text-slate-700'"
              >
                <template v-if="exactOf(r)">{{ show(exactOf(r)!.end) }} · {{ days(exactOf(r)!.seconds) }}</template>
                <template v-else-if="exactOf(r) === null">couldn’t price</template>
                <span v-else-if="exactStatus === 'running'" class="text-slate-400">…</span>
              </td>
              <td class="py-1.5 pr-3 font-mono-premium text-slate-800">{{ r.chain.join(' ') }}</td>
              <td class="py-1.5 text-right">
                <button
                  type="button"
                  class="px-2 py-1 rounded-md border border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-800"
                  :disabled="r.chain.length < 2"
                  title="Opens this route in Your plan, simulated step by step on your save"
                  @click="openPlan(r.chain)"
                >
                  Simulate this plan
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details class="text-[11px] text-slate-500">
        <summary class="cursor-pointer font-bold text-slate-600">How this is worked out</summary>
        <p v-if="gearTable" class="mt-1 leading-relaxed">
          This instant answer was built on gear exactly like yours (the same artifacts and stones, so the same earnings and
          delivery sets, with epic research and colleggtibles maxed), so its ascensions match the full simulator for
          you<template v-if="(header?.gearTo ?? 489) < 489">
            up to TE {{ header?.gearTo }}; above that it uses the instant answer for fully maxed gear at your own delivery rate</template
          >. Each fresh ascension starts on the hour, where the instant answer was simulated.
        </p>
        <p v-else-if="own" class="mt-1 leading-relaxed">
          This instant answer was built on your own account: your earnings and delivery sets, epic research and colleggtibles as
          your save has them now (Clothed TE bonus {{ header?.cteBonus }}). Each of its ascensions is the simulator's
          own build, and the waiting after it is the simulator's own arithmetic, so a route here matches the full
          simulator on your account. Your first ascension is your own (continuing the one in progress when the continue
          rule would, from your save). Each fresh ascension starts on the hour, where the instant answer was simulated. If your
          gear changes, the page goes back to the instant answer for fully maxed gear until yours is made again.
        </p>
        <p v-else class="mt-1 leading-relaxed">
          The instant answer was built on a maxed account: perfect delivery set, Clothed TE bonus {{ header?.cteBonus }}, all
          epic research and colleggtibles. Each of its ascensions is the simulator's own build, and the waiting after it
          is the simulator's own arithmetic, so on that account a route here matches the full simulator to the second.
          For you: your first ascension is your own (continuing the one in progress when the continue rule would, from
          your save), the waits run at your own peak delivery rate ({{ ((deliveryScale ?? 1) * 100).toFixed(1) }}% of
          the instant answer's: the best set your inventory can wear at full research), and each ascension is read from the row
          for its own TE. Each fresh ascension starts on the hour, where the instant answer was simulated; the weekly sale is at
          a fixed Pacific time, so the hour of the week is what matters.
        </p>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { showDateTime } from '@/lib/displayTime';
import { continueTailParams, instantDeliveryScale } from '@/search/leg';
import { CONTINUE_MAX_SECONDS, CONTINUE_PIN_MAX_SECONDS } from '@/search/rules';
import { EGG_ORDER } from '@/search/precomputedLeg';
import { cteFromArtifacts } from 'lib/virtue';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { findRoutes, type FoundRoutes, type PolishOptions, type Route } from '@/search/routeFinder';
import {
  atMostAscensions,
  describeGains,
  polishGains,
  readFilters,
  writeFilters,
  type PolishGain,
} from '@/search/instantFilters';
import { availabilityKey, type Availability } from '@/search/availabilitySchedule';
import { describeColleggtibles } from '@/search/progression';
import { poolSize, RoutePool } from '@/search/routePool';
import { describeGear, isMaxed, pickBracket, type TableEntry } from '@/search/tableBracket';
import { isSmallDevice } from '@/search/device';
import { onArrival, resumeAfterRun } from '@/search/instantDeferral';
import { readSnapshot, writeSnapshot } from '@/search/instantSnapshot';
import { simulateRoute } from '@/search/simulateRoute';
import type { FirstLegsRequest } from '@/workers/routeFinder.protocol';
import { createChainSearchPool, type ChainSearchPool, type EvaluateOptions } from '@/search/pool';
import type { HandoffChoice } from '@/search/chain';
import type { ChainResult } from '@/search/types';
import { gearChanges, gearStamp, gearTableName, tableName } from '@/search/tableGear';
import { compositeUrl, parseCompositeUrl } from '@/search/precomputedTable';
import type { TableHeader } from '@/search/precomputedTable';

const props = defineProps<{
  /** Highest TE by a date: the unix second. Without it, the fastest route to the target. */
  deadline?: number;
}>();
const emit = defineEmits<{
  check: [chain: number[]];
  /** By a date: the route for each number of ascensions, and the "At most N ascensions" filter (null
   *  for any), which the exact check's routes don't go through. */
  routes: [byCount: Record<number, number[]>, maxAscensions: number | null];
}>();
/** By a date: hand the panel this answer's route for each number of ascensions (the exact check's
 *  where it has one), so its chain boxes can be suggested around them. */
function emitRoutes(found: { byDateByAscensions: (Route | null)[] }): void {
  const byCount: Record<number, number[]> = {};
  found.byDateByAscensions.forEach((r, k) => {
    if (r) byCount[k] = [...r.chain];
  });
  for (const [k, d] of Object.entries(dateExactByK.value)) if (d) byCount[Number(k)] = [...d.chain];
  emit('routes', byCount, filters.value.maxAscensions);
}
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const TABLE_URL = `${import.meta.env.BASE_URL}precompute/table.bin`;

/** The table the answer came from: the player's own (search/tableGear.ts) or the maxed one. */
const tableUrl = ref(TABLE_URL);
/** Built on this player's gear (their own table, or a board gear combination's exactly like theirs):
 *  no adjustment, and none of the maxed table's caveats. */
const own = computed(() => tableUrl.value !== TABLE_URL);
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
/** This site has no usable table: the panel is not shown at all. */
const noTable = ref(false);
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
 * it is better (`polishGains`: sooner, or By a date a higher TE or more to spare), then the exact
 * check on the routes as they now stand.
 */
async function polishInBackground(
  id: number,
  p: RoutePool,
  url: string,
  options: PolishOptions,
  raw: FoundRoutes,
  shown: FoundRoutes
): Promise<void> {
  backgroundStatus.value = 'running';
  gains.value = [];
  let final = shown;
  try {
    const t = performance.now();
    const strong = await p.polish(url, { ...options, ...STRONG_POLISH }, JSON.parse(JSON.stringify(raw)));
    if (id !== runs) return;
    if (import.meta.env.DEV) console.info(`instant answer: background polish ${Math.round(performance.now() - t)} ms`);
    const better = atMostAscensions({ ...raw, ...strong }, filters.value.maxAscensions);
    const g = polishGains(shown, better, !!props.deadline);
    if (g.length) {
      final = better;
      result.value = better;
      if (props.deadline) emitRoutes(better);
    }
    gains.value = g;
  } catch {
    // The first answer stands.
    if (id !== runs) return;
  }
  backgroundStatus.value = 'done';
  void runExact(id, final);
}

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
type FirstLegsBase = Omit<FirstLegsRequest, 'id' | 'kind' | 'url' | 'deliveryScale'>;
async function runBracket(bid: number, legs: FirstLegsBase, hours: Availability | null): Promise<void> {
  if (bid !== bracketRuns || own.value || gearTable.value || deliveryScale.value === null) return;
  const player = { bonus: bonus.value, k: deliveryScale.value };
  if (isMaxed(player)) return;
  let entries: TableEntry[];
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}precompute/tables.json`, { cache: 'no-cache' });
    if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) return;
    entries = ((await res.json()) as TableEntry[]).filter(e => e.from <= legs.startTE);
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
  const side = async (entry: TableEntry | null): Promise<BracketSide | null> => {
    if (!entry) return null;
    const url =
      entry.file === 'table.bin'
        ? TABLE_URL
        : compositeUrl(`${import.meta.env.BASE_URL}precompute/${entry.file}`, TABLE_URL, GEAR_TABLE_TO, entry.k);
    const firstLegs = await pool.firstLegs({ url, deliveryScale: 1, ...legs });
    const found = await findRoutes({
      table: () => null,
      startTE: legs.startTE,
      start: legs.start,
      final: target.value,
      maxAscensions: MAX_ASCENSIONS,
      firstLegs,
      ...(props.deadline ? { deadline: props.deadline } : {}),
      ...(hours ? { hours } : {}),
      expand: (items, settings) => pool.expand(url, items, settings),
    });
    const f = atMostAscensions(found, filters.value.maxAscensions);
    const r = props.deadline ? f.byDate : f.best;
    return { entry, end: r?.end ?? null, te: r ? r.legs[r.legs.length - 1].endTE : 0 };
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
    if (bid === bracketRuns) {
      bracketStatus.value = 'done';
      // The current run's number, not the one this started under: "Check again" bumps `runs` without
      // superseding the bracket, and the snapshot is waiting on it.
      saveSnapshot(runs);
    }
  }
}
/** The bracket's two ends, or null: the stronger gear's (sooner, or more TE) and the weaker's. */
const bracketText = computed(() => {
  const b = bracket.value;
  if (!b?.above?.end) return '';
  const name = (s: BracketSide) => (s.entry.file === 'table.bin' ? 'the instant answer for fully maxed gear' : describeGear(s.entry));
  const hi = b.above;
  const lo = b.below?.end ? b.below : null;
  if (props.deadline)
    return lo
      ? `With your gear you'd likely reach between ${lo.te} TE (on ${name(lo)}) and ${hi.te} TE (on ${name(hi)}) by the date; Check exactly gives your real TE.`
      : `With your gear you'd likely reach at most ${hi.te} TE by the date (on ${name(hi)}); Check exactly gives your real TE.`;
  return lo
    ? `With your gear you'd likely finish between ${show(hi.end!)} (on ${name(hi)}) and ${show(lo.end!)} (on ${name(lo)}); Check exactly gives your real date.`
    : `With your gear you'd likely finish no sooner than ${show(hi.end!)} (on ${name(hi)}); Check exactly gives your real date.`;
});

/** "Works inside my hours" (only with "Let me pick my hours") and "At most N ascensions". */
const filters = ref(readFilters());
watch(filters, f => writeFilters(f), { deep: true });
const hoursOn = computed(() => store.scheduleEnabled && !!store.availability);
const useHours = computed(() => hoursOn.value && filters.value.inHours);
const filtering = computed(() => useHours.value || filters.value.maxAscensions !== null);
/** The counts a row could show that have no route inside the hours. */
const outOfHoursShown = computed(() => {
  const r = result.value;
  if (!r?.outOfHours || !useHours.value) return [];
  const top = props.deadline ? (r.byDate?.legs.length ?? 8) + 2 : Math.max(10, (r.best?.legs.length ?? 0) + 2);
  return r.outOfHours.filter(k => k <= top);
});
/** 3 -> "3"; [2, 3, 5] -> "2, 3 or 5". */
function countList(ks: number[]): string {
  return ks.length < 2 ? ks.join('') : `${ks.slice(0, -1).join(', ')} or ${ks[ks.length - 1]}`;
}
function fastestRowsOf(found: NonNullable<typeof result.value>, bestK?: number): Route[] {
  const top = Math.max(10, (bestK ?? found.best?.legs.length ?? 0) + 2);
  return found.byAscensions.filter((r, k): r is Route => !!r && k <= top);
}
const rows = computed(() => (result.value ? fastestRowsOf(result.value, exactBestAll.value?.legs.length) : []));

/** Setup the instant answer does not model, named so nobody reads it as accounted for. */
const leftOut = computed(() => {
  const out: string[] = [];
  if (store.scheduleEnabled) out.push('playing hours');
  if (store.timeOff.length) out.push('time off');
  if (store.milestones.length) out.push('dates to hit');
  return out;
});

/** How far the player's earnings set is from the table's Clothed TE bonus. */
const bonusShort = computed(() => (header.value ? header.value.cteBonus - bonus.value : 0));

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

/** The player's gear is not the table's account's, and the route starts where that shows. */
const gearDiffers = computed(
  () =>
    !own.value &&
    Math.floor(store.currentTE) < FULL_RESEARCH_TE &&
    (bonusShort.value > 0.05 || Math.abs((deliveryScale.value ?? 1) - 1) > 0.005)
);

/** What the player's epic research and colleggtibles are short of the table's (all maxed), said
 *  plainly; empty when nothing is, or nothing could be read. Both speed every build and every wait,
 *  and the instant answer takes neither off. */
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
  () => (store.isRunning || store.deadlineRunning) && status.value !== 'loading' && backgroundStatus.value !== 'running',
  free => {
    if (free) pool?.sleep();
  }
);

/** A chain search or By a date run has the cores and the memory. */
const runBusy = computed(() => store.isRunning || store.deadlineRunning);
/** The panel is holding off working routes out because of a run (shows the line and its button). */
const waiting = ref(false);
/** The polish and exact check, held back to when the run ends. */
let afterRun: (() => void) | null = null;
watch(runBusy, (busy, wasBusy) => {
  if (resumeAfterRun({ wasBusy, busy, waiting: waiting.value, hasAnswer: !!result.value })) {
    void run();
    return;
  }
  if (!busy && wasBusy && afterRun) {
    const go = afterRun;
    afterRun = null;
    go();
  } else if (!busy && wasBusy && result.value && exactStatus.value === 'waiting') {
    checkAgain();
  }
});

/** A thrown message as a player may see it: the loader's own wording says "table", which players never see. */
function playerFacing(message: string): string {
  return /table/i.test(message) ? 'the instant answer could not be read' : message;
}

/** Each run's number: a run that has been superseded (the save or the date changed) is dropped. */
let runs = 0;

/**
 * The table's header, the player's first ascension and then the search itself, here on the page,
 * with each step's arithmetic split across the workers (search/routePool.ts).
 */
async function run(force = false, goAhead = false): Promise<void> {
  const te = Math.floor(store.currentTE);
  if (!(te > 0) || !(target.value > te)) return;
  const id = ++runs;
  const bid = ++bracketRuns;
  cachedKey = cacheKey();
  cached.value = readCache(cachedKey);
  // The same save, setup and filters as when it was last worked out: show that answer, in full, and
  // skip the work. (The at-once box is in this key; the plan start is not, as it is a new minute on every visit: the note says which start the saved dates are for.)
  snapKey = cachedKey ? `${cachedKey}|${tryAtOnce.value ? 1 : 0}` : null;
  savedAt.value = null;
  waiting.value = false;
  afterRun = null;
  stopExact();
  // The old saved answer stays until a new one is saved over it (saveSnapshot): a forced run that is
  // stopped, superseded or fails must not leave the player with nothing.
  const saved = !force && !!readSnapshot(snapKey);
  // Pressing "Work it out again" is the go-ahead: it must not drop to "waits" while a search runs.
  const what = onArrival({ runBusy: runBusy.value, hasSaved: saved, goAhead: goAhead || force });
  if (what === 'restore' && restoreSnapshot()) return;
  if (what === 'wait' || (what === 'restore' && runBusy.value && !goAhead)) {
    // A search has the memory: no route workers until it ends or the player says go ahead.
    waiting.value = true;
    status.value = 'idle';
    exactStatus.value = 'idle';
    backgroundStatus.value = 'idle';
    bracketStatus.value = 'idle';
    result.value = null;
    return;
  }
  exactStatus.value = 'idle';
  status.value = 'loading';
  noTable.value = false;
  backgroundStatus.value = 'idle';
  gains.value = [];
  bracket.value = null;
  bracketStatus.value = 'idle';
  loadingText.value = header.value
    ? 'Working out every route…'
    : 'Loading the instant answer (a few MB, once) and working out every route…';
  try {
    const p = getPool();
    // The player's own table when there is one built on the gear their save has now; else the maxed one.
    let url = TABLE_URL;
    let h: TableHeader | null = null;
    let mismatch = '';
    const mine = await ownTableUrl().catch(() => null);
    if (mine) {
      try {
        const oh = await p.header(mine);
        if (oh.gear) {
          const stamp = gearStamp(store.collectInputs(), store.readInventory().earnings, oh.gear.research);
          const changes = stamp ? gearChanges(oh.gear, stamp) : ['gear'];
          if (!changes.length) {
            url = mine;
            h = oh;
          } else mismatch = changes.join(', ');
        }
      } catch {
        // No table of their own (the usual case): the maxed one.
      }
    }
    h ??= await p.header(TABLE_URL);
    // No table of their own: one built on a board gear combination exactly like theirs, if there is
    // one (search/tableGear.ts gearTableName), below GEAR_TABLE_TO; the maxed one from there.
    if (url === TABLE_URL && h.k3) {
      const stamp = gearStamp(store.collectInputs(), store.readInventory().earnings, h.k3.research);
      if (stamp) {
        const gearUrl = `${import.meta.env.BASE_URL}precompute/${await gearTableName(stamp)}`;
        const scale = instantDeliveryScale(store.collectInputs(), h.k3);
        const both = compositeUrl(gearUrl, TABLE_URL, GEAR_TABLE_TO, scale);
        try {
          h = await p.header(both);
          url = both;
        } catch {
          // No table for this gear (the usual case): the maxed one.
          h = await p.header(TABLE_URL);
        }
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
      errorText.value = `The instant answer starts at TE ${h.from} and your route starts at ${te}, so there is no instant answer yet. The searches below work as always.`;
      return;
    }
    const inputs = store.collectInputs();
    const scale = deliveryScale.value ?? 1;
    const t0 = performance.now();
    const legsRequest: FirstLegsBase = {
      startTE: te,
      start: inputs.planStart,
      final: target.value,
      delivered: EGG_ORDER.map(e => inputs.baseState.eggsDelivered?.[e] || 0),
      // A plain copy: workers get structured-cloned data, never a reactive proxy.
      cont: JSON.parse(JSON.stringify(continueTailParams(inputs, inputs.planStart))),
      forceContinue: store.forceContinue,
      pinSeconds: CONTINUE_PIN_MAX_SECONDS,
      maxContinueSeconds: CONTINUE_MAX_SECONDS,
    };
    const firstLegs = await p.firstLegs({ url, deliveryScale: scale, ...legsRequest });
    if (id !== runs) return;
    // A plain copy: it goes to the workers.
    const hours =
      useHours.value && store.availability ? (JSON.parse(JSON.stringify(store.availability)) as Availability) : null;
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
    };
    const polished = await p.polish(url, polishOptions, JSON.parse(JSON.stringify(found)));
    if (id !== runs) return;
    const raw = { ...found, ...polished };
    const answer = atMostAscensions(raw, filters.value.maxAscensions);
    result.value = answer;
    ms.value = performance.now() - t0;
    status.value = 'done';
    if (props.deadline) emitRoutes(answer);
    if (small) return;
    const polish = () =>
      void polishInBackground(id, p, url, polishOptions, raw, answer).then(() => runBracket(bid, legsRequest, hours));
    // A search started meanwhile (or this was worked out anyway during one): the polish and the exact
    // check wait for it to end, or for the player to press Check exactly.
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
    // No usable table on this site (missing, a web page in its place, or cut short): the panel is
    // hidden and every search works exactly as without it.
    noTable.value = /404|not a precomputed table|incomplete|precomputed table version/.test(message);
    errorText.value = noTable.value
      ? 'The instant answer isn’t on this site yet.'
      : `The instant answer couldn’t run: ${playerFacing(message)}`;
  }
}

/**
 * THE EXACT CHECK. The table is exact for its own maxed account; for anyone else it is a few percent
 * off below TE 340, and over a whole route that can move the ranking or a date answer by a TE or two
 * (the alt from TE 138: the table's 9-ascension pick is 1.4% fast and the simulator prefers an
 * 8-ascension route; its Egg Day 248 arrives 5 d late). So once the instant answer is shown, the
 * routes it shows are priced again by the full simulator on the player's own account and setup
 * (search/pool.ts, the same evaluation the searches use), and the page says what that gives.
 *
 * Fastest route: the table's fastest first, alone, so its exact date comes soonest; then the other
 * rows a round at a time, one route per worker, filling the Exact column as each round returns (a
 * worker only answers when its whole share is done, and the pool deals each call by position, so
 * rounds are the way to see rows arrive). By a date: the date's route; if it misses the date, the
 * same checkpoints with the last one lower, on one worker so the shared legs are simulated once.
 */
interface Exact {
  /** Seconds from the plan start, and the unix second it ends. */
  seconds: number;
  end: number;
  /** TE when the route ends (above its last checkpoint when a sale wait overshoots). */
  endTE: number;
  /** How its fresh ascensions start in the price kept (chain.ts `HandoffChoice`): 'hour' unless
   *  the player ticked "also try ascending at once" and another way was sooner. */
  handoff: HandoffChoice;
  /** The fresh ascensions (1-based) that start at once rather than on the hour in that price. */
  atOnce: number[];
  /** How many of its ascensions are fresh (not the one in progress, continued). */
  fresh: number;
  /** Its simulated ascensions, for "Simulate this plan" (time off is worked in from these). */
  legs: ChainResult['legs'];
}
/** Exact prices by `chain.join(',')`; null where the simulator could not price the route. */
const exact = ref<Record<string, Exact | null>>({});
/** "Also try ascending at once" (off by default): the exact check also prices every route with each
 *  fresh ascension at once, and with the sooner of the two at each one, and keeps the best. Up to
 *  three times the work, so it is the player's choice. */
const tryAtOnce = ref(false);
const exactStatus = ref<'idle' | 'running' | 'done' | 'error' | 'waiting'>('idle');
const exactText = ref('');
const exactMs = ref<number | null>(null);
/** A date answer: a route, the TE it ends at and the unix second it gets there. */
interface DateExact {
  chain: number[];
  endTE: number;
  end: number;
  handoff: HandoffChoice;
  atOnce: number[];
  fresh: number;
}
/** By a date: the highest TE that really makes the date on the player's account (the simulator's),
 *  overall and for each row's number of ascensions (null: that row misses it). */
const dateExact = ref<DateExact | null>(null);
const dateExactByK = ref<Record<number, DateExact | null>>({});
/** dateExact read through a call, so TypeScript does not keep it narrowed to the null it was reset to
 *  at the start of the exact check while awaits in between set it. */
const readDateLead = (): DateExact | null => dateExact.value;
/** Under a day to spare is tight: a slower ascension than planned, or a late start, misses the date. */
const TIGHT_SECONDS = 86400;
const tableDate = (r: Route): DateExact => ({
  chain: r.chain,
  endTE: r.legs[r.legs.length - 1].endTE,
  end: r.end,
  handoff: 'hour',
  atOnce: [],
  fresh: r.legs.filter(l => l.label !== 'continue').length,
});
/** "Ascend at once for …", when the exact check kept a price that starts some ascensions at once. */
function atOnceNote(e: { atOnce: number[]; fresh: number } | null | undefined): string {
  if (!e || !e.atOnce.length) return '';
  if (e.atOnce.length >= e.fresh)
    return 'Fastest on your account starting each fresh ascension the moment the one before ends, not on the hour.';
  const which = e.atOnce.length === 1 ? `ascension ${e.atOnce[0]}` : `ascensions ${e.atOnce.join(', ')}`;
  return `Fastest on your account starting ${which} the moment the one before ends, not on the hour (the others on the hour).`;
}
const spareOf = (d: DateExact) => (props.deadline ?? 0) - d.end;
/** The rows By a date shows: the table's best number of ascensions and up to two either side. */
function dateRowsOf(found: NonNullable<typeof result.value>, bestK?: number): Route[] {
  const best = found.byDate;
  if (!best) return [];
  const top = (bestK ?? best.legs.length) + 2;
  const shown = found.byDateByAscensions.filter((r, k): r is Route => !!r && k <= top);
  // The best first, so its exact answer comes first.
  // (The overall route and its count's row are separate objects for the same route.)
  return [best, ...shown.filter(r => r.legs.length !== best.legs.length)];
}
const dateRows = computed(() =>
  result.value
    ? [...dateRowsOf(result.value, dateExact.value?.chain.length)].sort((a, b) => a.legs.length - b.legs.length)
    : []
);

let exactPool: ChainSearchPool | null = null;
function stopExact(): void {
  exactPool?.terminate();
  exactPool = null;
}
onUnmounted(stopExact);

const key = (chain: number[]) => chain.join(',');
const exactOf = (r: Route) => exact.value[key(r.chain)];

/** The plan start the exact check priced from, for "Simulate this plan". */
const answerStart = ref(0);
/**
 * "Simulate this plan" (a row's, or the answer's): this exact route in Classic, simulated on the
 * player's save from the start it was priced from and with its time off; Classic scrolls to the plan
 * and says where it came from (search/simulateRoute.ts).
 */
function openPlan(chain: number[]): void {
  simulateRoute(chain, props.deadline ? 'by-date' : 'fastest', {
    ...(answerStart.value ? { start: answerStart.value } : {}),
    ...(exact.value[key(chain)]?.legs ? { legs: exact.value[key(chain)]!.legs } : {}),
  });
}
/** The top button: price every shown route with the full simulator again. */
function checkAgain(): void {
  if (!result.value || exactStatus.value === 'running') return;
  savedAt.value = null;
  const id = ++runs;
  void runExact(id, result.value, true);
}

async function runExact(id: number, found: NonNullable<typeof result.value>, manual = false): Promise<void> {
  stopExact();
  exact.value = {};
  dateExact.value = null;
  dateExactByK.value = {};
  exactMs.value = null;
  // A search the player started has the cores; this waits rather than slowing it down.
  if (runBusy.value && !manual) {
    exactStatus.value = 'waiting';
    return;
  }
  const tableRows = fastestRowsOf(found);
  const routes = props.deadline
    ? dateRowsOf(found)
    : [found.best, ...tableRows.filter(r => r !== found.best)].filter((r): r is Route => !!r);
  if (!routes.length) return;
  // The last checked answer's route, priced again with the rest (not shown as a row of its own).
  const again =
    cached.value && !routes.some(r => key(r.chain) === key(cached.value!.chain)) ? cached.value.chain : null;
  exactStatus.value = 'running';
  const t0 = performance.now();
  try {
    const inputs = store.collectInputs();
    answerStart.value = inputs.planStart;
    const size = Math.max(1, Math.min(store.workerBudget, routes.length, 4));
    exactPool = await createChainSearchPool(inputs, { size });
    if (id !== runs) return;
    const price = async (chains: number[][], opts?: EvaluateOptions) => {
      // On the hour, as the table was simulated and as the times shown assume (chain.ts
      // `HandoffChoice`); with "also try ascending at once", all at once and the sooner of the two
      // at each ascension too, keeping whichever reaches the end soonest.
      const ways: HandoffChoice[] = tryAtOnce.value ? ['hour', 'now', 'sooner'] : ['hour'];
      const best = new Map<string, { r: ChainResult; handoff: HandoffChoice }>();
      for (const handoff of ways) {
        const { results } = await exactPool!.evaluate(chains, undefined, { ...opts, handoff });
        if (id !== runs) return false;
        for (const r of results) {
          const k = key(r.chain);
          const b = best.get(k);
          if (r.seconds > 0 && (!b || r.seconds < b.r.seconds)) best.set(k, { r, handoff });
        }
      }
      const next = { ...exact.value };
      for (const c of chains) {
        const b = best.get(key(c));
        next[key(c)] = b
          ? {
              seconds: b.r.seconds,
              end: inputs.planStart + b.r.seconds,
              endTE: b.r.legs[b.r.legs.length - 1]?.endTE ?? 0,
              handoff: b.handoff,
              atOnce: b.r.legs
                .map((l, i) => (l.key !== 'continue' && (l.startTime ?? 0) % 3600 !== 0 ? i + 1 : 0))
                .filter(n => n > 0),
              fresh: b.r.legs.filter(l => l.key !== 'continue').length,
              legs: b.r.legs,
            }
          : null;
      }
      exact.value = next;
      return true;
    };

    if (props.deadline) {
      const deadline = props.deadline;
      // Every row's route at once, one per worker; then, for each that misses the date, the same stops
      // with the last one lower, on one worker (sticky on all but the last stop) so the shared legs
      // are simulated once and each lower last stop costs one ascension.
      const sticky = { stickyDepth: -1 };
      const byK: Record<number, DateExact | null> = {};
      const done = new Set<number>();
      const checkRows = async (list: Route[]): Promise<boolean> => {
        exactText.value = 'Checking these routes on your account with the full simulator…';
        if (
          !(await price(
            list.map(r => r.chain),
            { spreadOut: true }
          ))
        )
          return false;
        for (const route of list) {
          const k = route.legs.length;
          done.add(k);
          const first = exact.value[key(route.chain)];
          let made: DateExact | null =
            first && first.end <= deadline
              ? {
                  chain: route.chain,
                  endTE: first.endTE,
                  end: first.end,
                  handoff: first.handoff,
                  atOnce: first.atOnce,
                  fresh: first.fresh,
                }
              : null;
          const prefix = route.chain.slice(0, -1);
          const floor = prefix.length ? prefix[prefix.length - 1] : Math.floor(store.currentTE);
          for (let hi = route.chain[route.chain.length - 1] - 1; hi > floor && !made; hi -= 3) {
            const tries = [hi, hi - 1, hi - 2].filter(t => t > floor).map(t => [...prefix, t]);
            exactText.value = `${k} ascensions misses the date on your account; trying lower last stops (${tries.map(c => c[c.length - 1]).join(', ')})…`;
            if (!(await price(tries, sticky))) return false;
            for (const c of tries) {
              const e = exact.value[key(c)];
              if (e && e.end <= deadline) {
                made = { chain: c, endTE: e.endTE, end: e.end, handoff: e.handoff, atOnce: e.atOnce, fresh: e.fresh };
                break;
              }
            }
          }
          byK[k] = made;
          dateExactByK.value = { ...byK };
          emitRoutes(found);
          // The answer: the highest TE that makes the date on the player's account, then the most spare.
          dateExact.value = Object.values(byK).reduce<DateExact | null>(
            (a, d) => (d && (!a || d.endTE > a.endTE || (d.endTE === a.endTE && d.end < a.end)) ? d : a),
            null
          );
        }
        return true;
      };
      if (!(await checkRows(routes))) return;
      // A lead at a higher count than the table's shows rows up to its count plus two.
      const more = dateRowsOf(found, readDateLead()?.chain.length).filter(r => !done.has(r.legs.length));
      if (more.length && !(await checkRows(more))) return;
    } else {
      exactText.value = 'Checking the fastest route on your account with the full simulator…';
      if (!(await price([routes[0].chain]))) return;
      const rest = routes.slice(1);
      for (let i = 0; i < rest.length; i += size) {
        exactText.value = `Checking the other routes: ${i} of ${rest.length} done…`;
        if (
          !(await price(
            rest.slice(i, i + size).map(r => r.chain),
            { spreadOut: true }
          ))
        )
          return;
      }
    }
    if (!props.deadline) {
      // A best at 9 or 10 ascensions shows rows up to its count plus two.
      const priced = new Set(routes.map(r => key(r.chain)));
      const bestNow = bestExactOf(found);
      const more = bestNow ? fastestRowsOf(found, bestNow.legs.length).filter(r => !priced.has(key(r.chain))) : [];
      if (
        more.length &&
        !(await price(
          more.map(r => r.chain),
          { spreadOut: true }
        ))
      )
        return;
    }
    if (again && !(await price([again]))) return;
    exactMs.value = performance.now() - t0;
    exactStatus.value = 'done';
    // Remembered for the next visit: the answer the page now leads with, exact.
    const dateLead = readDateLead();
    const lead = props.deadline ? dateLead : exactBest.value;
    const le = lead && !props.deadline ? exactOf(lead as Route) : null;
    if (props.deadline && dateLead)
      writeCache(cachedKey, { at: Date.now(), chain: dateLead.chain, end: dateLead.end, endTE: dateLead.endTE });
    else if (lead && le)
      writeCache(cachedKey, { at: Date.now(), chain: (lead as Route).chain, end: le.end, endTE: le.endTE });
    saveSnapshot(id);
  } catch (err) {
    if (id !== runs) return;
    exactStatus.value = 'error';
    exactText.value = `The exact check couldn’t run: ${playerFacing(err instanceof Error ? err.message : String(err))}`;
  } finally {
    if (id === runs) stopExact();
  }
}

/** The fastest route by the simulator among every route priced so far. */
function bestExactOf(found: NonNullable<typeof result.value>): Route | null {
  let best: Route | null = null;
  for (const r of found.byAscensions) {
    if (!r) continue;
    const e = exactOf(r);
    if (e && (!best || e.end < exactOf(best)!.end)) best = r;
  }
  return best;
}
const exactBestAll = computed<Route | null>(() =>
  !props.deadline && exactStatus.value === 'done' && result.value ? bestExactOf(result.value) : null
);
/** The same, once every row is priced (what the box leads with). */
const exactBest = exactBestAll;
/** By a date: how many seconds after the date the table's own date route really arrives, when it
 *  misses on the player's account. */
const missedBy = computed<number | null>(() => {
  const r = result.value?.byDate;
  const e = r ? exact.value[key(r.chain)] : undefined;
  return props.deadline && e && e.end > props.deadline ? e.end - props.deadline : null;
});
/** How far a row is behind the fastest: by the simulator once every row is priced, by the table until then. */
function behind(r: Route): string {
  const best = exactBest.value;
  if (best) {
    const e = exactOf(r);
    if (!e) return '';
    return r === best ? 'fastest' : '+' + days(e.end - exactOf(best)!.end);
  }
  const t = result.value?.best;
  if (!t) return '';
  return r === t ? 'fastest' : '+' + days(r.seconds - t.seconds);
}
/**
 * Fastest route only: hand the searches this answer (chainSearch.ts `suggestedCount`/`suggestedRoute`
 * for their "the instant answer suggests N ascensions" notes, and `instantRoutes`, fastest first, for
 * Smart search's starting chain and the Full sweep's Suggest a space), in the exact check's order once
 * it is done.
 */
watch([result, exactStatus], () => {
  if (props.deadline || !result.value) return;
  const exactDone = exactStatus.value === 'done';
  const endOf = (r: Route) => (exactDone ? (exactOf(r)?.end ?? Infinity) : r.end);
  const ordered = result.value.byAscensions.filter((r): r is Route => !!r).sort((a, b) => endOf(a) - endOf(b));
  store.instantRoutes = ordered.map(r => [...r.chain]);
  store.suggestedRoute = ordered[0] ? [...ordered[0].chain] : null;
  store.suggestedCount = ordered[0] ? ordered[0].chain.length : null;
});

/** The route the box leads with: the simulator's fastest once known, else the table's. */
const lead = computed(() => exactBest.value ?? result.value?.best ?? null);
const reranked = computed(() => !!exactBest.value && exactBest.value !== result.value?.best);

/**
 * THE LAST CHECKED ANSWER, remembered in this browser per save and setup: shown at once on the next
 * visit, labelled with when it was checked, then checked again. Its route is priced with the new rows,
 * so the page can say whether something better turned up or it is still the best.
 *
 * Valid only for the same thing asked of the same account: the player, the mode (target, or the date),
 * the TE and every egg's count (a new save moves them), the inventory and epic research (the gear
 * stamp's inputs, cheaper to compare raw), and the setup the exact check uses (playing hours, time off,
 * dates to hit, the continue rule). Not the plan start: an answer from this morning is still worth
 * showing beside the new one, with its time.
 */
interface CachedAnswer {
  /** Unix ms it was checked. */
  at: number;
  chain: number[];
  /** Unix second it reaches the target (fastest) or the TE it makes (date) and when. */
  end: number;
  endTE: number;
}
const CACHE_PREFIX = 'aap-instant-answer:';
function cacheKey(): string | null {
  const inputs = store.collectInputs();
  const raw = inputs.context.rawBackup as { eiUserId?: string } | undefined;
  if (!raw?.eiUserId) return null;
  const inv = store.readInventory();
  const sig = (x: number) => Number(x.toPrecision(6));
  const parts = {
    id: raw.eiUserId,
    mode: props.deadline ? `date ${props.deadline}` : `target ${store.finalTE}`,
    te: Math.floor(store.currentTE),
    eggs: EGG_ORDER.map(e => sig(inputs.baseState.eggsDelivered?.[e] || 0)),
    artifacts: inv.artifacts,
    stones: inv.stones,
    epic: inputs.context.epicResearchLevels,
    setup: [store.availability, store.timeOff, store.milestones, store.forceContinue],
    filters: [useHours.value, filters.value.maxAscensions],
  };
  // FNV-1a: the key only has to tell setups apart; the id never leaves this browser.
  const text = JSON.stringify(parts);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return CACHE_PREFIX + h.toString(16);
}
function readCache(k: string | null): CachedAnswer | null {
  if (!k) return null;
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as CachedAnswer | null;
    return v && Array.isArray(v.chain) && v.chain.length ? v : null;
  } catch {
    return null;
  }
}
function writeCache(k: string | null, v: CachedAnswer): void {
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Storage full or blocked: the next visit simply has nothing to show first.
  }
}
const cached = ref<CachedAnswer | null>(null);
let cachedKey: string | null = null;

/**
 * THE WHOLE ANSWER, saved when everything has finished (the exact check, the background polish and
 * the nearest-tables line) and put back as it was on the next visit with the same key
 * (search/instantSnapshot.ts). It restores the same fields the computation sets, so everything that
 * reads them works unchanged: the searches' seeds (`instantRoutes`, `suggestedRoute`,
 * `suggestedCount`, by the watch below), By a date's box fill (`routes` emit), Simulate this plan,
 * Check exactly and "Check all again" (which start their own workers when pressed).
 */
interface InstantSnapshot {
  v: 1;
  at: number;
  result: FoundRoutes;
  header: TableHeader | null;
  tableUrl: string;
  ownChanged: string;
  ms: number | null;
  exact: Record<string, Exact | null>;
  dateExact: DateExact | null;
  dateExactByK: Record<number, DateExact | null>;
  answerStart: number;
  exactMs: number | null;
  gains: PolishGain[];
  bracket: { above: BracketSide | null; below: BracketSide | null } | null;
}
let snapKey: string | null = null;
/** When the answer on screen was saved, while it is a saved one (not worked out in this visit). */
const savedAt = ref<number | null>(null);
function saveSnapshot(id: number): void {
  if (id !== runs || !snapKey || !result.value || status.value !== 'done' || exactStatus.value !== 'done') return;
  if (backgroundStatus.value === 'running' || bracketStatus.value === 'running') return;
  // Plain copies. The finder's spare routes are only for the polish, which is done.
  const slim: FoundRoutes = { ...JSON.parse(JSON.stringify(result.value)) };
  delete slim.alternatives;
  delete slim.dateAlternatives;
  const snap: InstantSnapshot = JSON.parse(
    JSON.stringify({
      v: 1,
      at: Date.now(),
      result: slim,
      header: header.value,
      tableUrl: tableUrl.value,
      ownChanged: ownChanged.value,
      ms: ms.value,
      exact: exact.value,
      dateExact: dateExact.value,
      dateExactByK: dateExactByK.value,
      answerStart: answerStart.value,
      exactMs: exactMs.value,
      gains: gains.value,
      bracket: bracket.value,
    })
  );
  // Too big: keep the answer without each route's step-by-step legs ("Simulate this plan" then
  // simulates them itself).
  if (!writeSnapshot(snapKey, snap)) {
    for (const e of Object.values(snap.exact)) if (e) delete (e as Partial<Exact>).legs;
    writeSnapshot(snapKey, snap);
  }
}
function restoreSnapshot(): boolean {
  const s = readSnapshot<InstantSnapshot>(snapKey);
  if (!s || s.v !== 1 || !s.result || !s.header) return false;
  header.value = s.header;
  tableUrl.value = s.tableUrl;
  ownChanged.value = s.ownChanged;
  result.value = s.result;
  ms.value = s.ms;
  exact.value = s.exact;
  dateExactByK.value = s.dateExactByK;
  dateExact.value = s.dateExact;
  answerStart.value = s.answerStart;
  exactMs.value = s.exactMs;
  gains.value = s.gains;
  bracket.value = s.bracket;
  bracketStatus.value = 'done';
  backgroundStatus.value = 'done';
  exactStatus.value = 'done';
  exactText.value = '';
  status.value = 'done';
  noTable.value = false;
  // The last-checked line is for a recompute to compare against; this answer is that check.
  cached.value = null;
  savedAt.value = s.at;
  if (props.deadline) emitRoutes(s.result);
  return true;
}

/** After the exact check: is the new answer better than the last checked one, priced again now? */
const sinceCache = computed<{ better: boolean; text: string } | null>(() => {
  const c = cached.value;
  if (!c || exactStatus.value !== 'done') return null;
  const when = show(c.at / 1000);
  if (props.deadline) {
    const now = dateExact.value;
    if (!now) return null;
    if (key(now.chain) === key(c.chain))
      return { better: false, text: `Still the best since the last check (${when}).` };
    const again = exact.value[key(c.chain)];
    const old = again && again.end <= props.deadline ? again.endTE : null;
    if (old === null || now.endTE > old || (now.endTE === old && now.end < (again?.end ?? Infinity) - 60))
      return { better: true, text: `Better than the last check (${when}, ${c.endTE} TE via ${c.chain.join(' ')}).` };
    return { better: false, text: `Still the best since the last check (${when}).` };
  }
  const best = exactBest.value;
  const e = best ? exactOf(best) : null;
  if (!best || !e) return null;
  if (key(best.chain) === key(c.chain))
    return { better: false, text: `Still the best since the last check (${when}).` };
  const again = exact.value[key(c.chain)];
  if (!again || e.end < again.end - 60)
    return {
      better: true,
      text: `Better than the last check (${when}, ${c.chain.join(' ')})${again ? `: ${days(again.end - e.end)} sooner` : ''}.`,
    };
  return { better: false, text: `Still the best since the last check (${when}).` };
});

// Again whenever what it depends on changes (a new save, a new plan start, another target).
let timer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [
    Math.floor(store.currentTE),
    store.planStart,
    target.value,
    props.deadline,
    store.forceContinue,
    bonus.value,
    tryAtOnce.value,
    useHours.value ? availabilityKey(store.availability) : '',
    filters.value.maxAscensions,
  ],
  () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 300);
  },
  { immediate: true }
);
onUnmounted(() => timer && clearTimeout(timer));

const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
function show(unix: number): string {
  return showDateTime(unix, zone.value);
}
function days(seconds: number): string {
  return (seconds / 86400).toFixed(2) + ' days';
}
</script>
