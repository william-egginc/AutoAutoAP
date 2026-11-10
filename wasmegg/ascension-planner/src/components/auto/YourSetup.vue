<!--
  "Your setup": every setting the Auto Planner's screens share, in one place at the top of each
  (the unified layout, phase 2). Classic, Fastest route and Highest TE by a date all read the same
  store fields, and each used to show its own copy of them -- the schedule in two wordings, keep
  awake in three places -- so a player changed their hours on one screen and wondered whether the
  next had them. Now there is one copy, and it says on each screen what that screen does with it.

  Folded to one line by default, like the setting cards it replaces: a folded setting still shows
  its value, since a hidden one is how people run with a schedule they forgot they set.

  Docked, slimmed (UX fluff review 2, part B, 5 Nov 2026; Jordan approved the mock with More options closed): the
  save line, Awake hours, No prestige days, Time off and Sharing stay in view; the rest is under More options, whose
  line names the plan start, the first ascension, the workers and every value inside that isn't its default, by the
  same rule.

  The settings that change which route is fastest (plan start, hours, time off) lock while a search
  runs: every route already priced was priced under the old ones. The machine settings don't, since
  a running search resizes to them.
-->
<template>
  <!-- Strong colour and a real button: folded into a thin line it was easy to miss (the user, 30 Sept). -->
  <!-- `issues-only` (Fastest and By a date since 14 Oct: the floating Setup button is the one way in, Allan's
       "too many boxes"): nothing unless the save has a problem, then the problems and Open setup. -->
  <section
    v-if="!issuesOnly || store.setupIssues.length"
    class="min-w-0 text-left"
    :class="
      docked
        ? ''
        : issuesOnly
          ? 'rounded-2xl border-2 border-rose-200 bg-white shadow-sm'
          : 'rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 shadow-sm'
    "
    :data-testid="issuesOnly ? 'setup-issues' : undefined"
  >
    <!-- On a screen: one line, every value visible; Edit setup opens the floating panel
         (SetupDock.vue), the one place the setup is edited. -->
    <button
      v-if="!docked && !issuesOnly"
      type="button"
      class="w-full flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 text-left"
      :aria-expanded="ui.setupOpen"
      @click="ui.setupOpen = !ui.setupOpen"
    >
      <span class="flex items-center gap-2 text-body font-bold text-indigo-900">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 002.6 1.1c1.5-1 3.4.9 2.4 2.4a1.7 1.7 0 001.1 2.6c1.8.4 1.8 3 0 3.4a1.7 1.7 0 00-1.1 2.6c1 1.5-.9 3.4-2.4 2.4a1.7 1.7 0 00-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 00-2.6-1.1c-1.5 1-3.4-.9-2.4-2.4a1.7 1.7 0 00-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 001.1-2.6c-1-1.5.9-3.4 2.4-2.4a1.7 1.7 0 002.6-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        Setup
      </span>
      <span class="text-small text-slate-600"
        >Plan starts <span class="font-bold text-slate-900">{{ startLabel }}</span></span
      >
      <span class="text-small text-slate-600"
        >First ascension <span class="font-bold text-slate-900">{{ firstLabel }}</span></span
      >
      <span class="text-small text-slate-600"
        >Awake hours <span class="font-bold text-slate-900">{{ awakeLabel }}</span></span
      >
      <span class="text-small text-slate-600"
        >Time off <span class="font-bold text-slate-900">{{ timeOffCount || 'none' }}</span></span
      >
      <span v-if="noPrestigeCount" class="text-small text-slate-600" data-testid="setup-no-prestige"
        >No prestige days <span class="font-bold text-slate-900">{{ noPrestigeCount }}</span></span
      >
      <!-- Named when on only, like No prestige days: it changes the plan's cash (spec-silotrick-ui; "on" DRAFT). -->
      <span v-if="store.siloTrick" class="text-small text-slate-600" data-testid="setup-silo-trick-on"
        >{{ SILO_TRICK_LABEL }}{{ ' ' }}<span class="font-bold text-slate-900">on</span></span
      >
      <span class="text-small text-slate-600"
        ><span class="font-bold text-slate-900">{{ store.workerBudget }} of {{ store.machineThreads }}</span>
        workers</span
      >
      <span
        class="ml-auto px-3 py-1.5 rounded-lg label"
        :class="ui.setupOpen ? 'border border-indigo-300 text-indigo-700 bg-white' : 'bg-indigo-600 text-white'"
        >{{ ui.setupOpen ? 'Close setup' : 'Edit setup' }}</span
      >
    </button>

    <!-- Your setup remembered for this account (lib/setupMemory.ts), when it isn't just the defaults. -->
    <template v-if="!docked && !issuesOnly">
      <p
        v-if="store.setupIsRemembered"
        class="text-body text-slate-500"
        :class="docked ? '' : 'px-4 pb-2.5 -mt-1'"
        data-testid="setup-remembered"
      >
        Remembered for this account<template v-if="rememberedWhen"> ({{ rememberedWhen }})</template>{{ ' ' }}·
        <button
          type="button"
          class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline hover:text-indigo-900 disabled:opacity-40 disabled:no-underline"
          :disabled="locked"
          :title="locked ? 'A search is running: stop it to change the setup' : REMEMBERED_TITLE"
          data-testid="setup-reset"
          @click="store.resetSetupToDefaults()"
        >
          Reset to defaults
        </button>
      </p>
    </template>

    <!-- The one save-age banner (spec-saveage, 29 Oct 2026): Fastest and By a date show it at the top
         (AutoSaveStrip.vue); Single run, whose screen is Joo's, shows it here, where the red "longer than your
         silos hold" line was. -->
    <div v-if="!docked && !issuesOnly && screen === 'classic'" class="px-4 pb-2.5" data-testid="setup-save-banner">
      <AutoSaveStrip screen="classic" />
    </div>

    <!-- Problems with the save show folded too: nobody opens a card to look for them. -->
    <div
      v-if="!docked && store.setupIssues.length"
      class="px-4 py-2 space-y-1"
      :class="issuesOnly ? '' : 'border-t border-indigo-50'"
    >
      <p
        v-for="(issue, k) in store.setupIssues"
        :key="k"
        class="text-body font-bold"
        :class="issue.level === 'error' ? 'text-rose-700' : 'text-amber-700'"
      >
        {{ issue.level === 'error' ? '✕' : '!' }} {{ issue.message }}
      </p>
      <button
        v-if="issuesOnly"
        type="button"
        class="mt-1 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg bg-indigo-600 text-white text-body font-bold"
        @click="ui.setupOpen = true"
      >
        Open setup
      </button>
    </div>

    <div v-if="docked" class="p-4 space-y-4">
      <!-- Your save, one line (UX fluff review 2, 5 Nov 2026): Load latest save beside it, its problems under it.
           Loading a save file and the save's figures are under More options. -->
      <div class="space-y-1" data-testid="setup-save-line">
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p class="min-w-0 text-body break-words">
            <span class="font-bold text-slate-800 tabular-nums">{{ initialState.nickname || 'Your account' }} · TE {{ store.currentTE }}</span>{{ ' ' }}<span class="text-slate-500 tabular-nums">· {{ saveAgeLabel }}</span>
          </p>
          <button
            type="button"
            :disabled="store.busy || ui.loading"
            class="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 text-body font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            data-testid="setup-load-latest"
            @click="ui.backupRetryRequested++"
          >
            Load latest save
          </button>
          <!-- Change player (the simpler page, Jordan 9 Nov 2026, Q6): the chevron that hid the ID box is gone from the
               Auto Planner and My runs; this opens the box at the top and puts the cursor in it. -->
          <button
            type="button"
            :disabled="store.busy || ui.loading"
            class="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 text-body font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            data-testid="setup-change-player"
            @click="changePlayer"
          >
            Change player
          </button>
        </div>
        <p
          v-for="(issue, k) in saveCardIssues"
          :key="k"
          class="text-body font-bold"
          :class="issue.level === 'error' ? 'text-rose-700' : 'text-amber-700'"
        >
          {{ issue.level === 'error' ? '✕' : '!' }} {{ issue.message }}
        </p>
      </div>

      <p
        v-if="store.setupIsRemembered"
        class="text-body text-slate-500"
        :class="docked ? '' : 'px-4 pb-2.5 -mt-1'"
        data-testid="setup-remembered"
      >
        Remembered for this account<template v-if="rememberedWhen"> ({{ rememberedWhen }})</template>{{ ' ' }}·
        <button
          type="button"
          class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline hover:text-indigo-900 disabled:opacity-40 disabled:no-underline"
          :disabled="locked"
          :title="locked ? 'A search is running: stop it to change the setup' : REMEMBERED_TITLE"
          data-testid="setup-reset"
          @click="store.resetSetupToDefaults()"
        >
          Reset to defaults
        </button>
      </p>

      <p
        v-if="locked"
        class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-body font-bold text-amber-800"
      >
        <!-- One sentence (UX fluff review 2, S4; DRAFT): these change which route is fastest, and the routes already
             priced used the old ones; the computer settings stay free. -->
        A search is running: stop it to change the start, hours or days (your best so far is kept).
      </p>

      <!-- When you can play -->
      <fieldset
        :disabled="locked"
        class="rounded-xl border border-slate-200 p-4 space-y-3 min-w-0"
        :class="screen === 'classic' ? 'opacity-60' : ''"
      >
        <h3 class="text-slate-500 label">Awake hours</h3>
        <p v-if="screen === 'classic'" class="text-body font-bold text-amber-700">
          {{ NAMES.classic }} doesn't plan around awake hours yet. {{ fastestName(store.finalTE) }} and {{ NAMES.byDate }} do.
        </p>
        <!-- Two plain choices instead of one checkbox (the user, 4 Oct: "the hours don't seem that clear"). -->
        <!-- Two 44 px choices and one line under them (UX fluff review 2, S13; DRAFT): the blurbs said the same twice. -->
        <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Awake hours">
          <label
            class="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer"
            :class="!store.scheduleEnabled ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200'"
          >
            <input v-model="store.scheduleEnabled" type="radio" :value="false" class="text-indigo-600" />
            <span class="text-body font-bold text-slate-800">Any hour</span>
          </label>
          <label
            class="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer"
            :class="store.scheduleEnabled ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200'"
          >
            <input v-model="store.scheduleEnabled" type="radio" :value="true" class="text-indigo-600" />
            <span class="text-body font-bold text-slate-800">My awake hours</span>
          </label>
        </div>
        <p class="text-body text-slate-500" data-testid="setup-awake-line">
          Prestiges and egg shifts wait for your hours; the farm keeps laying meanwhile.
        </p>
        <div v-if="store.scheduleEnabled" class="pl-8 space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex min-w-0 max-w-full items-center gap-2 text-small font-bold text-slate-600">
              From
              <select
                v-model.number="store.availableFrom"
                class="min-w-0 max-w-full rounded-lg border-slate-200 text-base sm:text-body font-bold text-slate-800 disabled:bg-slate-50"
              >
                <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ showHour(h - 1) }}</option>
              </select>
            </label>
            <label class="flex min-w-0 max-w-full items-center gap-2 text-small font-bold text-slate-600">
              to
              <select
                v-model.number="store.availableTo"
                class="min-w-0 max-w-full rounded-lg border-slate-200 text-base sm:text-body font-bold text-slate-800 disabled:bg-slate-50"
              >
                <option v-for="h in 24" :key="h - 1" :value="h - 1">
                  {{ showHour(h - 1) }}{{ h - 1 < store.availableFrom ? ' (next day)' : '' }}
                </option>
              </select>
            </label>
          </div>
          <!-- The day at a glance: filled hours are when the plan may prestige. -->
          <div>
            <div class="flex gap-px" aria-hidden="true">
              <span
                v-for="h in 24"
                :key="h - 1"
                class="h-3 flex-1 rounded-sm"
                :class="hourAwake(h - 1) ? 'bg-indigo-500' : 'bg-slate-200'"
                :title="showHour(h - 1) + (hourAwake(h - 1) ? ': awake' : ': asleep')"
              ></span>
            </div>
            <div class="flex justify-between text-small text-slate-400 mt-0.5">
              <span>{{ showHour(0) }}</span
              ><span>{{ showHour(6) }}</span
              ><span>{{ showHour(12) }}</span
              ><span>{{ showHour(18) }}</span
              ><span>{{ showHour(23) }}</span>
            </div>
          </div>
          <!-- The timezone sentence is gone (UX fluff review 2, S14): the readback under the days names the zone. -->
          <div class="flex flex-wrap gap-1" role="group" aria-label="Days you are awake">
            <button
              v-for="(label, day) in DAY_LABELS"
              :key="day"
              type="button"
              class="min-h-[44px] sm:min-h-0 px-2 py-1 rounded-md text-body font-bold disabled:opacity-50"
              data-testid="setup-day"
              :class="
                store.availableDays.includes(day)
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-200 text-slate-400 hover:text-slate-600'
              "
              @click="toggleDay(day)"
            >
              {{ label }}
            </button>
          </div>
          <!-- Ticked but describing no restriction at all reads as a constraint and isn't one. -->
          <p v-if="store.scheduleIsEmpty" class="text-body font-bold text-amber-700 max-w-prose">
            Every day, all hours: that's no restriction at all, and it's recorded as no schedule.
          </p>
          <p v-else-if="!store.availableDays.length" class="text-body font-bold text-amber-700">
            No days picked. Pick at least one, or nothing can be scheduled.
          </p>
          <p v-else class="text-body text-slate-500">{{ scheduleText(store.availability) }}.</p>
          <!-- Picking hours means the shifts wait for them too (the user, 5 Oct: the hours should be obvious), so
               the old "Hold egg shifts for my hours too" box is gone. Only a run or link saved with it off can
               still be in that state; say so, with a way back. -->
          <p v-if="!store.deferShifts" class="text-body font-bold text-amber-700 max-w-prose">
            This plan was saved with egg shifts not waiting for your awake hours.
            <button type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 underline font-bold" @click="store.deferShifts = true">
              Make them wait too
            </button>
          </p>
        </div>
        <!-- SILO TRICK (Jordan, 10 Nov 2026: "a setting in Setup, off by default"; spec-silotrick): in view, with the hours
             and the shifts they hold, not under More options. The store remembers it with the rest of Setup
             (lib/setupMemory.ts); words lib/siloTrickWords.ts. A link into Setup can land on the box (SetupDock `openSetupAt`). -->
        <div class="border-t border-slate-200 pt-2" data-testid="setup-silo-trick">
          <label class="flex min-h-[44px] items-start gap-3 py-1.5 cursor-pointer">
            <input
              id="your-setup-silo-trick"
              v-model="store.siloTrick"
              type="checkbox"
              class="mt-0.5 h-5 w-5 shrink-0 scroll-mt-4 rounded border-slate-300 text-indigo-600"
              aria-describedby="your-setup-silo-trick-help"
            />
            <span class="text-body font-bold text-slate-800">{{ SILO_TRICK_LABEL }}</span>
          </label>
          <p id="your-setup-silo-trick-help" class="ml-8 text-body text-slate-500 max-w-prose">{{ SILO_TRICK_HELP }}</p>
        </div>
      </fieldset>

      <!-- No prestige days and Time off side by side from md up: with awake hours, the three kinds of "not now". -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- No prestige on these days (search/noPrestige.ts): the second kind of "not now". -->
        <fieldset
          :disabled="locked"
          class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0"
          :class="screen === 'classic' ? 'opacity-60' : ''"
          data-testid="setup-no-prestige-days"
        >
          <TimeOffEditor kind="noPrestige" />
          <p v-if="screen === 'classic'" class="text-body font-bold text-amber-700">
            {{ NAMES.classic }} doesn't plan around no prestige days yet. The searches do.
          </p>
        </fieldset>

        <!-- Time off -->
        <fieldset :disabled="locked" class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0">
          <div id="your-setup-time-off" class="scroll-mt-4"></div>
          <TimeOffEditor />
          <p v-if="screen === 'classic'" class="text-body font-bold text-amber-700 max-w-prose">
            {{ NAMES.classic }} only plans around time off in a plan sent from a search (Simulate this plan on
            {{ fastestName(store.finalTE) }} or {{ NAMES.byDate }}). A route typed in here goes
            straight through it for now.
          </p>
        </fieldset>
      </div>

      <!-- SHARING AND PRIVACY (the simpler page, Jordan 9 Nov 2026, Q3): Help improve the planner and Sharing, with What
           is saved online and the Save online switch, under one closed fold whose line names every setting that sends and
           its state (sharingSummaryWords), so nothing that sends is hidden without being named. The words inside are
           unchanged (lib/aboutPage.spec.ts). A real button over a region hidden until found, as More options. -->
      <button
        v-if="store.submitUrl"
        type="button"
        class="flex w-full min-h-[44px] items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-2 text-left hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        :aria-expanded="sharingOpen"
        aria-controls="setup-sharing-body"
        data-testid="setup-sharing"
        @click="toggleSharing"
      >
        <span aria-hidden="true" class="inline-block text-body text-indigo-700 transition-transform" :class="sharingOpen ? 'rotate-90' : ''">›</span>
        <span class="min-w-0">
          <span class="block text-body font-bold text-indigo-900">{{ SHARING_FOLD_TITLE }}</span>
          <span class="block text-small text-slate-600 break-words" data-testid="setup-sharing-hint">{{ sharingLine }}</span>
        </span>
      </button>
      <div
        id="setup-sharing-body"
        class="grid grid-cols-1 md:grid-cols-2 gap-4"
        :hidden.attr="sharingOpen || !store.submitUrl ? undefined : 'until-found'"
        @beforematch="sharingOpen = true"
      >
        <!-- Help improve the planner (Q13): the study box's answer, changed or withdrawn here once the box above the
             tabs is gone (StudySetup.vue). Only with a collector, as the box. -->
        <StudySetup v-if="store.submitUrl" />

        <!-- Sharing: a mirror of "Share my search results" under a search's result (the same setting,
             composables/useInstantShare.ts; search/instantRecord.ts; was "Keep sharing my checks" until 23 Oct 2026).
             Off by default. Only with a collector. -->
        <div
          v-if="canShareInstant"
          class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0 md:col-span-2"
          data-testid="share-instant"
        >
          <h3 class="text-slate-500 label">Sharing</h3>
          <!-- The tick's label is the consent; what is sent is one tap away, opened in place, word for word (and read
               to a screen reader with the box, aria-describedby, even folded). -->
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="shareInstantOn"
              type="checkbox"
              class="mt-0.5 rounded border-slate-300 text-indigo-600"
              aria-describedby="share-instant-what-body"
            />
            <span class="text-body text-slate-600">
              <span class="font-bold text-slate-800">Share my search results</span>
              (anonymous; helps make the instant answer more accurate).
            </span>
          </label>
          <button
            type="button"
            :class="WHAT_IS_SENT"
            :aria-expanded="whatOpen.instant"
            aria-controls="share-instant-what-body"
            data-testid="share-instant-what"
            @click="whatOpen.instant = !whatOpen.instant"
          >
            What is sent{{ ' ' }}<span aria-hidden="true" class="inline-block transition-transform" :class="whatOpen.instant ? 'rotate-90' : ''">›</span>
          </button>
          <p
            id="share-instant-what-body"
            :hidden.attr="whatOpen.instant ? undefined : 'until-found'"
            class="ml-7 text-body text-slate-600 max-w-prose"
            @beforematch="whatOpen.instant = true"
          >
            After each Fast, Exact or Custom search, at most
            once an hour per save, this browser sends its result's route and times beside the instant answer's for the
            same goal, your TE and Clothed TE, a summary of your gear, your plan start, timezone, save time and
            settings, where your save was loaded from (its claimed and pending TE, eggs and a short code for the
            save), and the app version. It goes
            with this browser's anonymous code for your account, never your player ID or your save. Kept privately by
            the planner's maintainer for 6 months, never shown on the Leaderboard. The same box is under a search's result,
            with "Share this result" for just one.
          </p>
          <!-- "Share my instant baseline with my runs" (the `shareBaseline` consent, lib/instantBaseline.ts): the same
               box as on My runs. -->
          <label class="flex items-start gap-3 cursor-pointer" data-testid="share-baseline">
            <input
              v-model="shareBaselineOn"
              type="checkbox"
              class="mt-0.5 rounded border-slate-300 text-indigo-600"
              aria-describedby="share-baseline-what-body"
            />
            <span class="text-body text-slate-600">
              <span class="font-bold text-slate-800">Share my instant answer with my runs</span>
              (public, with the run).
            </span>
          </label>
          <button
            type="button"
            :class="WHAT_IS_SENT"
            :aria-expanded="whatOpen.baseline"
            aria-controls="share-baseline-what-body"
            data-testid="share-baseline-what"
            @click="whatOpen.baseline = !whatOpen.baseline"
          >
            What is sent{{ ' ' }}<span aria-hidden="true" class="inline-block transition-transform" :class="whatOpen.baseline ? 'rotate-90' : ''">›</span>
          </button>
          <p
            id="share-baseline-what-body"
            :hidden.attr="whatOpen.baseline ? undefined : 'until-found'"
            class="ml-7 text-body text-slate-600 max-w-prose"
            @beforematch="whatOpen.baseline = true"
          >
            Each run you send to the Leaderboard also carries your instant answer for it: the
            route (the stops), the finish date, the TE, and when it was worked out, shown on your public run so others
            can compare. Same rules as sending a run: never your player ID, never your save. The same box is on My runs.
          </p>
          <!-- The long-run alert's off switch (lib/runBeacon.ts): a search estimated at 2 hours or more tells the planner's
               server it started and ended (a random code for that search, its kind, estimate and the page version;
               never the player ID). Its default is in lib/runBeacon.ts; this browser's own. Words: lib/runBeaconWords.ts. -->
          <label class="flex items-start gap-3 cursor-pointer" data-testid="run-beacon">
            <input v-model="runBeaconOn" type="checkbox" class="mt-0.5 rounded border-slate-300 text-indigo-600" />
            <span class="text-body text-slate-600">
              <span class="font-bold text-slate-800">{{ BEACON_SETUP_LABEL }}</span>
            </span>
          </label>
          <p class="ml-7 text-body text-slate-600 max-w-prose" data-testid="run-beacon-line">
            {{ runBeaconOn ? BEACON_SETUP_LINE : BEACON_SETUP_OFF }}
          </p>
          <!-- The three "saved online" notices and the Before you send line, word for word (lib/aboutPage.spec.ts pins them
               to about.html), in one fold that opens in place (UX fluff review 2, 5 Nov 2026). -->
          <button
            type="button"
            class="inline-flex min-h-[44px] items-center gap-1.5 rounded text-left text-body font-bold text-indigo-700 hover:text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            :aria-expanded="savedOnlineOpen"
            aria-controls="setup-saved-online-body"
            data-testid="setup-saved-online"
            @click="savedOnlineOpen = !savedOnlineOpen"
          >
            <span aria-hidden="true" class="inline-block transition-transform" :class="savedOnlineOpen ? 'rotate-90' : ''">›</span>
            <!-- Titled for the switch it sits by, with its on or off (spec-uxpass item 11, 8 Nov 2026). DRAFT. -->
            <span
              >{{ SAVE_ONLINE_FOLD_TITLE }}<span data-testid="setup-saved-online-state"
                >{{ ' · ' }}{{ saveOnlineState ? SAVE_ONLINE_FOLD_ON : SAVE_ONLINE_FOLD_OFF }}</span
              ></span
            >
          </button>
          <div
            id="setup-saved-online-body"
            :hidden.attr="savedOnlineOpen ? undefined : 'until-found'"
            @beforematch="savedOnlineOpen = true"
          >
            <div class="space-y-2">
              <!-- The followed route saved online (lib/followCloud.ts, stores/follow.ts): no choice here, it is how Follow
                   works (Jordan, 23 Oct 2026); about.html says the same. -->
              <p class="text-body text-slate-600 max-w-prose" data-testid="follow-online">
                <span class="font-bold text-slate-800">The route you follow is saved online</span> under a code made from
                your player ID, so another device shows your route when you enter your ID there. Anyone who knows your player
                ID can see it. It holds the route, the goal, when you set it, the awake hours window you used, the time of your save
                and the simulator version: never your player ID or a name. It is saved when you press Follow this route,
                Follow it or Restore.<!-- AUTO_FOLLOW_FIRST (lib/followPolicy.ts): this part goes with the constant. --><span
                  v-if="AUTO_FOLLOW_FIRST"
                  data-testid="follow-online-auto"
                >
                  The first answer for {{ fastestName(store.finalTE) }} and for Egg Day {{ CLOUD_EGG_DAY_YEAR }} becomes the route you follow and is saved online,
                  unless you already follow one; other goals are saved when you press Follow. After that, a better answer only asks you.</span
                >
                The last 5 versions for each goal are kept: open Earlier versions under the route on My runs, Right now, and
                press Restore.
              </p>
              <!-- Your choices and Setup saved online (lib/prefsCloud.ts, stores/prefs.ts); about.html says the same. -->
              <p class="text-body text-slate-600 max-w-prose" data-testid="prefs-online">
                <span class="font-bold text-slate-800">Your choices and Setup are saved online</span>: your consent choices and
                your Setup (awake hours, time off, no prestige days, target TE and time zone) are saved under the same code as
                the route you follow, made from your player ID. Anyone who knows your player ID can read and change them. Never
                the ID itself, and a name only if you chose to be credited by name. The last 5 versions of each are kept, and at
                most 30 changes an hour are saved.
              </p>
              <!-- "Which build is in use" (lib/buildCount.ts): no choice here; Global Privacy Control or Do Not Track turns
                   it off. about.html says the same. -->
              <p class="text-body text-slate-600 max-w-prose" data-testid="build-count">
                <span class="font-bold text-slate-800">The page's version</span> is sent to the planner's server at most once a day:
                just the version, nothing else, so the maintainer knows when old versions are still in use. Global Privacy Control or Do
                Not Track turns it off.
              </p>
              <p class="text-body text-slate-500 max-w-prose">
                Sending a result to the Leaderboard, its CSV and diagnostics are separate choices, in Before you send under Run.
              </p>
            </div>
          </div>
          <!-- Status, not a notice: outside the fold. -->
          <p
            v-if="follows.cloudStatus === 'unreachable'"
            class="text-body text-amber-800"
            role="status"
            data-testid="follow-online-unreachable"
          >
            {{ UNREACHABLE_NOTE }}
          </p>
          <!-- The master Save online switch and Delete everything saved online for this account (lib/saveOnline.ts,
               Jordan 7 Nov 2026). -->
          <SaveOnlineSetup />
        </div>
      </div>

      <!-- More options (UX fluff review 2, 5 Nov 2026; closed by default, lib/panelFold.ts 'setupMore', this browser's
           toggle remembered): what most players leave at its default. Its line names the plan start, the first
           ascension and the workers, and every value inside that isn't its default (lib/setupMore.ts), so a changed
           one is never hidden. A real button over a region hidden until found: find in page opens it, as does a
           link into Setup that lands inside it (reveal, below). -->
      <button
        type="button"
        class="flex w-full min-h-[44px] items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-2 text-left hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        :aria-expanded="moreOpen"
        aria-controls="setup-more-body"
        data-testid="setup-more"
        @click="toggleMore"
      >
        <span aria-hidden="true" class="inline-block text-body text-indigo-700 transition-transform" :class="moreOpen ? 'rotate-90' : ''">›</span>
        <span class="min-w-0">
          <span class="block text-body font-bold text-indigo-900">More options</span>
          <span class="block text-small text-slate-600 tabular-nums break-words" data-testid="setup-more-hint">{{ moreSummary }}</span>
        </span>
      </button>
      <div
        id="setup-more-body"
        ref="moreBody"
        :hidden.attr="moreOpen ? undefined : 'until-found'"
        @beforematch="moreOpen = true"
      >
        <div class="space-y-4">
          <!-- The three cards flow in two balanced columns from md up (CSS columns, each card kept whole), so a card
               opened tall ("Memory · detail kept" in This computer) doesn't leave a blank beside it, as a grid row
               did (26 Oct 2026). One column on a phone, in the same order. The full-width cards follow in a grid. -->
          <div class="-mb-4 md:columns-2 md:gap-4" data-testid="setup-columns">
            <!-- When the plan starts -->
            <fieldset :disabled="locked" class="mb-4 break-inside-avoid rounded-xl border border-slate-200 p-4 space-y-3 min-w-0">
              <h3 class="text-slate-500 label">When the plan starts</h3>
              <SchedulingInputs />
              <!-- An unset start means "now", which moves on every reload, and plan start is part of the
                   run fingerprint: a checkpoint saved before a refresh stops matching. -->
              <p v-if="store.planStartIsNow" class="text-body font-bold text-amber-700 max-w-prose">
                No start set, so the plan is timed from right now, and that moves every time you reload. Set a date and time
                before a long run.
              </p>
              <!-- First ascension: what happens to the ascension you're on. Your plan's A1 dropdown is the same setting
                   ("Continue Asc." / a build for "Prestige Now"), so each changes the other. -->
              <div class="border-t border-slate-100 pt-3 space-y-2" role="radiogroup" aria-label="First ascension">
                <h3 class="text-slate-500 label">First ascension</h3>
                <!-- One 44 px row each, a clause on Soonest only (UX fluff review 2, S12; search/firstAscensionWords.ts). -->
                <label
                  v-for="c in FIRST_ASCENSION_CHOICES"
                  :key="c.value"
                  class="flex min-h-[44px] items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer"
                  :class="firstChoice === c.value ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200'"
                >
                  <input v-model="firstChoice" type="radio" :value="c.value" class="mt-0.5 text-indigo-600" />
                  <span class="text-body text-slate-600">
                    <span class="font-bold text-slate-800">{{ c.label }}</span><template v-if="c.blurb">{{ ' ' }}<span class="text-slate-500">{{ c.blurb }}</span></template>
                  </span>
                </label>
                <p v-if="store.firstAscensionFromClassic" class="text-body text-slate-500 max-w-prose">
                  Set from A1's dropdown in {{ NAMES.classic }} ({{ FIRST_ASCENSION_WORDS[store.firstAscensionFromClassic] }}).
                  Choosing here changes it there too.
                </p>
                <p v-if="startTooFar" class="text-body font-bold text-amber-700 max-w-prose">
                  The plan starts more than an hour from now, so there's no current ascension to continue then: the first
                  ascension starts fresh, as in {{ NAMES.classic }}.
                </p>
              </div>
            </fieldset>

            <!-- Your save file: Load a save file with its warning, and what the plan starts from. -->
            <div class="mb-4 break-inside-avoid rounded-xl border border-slate-200 p-4 space-y-2">
              <h3 class="text-slate-500 label">Your save file</h3>
              <!-- A save kept as a file ("Download this save" on a saved answer or run) back as the active save. -->
              <SaveFileBar v-if="initialState.playerId" :player-id="initialState.playerId" />
              <!-- What the plan starts from, besides the artifacts: leg 1 continues an already-built farm,
                   and every later leg funds its own research out of earnings. -->
              <dl class="grid grid-cols-2 gap-3 text-body break-words border-t border-slate-100 pt-3">
                <div>
                  <dt class="text-slate-400 label">Soul eggs</dt>
                  <dd class="font-bold" :class="store.setupFacts.soulEggs > 0 ? 'text-slate-700' : 'text-rose-700'">
                    {{ formatSoulEggs(store.setupFacts.soulEggs) }}
                  </dd>
                </div>
                <!-- Both, side by side: a reported failure was exactly these two disagreeing. -->
                <div>
                  <dt class="text-slate-400 label">Starting TE</dt>
                  <dd
                    class="font-bold"
                    :class="
                      Math.abs(store.setupFacts.currentTE - store.setupFacts.backupTE) > 3
                        ? 'text-rose-700'
                        : 'text-slate-700'
                    "
                  >
                    {{ store.setupFacts.currentTE }}
                    <span class="font-normal text-slate-400">· save says {{ store.setupFacts.backupTE }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-slate-400 label">Epic research</dt>
                  <dd class="font-bold text-slate-700">
                    {{ store.setupFacts.epicAtMax }} / {{ store.setupFacts.epicTotal }} maxed
                  </dd>
                </div>
                <div>
                  <dt class="text-slate-400 label">Colleggtibles</dt>
                  <dd class="font-bold text-slate-700">{{ store.setupFacts.colleggtibles }}</dd>
                </div>
              </dl>
            </div>

            <!-- This computer -->
            <div
              class="mb-4 break-inside-avoid rounded-xl border border-slate-200 p-4 space-y-3 min-w-0"
              :class="screen === 'classic' ? 'opacity-60' : ''"
              data-testid="setup-this-computer"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-slate-500 label">{{ ThisDevice() }}</h3>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="p in PROFILES"
                    :key="p.id"
                    type="button"
                    :disabled="store.isRunning"
                    class="min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-md border text-body font-bold disabled:opacity-40"
                    data-testid="setup-profile"
                    :class="
                      activeProfile === p.id
                        ? 'border-slate-800 bg-slate-800 text-white'
                        : 'border-slate-200 text-slate-500 hover:text-slate-700'
                    "
                    :title="p.blurb"
                    @click="applyProfile(p.id)"
                  >
                    {{ p.label }}
                  </button>
                </div>
              </div>
              <p v-if="screen === 'classic'" class="text-body font-bold text-amber-700">
                Not used by {{ NAMES.classic }}: it builds one plan, no search.
              </p>
              <WorkerSlider />
              <BackgroundSpeed />
              <label class="flex items-start gap-3 cursor-pointer">
                <input v-model="store.keepAwake" type="checkbox" class="mt-0.5 rounded border-slate-300 text-indigo-600" />
                <span class="text-body text-slate-600">
                  <!-- The label and one clause (UX fluff review 2, S28; DRAFT). It was: "If it sleeps, every worker freezes
                       until you wake it. It can't stop a laptop sleeping when the lid is closed." -->
                  <span class="font-bold text-slate-800">Keep my computer awake while a search runs</span>{{ ' ' }}(not with the lid closed)
                </span>
              </label>
              <label class="flex items-start gap-3 cursor-pointer" data-testid="instant-during-search">
                <input
                  v-model="instantDuringSearch"
                  type="checkbox"
                  class="mt-0.5 rounded border-slate-300 text-indigo-600"
                />
                <span class="text-body text-slate-600">
                  <span class="font-bold text-slate-800">Let the instant answer run during a search.</span> It uses more
                  memory, so a big run could crash. Unticked, it warns you first.
                </span>
              </label>

              <details class="rounded-lg border border-dashed border-slate-200 px-3 py-2" @toggle="onAdvanced">
                <summary class="cursor-pointer text-body font-bold text-slate-500">
                  Memory · detail kept for
                  {{ store.legDetailBudget ? store.legDetailBudget.toLocaleString() : 'all' }} routes
                </summary>
                <div class="mt-3 space-y-3">
                  <dl class="grid grid-cols-2 gap-3 text-body break-words">
                    <div>
                      <dt class="text-slate-400 label">Logical cores</dt>
                      <dd class="font-bold text-slate-700">{{ store.machineThreads }}</dd>
                    </div>
                    <div>
                      <dt class="text-slate-400 label">Reported RAM</dt>
                      <dd class="font-bold text-slate-700">{{ deviceMemoryLabel }}</dd>
                    </div>
                    <div>
                      <dt class="text-slate-400 label">Tab heap limit</dt>
                      <dd class="font-bold text-slate-700">{{ heapLimitMb || 'not reported' }}</dd>
                    </div>
                    <div>
                      <dt class="text-slate-400 label">Heap in use</dt>
                      <dd class="font-bold text-slate-700">{{ heapUsedMb || 'not reported' }}</dd>
                    </div>
                  </dl>
                  <p class="text-body text-slate-500 max-w-prose">
                    Cores is the only hardware figure a web page gets accurately. Reported RAM is rounded and capped by the
                    browser on purpose, which is why the worker count is yours to choose rather than detected.
                  </p>
                  <label class="block space-y-1">
                    <span class="text-slate-400 label"
                      >Keep per-ascension detail for</span
                    >
                    <span class="flex flex-wrap items-center gap-2">
                      <input
                        v-model.number="store.legDetailBudget"
                        type="number"
                        min="0"
                        step="500"
                        class="w-32 min-w-0 max-w-full rounded-lg border-slate-200 text-body font-bold text-slate-800"
                      />
                      <span class="text-small font-bold text-slate-500">fastest routes</span>
                    </span>
                  </label>
                  <p class="text-body text-slate-500 max-w-prose">
                    Holding detail for
                    <span class="font-bold text-slate-700">{{ store.legsHeld.toLocaleString() }}</span> routes ({{
                      heldMb
                    }}). Every route keeps its total time whatever this says; past this number, the ones that didn't win
                    lose the per-ascension timings the runners-up table opens.
                    <span class="font-bold text-slate-700">0 keeps everything</span>, which on a run of hundreds of
                    thousands of routes is how a tab gets killed overnight.
                  </p>
                  <p
                    v-if="spillLine"
                    class="text-body"
                    :class="spillLine.warn ? 'font-bold text-amber-700' : 'text-slate-500'"
                    data-testid="leg-spill-note"
                  >
                    {{ spillLine.text }}
                  </p>
                </div>
              </details>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- What artifacts it will use: the same on every screen. -->
            <div class="rounded-xl border border-slate-200 p-4 min-w-0 md:col-span-2">
              <SimulationSetup />
            </div>

            <!-- Experimental: off for players until there is data to back it, on by default on the beta site (composables/usePrestigeBy.ts). -->
            <div class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0 md:col-span-2" data-testid="experimental">
              <h3 class="text-slate-500 label">Experimental</h3>
              <label class="flex items-start gap-3 cursor-pointer">
                <input
                  v-model="prestigeBy.stored.value"
                  type="checkbox"
                  class="mt-0.5 rounded border-slate-300 text-indigo-600"
                  data-testid="prestige-by-box"
                />
                <span class="text-body text-slate-600">
                  <span class="font-bold text-slate-800">Prestige by…</span> A line under the instant answer saying how long
                  your next prestige can wait before the answer gets worse, and what it gets after that. Still being
                  checked, so it can be wrong.
                  <template v-if="prestigeBy.beta"> On by default on the beta site; untick it to hide it.</template>
                  <template v-if="prestigeBy.fromUrl !== null">
                    This visit's address turns it {{ prestigeBy.fromUrl ? 'on' : 'off' }} whatever this box says.</template
                  >
                </span>
              </label>
              <label v-if="canShareInstant && prestigeBy.enabled.value" class="flex items-start gap-3 cursor-pointer ml-6">
                <input
                  v-model="prestigeBy.record.value"
                  type="checkbox"
                  class="mt-0.5 rounded border-slate-300 text-indigo-600"
                  data-testid="prestige-by-record"
                />
                <span class="text-body text-slate-600">
                  <span class="font-bold text-slate-800">Include it in results I share</span>, so it can be checked against
                  what happens. Only with "Share this result" ticked; nothing more is sent than the prediction itself.
                </span>
              </label>
            </div>

            <!-- How the site shows things -->
            <div class="rounded-xl border border-slate-200 p-4 space-y-3 min-w-0 md:col-span-2">
              <h3 class="text-slate-500 label">How the site shows things</h3>
              <DateStyleToggle />
              <TabsToggle />
              <!-- Show everything (the simpler page, Jordan 9 Nov 2026, Q7): every screen's More starts open, as the page
                   was before; this browser's (composables/useShowEverything.ts). Nothing on the default view. -->
              <label class="flex min-h-[44px] items-start gap-3 py-1.5 cursor-pointer" data-testid="setup-show-everything">
                <input
                  type="checkbox"
                  class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-indigo-600"
                  :checked="showEverything"
                  @change="setShowEverything(($event.target as HTMLInputElement).checked)"
                />
                <span class="text-body text-slate-600">
                  <span class="font-bold text-slate-800">{{ SHOW_EVERYTHING_LABEL }}</span>{{ ' ' }}· {{ SHOW_EVERYTHING_LINE }}
                </span>
              </label>
              <!-- The first-visit tour again (spec-firsttour): Setup closes first, as the tour waits while it is open. -->
              <button
                type="button"
                class="inline-flex min-h-[44px] items-center text-body font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                :disabled="store.isRunning"
                data-testid="setup-tour-replay"
                @click="replayTour"
              >
                {{ FIRST_TOUR_REPLAY }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { consentState, useConsent } from '@/composables/useConsent';
import { ThisDevice, thisDevice } from '@/search/device';
import { spillNote } from '@/lib/legSpillText';
import SaveFileBar from './SaveFileBar.vue';
import AutoSaveStrip from './AutoSaveStrip.vue';
import TabsToggle from './TabsToggle.vue';
import { useShowEverything } from '@/composables/useShowEverything';
import { SHARING_FOLD_TITLE, SHOW_EVERYTHING_LABEL, SHOW_EVERYTHING_LINE, sharingSummaryWords } from '@/lib/layoutWords';
import { studyState } from '@/composables/useStudy';
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { DEFAULT_LEG_DETAIL_BUDGET, useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';
import { NAMES, type AutoView, fastestName } from '@/lib/siteNav';
import { dateStyle, showDateTime, showHour, showSchedule as scheduleText } from '@/lib/displayTime';
import { foldOpen, readFoldToggle, rememberFoldToggle } from '@/lib/panelFold';
import { setupMoreSummary } from '@/lib/setupMore';
import { useTabPrefs } from '@/composables/useTabPrefs';
import { usableTimeOff } from '@/search/timeOff';
import { useInstantDuringSearch } from '@/composables/useInstantDuringSearch';
import { runBeaconSwitch } from '@/lib/runBeacon';
import { BEACON_SETUP_LABEL, BEACON_SETUP_LINE, BEACON_SETUP_OFF } from '@/lib/runBeaconWords';
import { useInstantShare } from '@/composables/useInstantShare';
import { usePrestigeBy } from '@/composables/usePrestigeBy';
import { instantUrlOf } from '@/search/instantRecord';
import { useFollowStore } from '@/stores/follow';
import { CLOUD_EGG_DAY_YEAR, UNREACHABLE_NOTE } from '@/lib/followCloud';
import { AUTO_FOLLOW_FIRST } from '@/lib/followPolicy';
import { ageAgo } from '@/lib/saveAge';
import { FIRST_ASCENSION_WORDS, type FirstAscension } from '@/search/firstAscension';
import { FIRST_ASCENSION_CHOICES } from '@/search/firstAscensionWords';
import SchedulingInputs from './SchedulingInputs.vue';
import TimeOffEditor from './TimeOffEditor.vue';
import WorkerSlider from './WorkerSlider.vue';
import BackgroundSpeed from './BackgroundSpeed.vue';
import DateStyleToggle from './DateStyleToggle.vue';
import SimulationSetup from './SimulationSetup.vue';
import StudySetup from './StudySetup.vue';
import SaveOnlineSetup from './SaveOnlineSetup.vue';
import { saveOnlineOn } from '@/lib/saveOnline';
import { askTourReplay } from '@/composables/useFirstTour';
import { FIRST_TOUR_REPLAY } from '@/lib/firstTourWords';
import { SAVE_ONLINE_FOLD_OFF, SAVE_ONLINE_FOLD_ON, SAVE_ONLINE_FOLD_TITLE } from '@/lib/saveOnlineWords';
import { SILO_TRICK_HELP, SILO_TRICK_LABEL } from '@/lib/siloTrickWords';

/** What is remembered and what Reset does, as Reset's title (UX fluff review 2, S3; DRAFT): the line itself is short. */
const REMEMBERED_TITLE =
  'Remembered: your awake hours (and whether shifts wait for them), time off, no prestige days and first ascension. Reset to defaults: any hour, no time off or no prestige days, first ascension Soonest.';

defineProps<{
  screen: AutoView;
  /** The full setup, in the floating panel (SetupDock.vue); without it, the one-line bar. */
  docked?: boolean;
  /** Only the save's problems (nothing when there are none), for screens whose way into the setup is
   *  the floating Setup button. */
  issuesOnly?: boolean;
}>();

const store = useChainSearchStore();
const instantDuringSearch = useInstantDuringSearch();
/** The long-run alert's switch (lib/runBeacon.ts), this browser's. */
const runBeaconOn = runBeaconSwitch();
/** "Share my search results" (mirrors the box under a search's result): only where a collector is configured to take them. */
const { on: shareInstantOn } = useInstantShare();
/** "Share my instant baseline with my runs" (composables/useConsent.ts `shareBaseline`). */
const { agreed: shareBaselineOn } = useConsent('shareBaseline');
const canShareInstant = !!instantUrlOf(store.submitUrl);
/** The followed route saved online: Sharing's note when it couldn't be read on load. */
const follows = useFollowStore();
/** Experimental: the "Prestige by" line (?prestigeBy=1 for one visit, or this box). */
const prestigeBy = usePrestigeBy();
// Choosing "Let me pick my hours" holds the egg shifts for those hours as well. The player's choosing only:
// `sync`, so a restore (a carry-on's settings, the remembered setup with hold shifts off) is seen as one and
// left as it was put back (stores/chainSearch.ts `setupMuted`).
watch(
  () => store.scheduleEnabled,
  on => {
    if (on && !store.setupMuted()) store.deferShifts = true;
  },
  { flush: 'sync' }
);
const planner = useAutoPlannerStore();
const initialState = useInitialStateStore();
const ui = useUIStore();
/** Change player: Setup closes, the player ID box at the top opens (the save line's Close folds it again), focused. */
function changePlayer(): void {
  ui.setupOpen = false;
  ui.isHeaderCollapsed = false;
  // Kept open through the page's own folds until the save line's Close player box (or a new save) folds it.
  ui.setHeaderKeptOpen(true);
  void nextTick(() => {
    const box = document.getElementById('playerId') as HTMLInputElement | null;
    box?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    box?.focus();
    box?.select?.();
  });
}
/** Setup's "Show the tour again": Setup closes, then the first-visit tour starts (it waits while Setup is open). */
function replayTour(): void {
  ui.setupOpen = false;
  askTourReplay();
}

const locked = computed(() => store.busy);

/** More options: closed by default, this browser's own toggle remembered (lib/panelFold.ts 'setupMore'). An open
 *  made by the page (find in page) is not remembered, as in PanelFold.vue. */
const moreOpen = ref(foldOpen('setupMore', { remembered: readFoldToggle('setupMore') }));
function toggleMore(): void {
  moreOpen.value = !moreOpen.value;
  rememberFoldToggle('setupMore', moreOpen.value);
}
const moreBody = ref<HTMLElement | null>(null);
/** A link into Setup (SetupDock.vue's openSetupRequested): bring the option with this id into view, opening More
 *  options first when it is inside (not remembered as the player's toggle), so a link never lands on a folded part. */
async function reveal(id: string): Promise<void> {
  await nextTick();
  const el = document.getElementById(id);
  if (!el) return;
  if (!moreOpen.value && moreBody.value?.contains(el)) {
    moreOpen.value = true;
    await nextTick();
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // A box (the Silo trick) takes the focus too, so the keyboard lands on it; a section (Time off) does not.
  if (el.tagName === 'INPUT') (el as HTMLInputElement).focus({ preventScroll: true });
}
defineExpose({ reveal });
/** Sharing's folds, closed on each visit: what each tick sends, and the "saved online" notices. */
const whatOpen = reactive({ instant: false, baseline: false });
const savedOnlineOpen = ref(false);
/** The master Save online switch (lib/saveOnline.ts, shared with SaveOnlineSetup.vue): the fold's title says on or off. */
const saveOnlineState = computed(() => saveOnlineOn());
const WHAT_IS_SENT =
  'ml-7 inline-flex min-h-[44px] items-center gap-1 rounded text-body font-bold text-indigo-700 underline hover:text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
/** When the remembered setup was last written, for the "Remembered for this account" line. */
const rememberedWhen = computed(() => {
  const at = store.setupRemembered?.at;
  return at ? showDateTime(at / 1000, zone.value) : '';
});
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
/** Whether the plan may prestige in this hour of the day: from-hour inclusive, to-hour exclusive,
 *  wrapping past midnight, and equal ends meaning all day (search/availability.ts). */
function hourAwake(h: number): boolean {
  const from = store.availableFrom;
  const to = store.availableTo;
  if (from === to) return true;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

const startLabel = computed(() => (store.planStartIsNow ? 'now (not set)' : showDateTime(store.planStart, zone.value)));
const awakeLabel = computed(() =>
  store.scheduleEnabled && !store.scheduleIsEmpty ? scheduleText(store.availability) : 'any hour'
);
const timeOffCount = computed(() => usableTimeOff(store.timeOff).length);
const noPrestigeCount = computed(() => usableTimeOff(store.noPrestige).length);

/** Your setup's First ascension, which also sets A1's pick in Your plan (store `setFirstAscension`). */
const firstChoice = computed<FirstAscension>({
  get: () => store.firstAscension,
  set: v => store.setFirstAscension(v, { rebuildClassic: true }),
});
const firstLabel = computed(
  () => FIRST_ASCENSION_CHOICES.find(c => c.value === store.firstAscension)?.label.replace(' (default)', '') ?? ''
);
/** Classic offers continue only for a plan starting within an hour of now; the search follows it. */
/** The More options line (lib/setupMore.ts): the plan start, first ascension and workers, and whatever else in there
 *  isn't its default. */
const { prefs: tabPrefs } = useTabPrefs(() => !!store.submitUrl);
/** 18 March 2027, 13:15 here, as DateStyleToggle.vue shows it. */
const DATE_SAMPLE = new Date(2027, 2, 18, 13, 15).getTime() / 1000;
const moreSummary = computed(() =>
  setupMoreSummary({
    planStart: startLabel.value,
    firstAscension: firstLabel.value,
    workers: store.workerBudget,
    threads: store.machineThreads,
    keepAwake: store.keepAwake,
    instantDuringSearch: instantDuringSearch.value,
    backgroundWorkers: store.backgroundWorkers < store.workerBudget ? store.backgroundWorkers : 0,
    legDetail: store.legDetailBudget,
    legDetailDefault: DEFAULT_LEG_DETAIL_BUDGET,
    isoDates: dateStyle.value === 'iso' ? showDateTime(DATE_SAMPLE, zone.value, 'iso') : null,
    leaderboardTab: !!store.submitUrl && tabPrefs.value.leaderboard,
    scienceTab: !!store.submitUrl && tabPrefs.value.science,
    prestigeBy: prestigeBy.stored.value,
    prestigeByDefault: prestigeBy.beta,
    prestigeByRecord: canShareInstant && prestigeBy.record.value,
  }) + (showEverything.value ? ` · ${SHOW_EVERYTHING_LABEL}` : '')
);
/** Show everything (Setup › More options; the simpler page): named in More options' line when on. */
const { on: showEverything, set: setShowEverything } = useShowEverything();
/** Sharing and privacy: closed by default, this browser's own toggle remembered (lib/panelFold.ts 'setupSharing'). */
const sharingOpen = ref(foldOpen('setupSharing', { remembered: readFoldToggle('setupSharing') }));
function toggleSharing(): void {
  sharingOpen.value = !sharingOpen.value;
  rememberFoldToggle('setupSharing', sharingOpen.value);
}
/** Its line: every setting in it that sends, and its state (Words' sharingSummaryWords, with the two share ticks when the account can share). */
const sharingLine = computed(() => {
  const rec = studyState.rec;
  const help = rec.answer === null ? 'none' : rec.answer === 'yes' && rec.accounts[consentState.hash] === 'yes' ? 'yes' : 'no';
  return sharingSummaryWords({
    help,
    longSearches: !!runBeaconOn.value,
    saveOnline: !!saveOnlineState.value,
    ...(canShareInstant ? { searchResults: !!shareInstantOn.value, instantWithRuns: !!shareBaselineOn.value } : {}),
  });
});
const startTooFar = computed(
  () => store.firstAscension !== 'fresh' && store.firstAscensionFor(store.planStart) === 'fresh'
);

const saveAgeLabel = computed(() => {
  const at = initialState.rawBackup?.approxTime;
  if (!at) return 'No save loaded yet.';
  // The one save age on Setup (lib/saveAge.ts `ageAgo`, the style every save-age line uses).
  return `Save from ${ageAgo(Math.max(0, Date.now() / 1000 - at))} (${showDateTime(at, zone.value)}).`;
});

/** Problems with the save, under its line. Not the save-age note while More options is open: Start time, in it,
 *  already says exactly that. With More options closed, all of them, since Start time is hidden then. */
const saveCardIssues = computed(() =>
  moreOpen.value ? store.setupIssues.filter(i => i.kind !== 'save-past-silos') : store.setupIssues
);

/** Soul eggs run to 1e21 and beyond: the same short-scale suffixes the rest of the app uses. */
function formatSoulEggs(n: number): string {
  if (!(n > 0)) return 'none, so the farm cannot buy anything';
  const units = ['', 'K', 'M', 'B', 'T', 'q', 'Q', 's', 'S', 'o', 'N', 'd', 'U'];
  const tier = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
  return `${(n / 10 ** (tier * 3)).toFixed(2)}${units[tier]}`;
}

/** Sunday-first, matching `availableDays`, which stores JS `getDay()` numbers. */
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
function toggleDay(day: number): void {
  // In place (other panels read `availableDays`) and kept sorted, as Chain Search always kept it,
  // so the same days always make the same schedule, and the same run fingerprint.
  const days = store.availableDays;
  const i = days.indexOf(day);
  if (i === -1) days.push(day);
  else days.splice(i, 1);
  days.sort((a, b) => a - b);
}

/**
 * Presets, because the real question is what the computer is FOR right now: the same 20-core box
 * wants a quarter of itself while someone's using it and all of itself overnight. Three named
 * answers beat two numbers nobody knows how to set; the numbers stay editable underneath.
 */
const PROFILES = [
  {
    id: 'background',
    label: 'Background',
    blurb: 'A quarter of your cores and a small cache. For running while you use the computer.',
    workers: () => Math.max(1, Math.floor(store.machineThreads / 4)),
    legDetail: 1000,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Every core but one, so the tab stays responsive.',
    workers: () => Math.max(1, store.machineThreads - 1),
    legDetail: 2000,
  },
  {
    id: 'overnight',
    label: 'Overnight',
    blurb: "Every core, and detail kept for far more routes. For a computer you're done using.",
    workers: () => store.machineThreads,
    legDetail: 20000,
  },
] as const;
type ProfileId = (typeof PROFILES)[number]['id'];
const activeProfile = computed<ProfileId | ''>(
  () => PROFILES.find(p => p.workers() === store.workerBudget && p.legDetail === store.legDetailBudget)?.id ?? ''
);
function applyProfile(id: ProfileId): void {
  const p = PROFILES.find(x => x.id === id);
  if (!p) return;
  store.setWorkersByHand(p.workers());
  store.legDetailBudget = p.legDetail;
}

/**
 * Heap readout, where the browser offers one (Chromium's non-standard `performance.memory`, and
 * quantised: a gauge, not an accounting record). Read only while Advanced is open.
 */
const heap = ref<{ used: number; limit: number } | null>(null);
let heapTimer: ReturnType<typeof setInterval> | null = null;
function readHeap(): void {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  heap.value = m ? { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit } : null;
}
function onAdvanced(e: Event): void {
  const isOpen = (e.target as HTMLDetailsElement).open;
  if (heapTimer) clearInterval(heapTimer);
  heapTimer = null;
  if (isOpen) {
    readHeap();
    heapTimer = setInterval(readHeap, 5000);
  }
}
onUnmounted(() => heapTimer && clearInterval(heapTimer));
/** The downloaded CSV's detail on disk (lib/legSpillText.ts `spillNote`). */
const spillLine = computed(() => spillNote(store.legSpillInfo, thisDevice(), store.legDetailBudget));
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(0)} MB`;
const heldMb = computed(() => mb(store.legDetailBytes));
const heapUsedMb = computed(() => (heap.value ? mb(heap.value.used) : ''));
const heapLimitMb = computed(() => (heap.value ? mb(heap.value.limit) : ''));
/** `navigator.deviceMemory`: rounded to a power of two and capped at a ceiling the browser picks. */
const deviceMemoryLabel = computed(() => {
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return gb ? `${gb} GB or more` : 'not reported';
});
</script>
