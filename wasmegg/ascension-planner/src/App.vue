<template>
  <the-nav-bar active-entry-id="ascension-planner" />

  <div
    :class="[
      'min-h-screen bg-gray-100 transition-all duration-300',
      plannerTab === 'automatic' || isFooterCollapsed ? 'pb-8' : 'pb-24',
    ]"
  >
    <div class="max-w-6xl mx-auto p-4">
      <CustomEggWatcher v-if="isDev" />

      <!-- A tab left open through a deploy keeps running the old code; see useNewVersion. -->
      <NewVersionBanner
        page-url="./"
        entry="index"
        note="save your results first (Save this run, Save the file instead, or Download CSV) so nothing is lost; a search that is still running picks up from its checkpoint after the reload"
        class="mb-4"
      />
      <!-- A blocked account says so the moment its save loads, not after the form is filled in. -->
      <IntegrityAlert />

      <!-- Collapsible Header Region -->
      <div class="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-100 shadow-sm">
        <div
          class="grid transition-all duration-500 ease-in-out"
          :class="isHeaderCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'"
        >
          <div class="overflow-hidden">
            <h1 class="mx-4 mt-8 mb-2 text-center heading-xl text-gradient">
              {{ pageTitle }}
            </h1>
            <div
              v-if="initialStateStore.hasData && lastBackupFormatted"
              class="text-center text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-4 -mt-1"
            >
              Player Backup From: {{ lastBackupFormatted }}
            </div>

            <the-player-id-form :player-id="playerId" @submit="submitPlayerId" />

            <!-- The tabs, where they always were: under the player ID. -->
            <SiteTabs
              v-if="playerId && !isHeaderCollapsed"
              class="mt-6"
              :tabs="topTabs"
              :current="plannerTab"
              :show-guide-link="!showGuide"
              @select="selectSection"
              @guide="showGuide = true"
            />

            <!-- Plan Library Section -->
            <div v-if="playerId && plannerTab === 'manual'" class="max-w-6xl mx-auto mt-6">
              <PlanLibrary @plan-loaded="handlePlanLoaded" />
            </div>

            <!-- Ascension Action Buttons -->
            <div
              v-if="plannerTab === 'manual'"
              class="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-3 max-w-6xl mx-auto"
            >
              <!-- Start from Scratch -->
              <div class="section-premium p-5 flex flex-col items-center text-center group relative overflow-hidden">
                <div
                  class="absolute -right-6 -top-6 w-20 h-20 bg-red-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"
                ></div>
                <div class="relative z-10 flex flex-col items-center gap-3 flex-1">
                  <div class="p-2.5 bg-red-50 rounded-xl">
                    <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-bold text-slate-800">Start from Scratch</div>
                    <p class="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1.5 leading-relaxed">
                      Clear your entire plan, reset all settings, and begin with a clean slate
                    </p>
                  </div>
                  <button
                    class="btn-premium btn-primary px-5 py-2 mt-auto w-full"
                    @click="confirmUnsavedChanges(startFromScratch)"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <!-- Plan Next Ascension -->
              <div
                class="section-premium p-5 flex flex-col items-center text-center group relative overflow-hidden border-brand-primary/30"
              >
                <div
                  class="absolute -right-6 -top-6 w-20 h-20 bg-brand-primary/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"
                ></div>
                <div class="relative z-10 flex flex-col items-center gap-3 flex-1">
                  <div class="p-2.5 bg-brand-primary/10 rounded-xl">
                    <svg class="w-6 h-6 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                      />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-bold text-slate-800">Plan Future Ascension</div>
                    <p class="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1.5 leading-relaxed">
                      Load your latest backup, include pending TE, reset the clock, and start planning fresh
                    </p>
                  </div>
                  <button
                    class="btn-premium btn-primary px-5 py-2 mt-auto w-full"
                    :disabled="loading || !playerId"
                    @click="confirmUnsavedChanges(planNextAscension)"
                  >
                    Plan
                  </button>
                </div>
              </div>

              <!-- Continue Current Ascension -->
              <div class="section-premium p-5 flex flex-col items-center text-center group relative overflow-hidden">
                <div
                  class="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"
                ></div>
                <div class="relative z-10 flex flex-col items-center gap-3 flex-1">
                  <div class="p-2.5 bg-blue-50 rounded-xl">
                    <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 5l7 7-7 7M5 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-bold text-slate-800">Continue Current Ascension</div>
                    <p class="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1.5 leading-relaxed">
                      Resume from your current in-game farm with all events applied
                    </p>
                  </div>
                  <button
                    class="btn-premium btn-primary px-5 py-2 mt-auto w-full"
                    :disabled="loading || !playerId"
                    @click="confirmUnsavedChanges(triggerQuickContinue)"
                  >
                    Continue
                  </button>
                </div>
              </div>

              <!-- Reconcile Plan -->
              <div class="section-premium p-5 flex flex-col items-center text-center group relative overflow-hidden">
                <div
                  class="absolute -right-6 -top-6 w-20 h-20 bg-emerald-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"
                ></div>
                <div class="relative z-10 flex flex-col items-center gap-3 flex-1">
                  <div class="p-2.5 bg-emerald-50 rounded-xl">
                    <svg class="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                      />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-bold text-slate-800">Reconcile Plan</div>
                    <p class="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1.5 leading-relaxed">
                      Load a plan and compare against your current farm to track progress
                    </p>
                  </div>

                  <button
                    class="btn-premium btn-primary px-5 py-2 mt-auto w-full"
                    :disabled="loading || !playerId"
                    @click="confirmUnsavedChanges(triggerReconcile)"
                  >
                    Reconcile
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Header Toggle Tab (PlanFinalSummary style) - normal flow, centered below card -->
      <div v-if="playerId" class="flex justify-center -mt-px mb-2">
        <button
          class="bg-white/95 backdrop-blur-xl border border-t-0 border-slate-100 px-4 py-1 rounded-b-lg shadow-sm text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider h-7 cursor-pointer"
          @click="isHeaderCollapsed = !isHeaderCollapsed"
        >
          <svg
            class="w-3.5 h-3.5 transition-transform duration-300"
            :class="{ 'rotate-180': isHeaderCollapsed }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      <!-- The site's tabs (lib/siteNav.ts has the names and addresses). Outside the header, which
           folds away on the Auto Planner: the tabs are how you get anywhere, so they never hide. -->
      <!-- The search that's running, on every tab but its own (RunProgressBar.vue), so looking at
           the leaderboard or Classic mid-run doesn't mean losing sight of it or its Stop. -->
      <RunProgressBar v-if="showRunBar" class="mt-4" @show="showRun" />
      <!-- A Science sweep, run in place (SweepRunner.vue): a window over the page, so the figures and
           Start sit where the sweep was clicked rather than on another screen. -->
      <SweepRunner
        v-if="uiStore.scienceSweep"
        :key="sweepKey(uiStore.scienceSweep)"
        :request="uiStore.scienceSweep"
        :player-id="playerId"
        :prepare="prepareAutoPlanner"
        @show-result="showSweepResult"
      />

      <nav v-if="playerId" class="mt-4 space-y-3" aria-label="Site">
        <!-- The header (with the tabs in it) folds away on the Auto Planner: the same tabs here then. -->
        <SiteTabs
          v-if="isHeaderCollapsed"
          :tabs="topTabs"
          :current="plannerTab"
          :show-guide-link="!showGuide"
          @select="selectSection"
          @guide="showGuide = true"
        />

        <template v-if="plannerTab === 'automatic'">
          <div class="flex justify-center">
            <div class="flex flex-wrap justify-center gap-1 border-b border-slate-200">
              <button
                v-for="v in autoTabs"
                :key="v.id"
                type="button"
                class="px-4 py-2 -mb-px border-b-2 text-[11px] font-black uppercase tracking-widest"
                :class="
                  autoView === v.id
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                "
                @click="onAutoTab(v.id)"
              >
                {{ v.label }}
                <span
                  v-if="
                    activeScreen &&
                    (v.id === 'by-date'
                      ? activeScreen === 'by-date'
                      : v.id === 'fastest' && (activeScreen === 'smart' || activeScreen === 'full'))
                  "
                  class="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-indigo-600 align-middle"
                  title="A search is running here"
                ></span>
              </button>
            </div>
          </div>
        </template>

        <div v-else-if="plannerTab === 'science'" class="flex justify-center">
          <div class="flex flex-wrap justify-center gap-1 border-b border-slate-200">
            <button
              v-for="v in scienceTabs"
              :key="v.id"
              type="button"
              class="px-4 py-2 -mb-px border-b-2 text-[11px] font-black uppercase tracking-widest"
              :class="
                scienceView === v.id
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              "
              @click="scienceView = v.id"
            >
              {{ v.label }}
            </button>
          </div>
        </div>
      </nav>

      <!-- The new layout explained once, for players who knew the old one (dismissed for good). -->
      <NewLayoutGuide v-if="playerId && showGuide" class="mt-4" @close="closeGuide" />

      <!-- Current Mode Label -->
      <div v-if="plannerTab === 'manual' && plannerModeLabel" class="mt-4 flex justify-center">
        <span class="text-sm font-bold text-slate-700">{{ plannerModeLabel }}</span>
      </div>

      <!-- Reconciliation Status Banner -->
      <div v-if="actionsStore.isReconciling" class="mt-4 flex flex-col items-center gap-2">
        <div
          class="w-full max-w-sm bg-gradient-to-r from-emerald-50/80 via-white to-green-50/80 rounded-2xl p-4 border border-emerald-100/50 shadow-sm relative overflow-hidden flex items-center justify-between transition-all duration-300"
        >
          <div class="flex items-center gap-3 relative z-10">
            <!-- Icon/Status -->
            <div
              class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <div class="flex flex-col gap-0 text-left">
              <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5"
                >Reconciliation Mode</span
              >
              <span class="text-[10px] font-bold text-emerald-600 tracking-tight">
                Backup from {{ lastBackupFormatted }}
                <span class="text-emerald-400/80 font-medium">({{ lastBackupAge }})</span>
              </span>
            </div>
          </div>

          <div class="flex items-center gap-4 relative z-10">
            <!-- Incomplete Only Toggle -->
            <div class="flex items-center gap-2">
              <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Incomplete Only</span>
              <button
                class="relative inline-flex h-4 w-8 items-center rounded-full transition-all duration-300 focus:outline-none shadow-inner"
                :class="actionsStore.showIncompleteOnly ? 'bg-emerald-500' : 'bg-slate-200'"
                @click="actionsStore.showIncompleteOnly = !actionsStore.showIncompleteOnly"
              >
                <span
                  class="inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-all duration-300 shadow-sm"
                  :class="actionsStore.showIncompleteOnly ? 'translate-x-[13px]' : 'translate-x-1'"
                />
              </button>
            </div>

            <!-- Refresh Button -->
            <button
              class="h-8 w-8 rounded-lg bg-white border border-emerald-100 shadow-sm flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors"
              title="Reload backup"
              :disabled="loading"
              @click="handleRefreshReconcile"
            >
              <svg
                class="w-4 h-4"
                :class="{ 'animate-spin': loading }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Active Event Slide Toggle (Earnings Boost) -->
      <div v-if="plannerTab === 'manual'" class="mt-4 flex flex-col items-center gap-2">
        <div
          class="w-full max-w-sm bg-gradient-to-r from-orange-50/80 via-white to-amber-50/80 rounded-2xl p-4 border border-orange-100/50 shadow-sm relative overflow-hidden flex items-center justify-between transition-all duration-300"
        >
          <div class="flex items-center gap-2 relative z-10">
            <div class="flex flex-col gap-0.5 text-left">
              <div class="flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></div>
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none"
                  >Monday 2x Earnings Event</span
                >
              </div>
              <span class="text-[11px] font-black text-orange-600 uppercase tracking-tighter">
                {{ isEarningsBoostActive ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>

          <button
            class="relative inline-flex h-5 w-10 items-center rounded-full transition-all duration-300 focus:outline-none shadow-inner"
            :class="isEarningsBoostActive ? 'bg-orange-500' : 'bg-slate-200'"
            @click="handleToggleEarningsEvent"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-all duration-300 shadow-sm"
              :class="isEarningsBoostActive ? 'translate-x-[22px]' : 'translate-x-1'"
            />
          </button>
        </div>
      </div>

      <div v-if="loading" class="text-center py-4 text-gray-600">Loading player data...</div>

      <div v-if="error" class="text-center py-4 text-red-600">
        {{ error }}
      </div>

      <div v-if="plannerTab === 'manual'">
        <!-- Action History and Available Actions side-by-side -->
        <div class="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Action History -->
          <div class="section-premium overflow-visible">
            <div class="px-4 py-3 flex justify-between items-center rounded-t-lg">
              <h2 class="text-lg font-semibold text-gray-800">Action History</h2>
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-1.5 cursor-pointer select-none">
                  <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Compact</span>
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="compactActionHistory"
                    class="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
                    :class="compactActionHistory ? 'bg-brand-primary' : 'bg-gray-200'"
                    @click="compactActionHistory = !compactActionHistory"
                  >
                    <span
                      class="inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-sm"
                      :class="compactActionHistory ? 'translate-x-[18px]' : 'translate-x-0.5'"
                    />
                  </button>
                </label>
                <button
                  class="p-1 -mr-1 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                  @click="expandedSections.actionHistory = !expandedSections.actionHistory"
                >
                  <ChevronIcon :expanded="expandedSections.actionHistory" />
                </button>
              </div>
            </div>
            <div v-if="expandedSections.actionHistory" class="border-t border-gray-200 p-4 bg-gray-50 rounded-b-lg">
              <ActionHistory @undo="showUndoConfirmation" @clear-all="handleClearAll" />
            </div>
          </div>

          <!-- Available Actions -->
          <div class="section-premium overflow-visible">
            <div class="px-4 py-3 flex justify-between items-center rounded-t-lg">
              <h2 class="text-lg font-semibold text-gray-800">Available Actions</h2>
              <button
                class="p-1 -mr-1 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                @click="expandedSections.availableActions = !expandedSections.availableActions"
              >
                <ChevronIcon :expanded="expandedSections.availableActions" />
              </button>
            </div>
            <div v-if="expandedSections.availableActions" class="border-t border-gray-200 p-4 bg-gray-50 rounded-b-lg">
              <AvailableActions @refresh-backup="handleRefreshReconcile" />
            </div>
          </div>
        </div>
      </div>

      <!-- The Auto Planner's three screens; each has Your setup where its settings used to be. -->
      <div v-if="plannerTab === 'automatic' && playerId && !loading" class="mt-4 space-y-4">
        <!-- A search running on another Auto Planner screen: this one greyed out under a line saying
             which, with Stop on the progress bar above. Fastest route greys only its panel, below its
             depth cards (FastestRoute.vue). -->
        <RunningElsewhere v-if="blockedBy && autoView !== 'fastest'" :running="blockedBy" :here="hereLabel" />
        <div
          :class="
            blockedBy && autoView !== 'fastest' ? 'opacity-40 pointer-events-none select-none space-y-4' : 'space-y-4'
          "
          :inert="blockedBy && autoView !== 'fastest' ? true : undefined"
        >
          <template v-if="autoView === 'classic'">
            <p class="max-w-4xl mx-auto text-sm text-slate-600 leading-relaxed">
              <span class="font-bold text-slate-900">{{ NAMES.classic }}</span> is Joo's Auto AP: type the TE you want
              to ascend at and it lays out every ascension from your start, with the weekly Research Sale and the Monday
              2× earnings boost in it. To have the checkpoints found for you, use {{ NAMES.fastest }} or
              {{ NAMES.byDate }}.
            </p>
            <AutomaticPlanner />
          </template>
          <!-- One screen, two depths: the "How thorough" cards are on it (FastestRoute.vue). -->
          <FastestRoute
            v-else-if="autoView === 'fastest'"
            :player-id="playerId"
            :depth="fastestDepth"
            :locked-to="activeScreen"
            :blocked-by="blockedBy"
            @update:depth="onDepth"
            @goal="onInsaneGoal"
          />
          <ByDateScreen v-else :player-id="playerId" @goal="onInsaneGoal" />
        </div>
      </div>

      <div v-else-if="plannerTab === 'leaderboard'" class="max-w-6xl mx-auto mt-6">
        <!-- Reads the collector directly; the Worker serves the same data as its own page. `use`
             drops a chain into the Auto Planner, which is the only way a number from someone
             else's account becomes a claim about yours. The player id only picks which of this
             browser's owner codes asks for "my" runs; it is hashed locally and never sent. -->
        <LeaderboardPanel :player-id="playerId" @use="useLeaderboardChain" />
      </div>

      <!-- Science: what the collected runs still can't tell us, and a way to send a sweep in. The
           Chain Explorer's two sections, moved here from its page (it renders just them). -->
      <div v-else-if="plannerTab === 'science'" class="max-w-6xl mx-auto mt-6 space-y-4">
        <div>
          <h2 class="text-2xl font-black text-slate-900">Help crack the algorithm</h2>
          <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
            Nobody outside the game knows exactly how it works out a run, and every sweep players send in narrows it
            down. Each question below is one the board can't answer yet: run its sweep on your account and it fills the
            gap.
          </p>
        </div>
        <ChainExplorer part="science" embedded :science-view="scienceView" :te-now="saveTE" :inventory="saveArtifacts" @run-sweep="openSweep" @run-by-date="openByDate" />
      </div>

      <!-- Your setup, floating, on every Auto Planner screen: the gear opens it; workers adjust folded. -->
      <SetupDock v-if="plannerTab === 'automatic' && playerId && !loading" :screen="autoView" />

      <!-- Undo Confirmation Dialog -->
      <UndoConfirmationDialog
        v-if="undoAction"
        :action="undoAction"
        :dependents-a="undoDependentsA"
        :dependents-b="undoDependentsB"
        @confirm="executeUndo"
        @cancel="cancelUndo"
      />

      <!-- Clear All Confirmation Dialog -->
      <ConfirmationDialog
        v-if="showClearAllConfirmation"
        title="Clear All Actions"
        message="Are you sure you want to clear all actions? This cannot be undone."
        confirm-label="Clear All"
        @confirm="executeClearAll"
        @cancel="showClearAllConfirmation = false"
      />

      <!-- Unsaved Changes Protection Dialog -->
      <ConfirmationDialog
        v-if="showUnsavedConfirm"
        title="Unsaved Changes"
        message="You have unsaved changes in your current plan. If you continue, these changes will be lost. Would you like to save before proceeding?"
        confirm-label="Continue Without Saving"
        variant="danger"
        @confirm="
          showUnsavedConfirm = false;
          pendingAction?.();
        "
        @cancel="
          showUnsavedConfirm = false;
          pendingAction = null;
        "
      />

      <!-- Plan Selection Dialog (for Reconcile) -->
      <PlanSelectionDialog
        v-if="showReconcileLibraryModal"
        @select="handleLibraryReconcile"
        @cancel="showReconcileLibraryModal = false"
      />

      <!-- Artifact Set Selection Dialog -->
      <div v-if="showArtifactSetConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div
          class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          <div class="px-6 py-5 border-b border-slate-100">
            <h3 class="text-lg font-bold text-slate-800">Current Artifact Set</h3>
            <p class="mt-2 text-sm text-slate-500">Which artifact set do you currently have equipped in game?</p>
          </div>
          <div class="px-6 py-4 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
            <button
              class="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              @click="handleArtifactSetSelection('elr')"
            >
              Delivery Rate Set
            </button>
            <button
              class="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              @click="handleArtifactSetSelection('earnings')"
            >
              Earnings Set
            </button>
          </div>
        </div>
      </div>

      <!-- Continuity Check Dialog -->
      <ContinuityDialog />

      <WarningDialog />

      <RecalculationOverlay />

      <LoadingOverlay
        :show="loading"
        title="One Moment..."
        message="Fetching your data and crunching the numbers to set up your plan..."
      />

      <PlanFinalSummary
        v-if="plannerTab === 'manual'"
        @update:collapsed="isFooterCollapsed = $event"
        @save-plan="saveCurrentPlan"
        @save-plan-as="savePlanAs"
      />
      <FloatingStats v-if="plannerTab === 'manual'" />
      <FloatingNotes v-if="plannerTab === 'manual'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h, type FunctionalComponent } from 'vue';
import {
  NAMES,
  canonicalUrl,
  hashFor,
  routeFromLocation,
  type AutoView,
  type Depth,
  type ScienceView,
  type Section,
  type SiteRoute,
} from '@/lib/siteNav';
import { storeToRefs } from 'pinia';
import TheNavBar from 'ui/components/NavBar.vue';
import { getSavedPlayerID, savePlayerID, requestFirstContact, resolveColleggtibleContracts } from 'lib';
import ThePlayerIdForm from 'ui/components/PlayerIdForm.vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useActionsStore } from '@/stores/actions';
import { useVirtueStore } from '@/stores/virtue';
import { useUIStore } from '@/stores/ui';
import { useFuelTankStore } from '@/stores/fuelTank';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { useEventsStore } from '@/stores/events';

import { useNotesStore } from '@/stores/notes';
import CustomEggWatcher from '@/components/CustomEggWatcher.vue';
import ActionHistory from '@/components/ActionHistory.vue';
import AvailableActions from '@/components/AvailableActions.vue';
import UndoConfirmationDialog from '@/components/UndoConfirmationDialog.vue';
import PlanFinalSummary from '@/components/PlanFinalSummary.vue';
import ContinuityDialog from '@/components/ContinuityDialog.vue';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import FloatingStats from '@/components/FloatingStats.vue';
import FloatingNotes from '@/components/FloatingNotes.vue';
import WarningDialog from '@/components/WarningDialog.vue';
import RecalculationOverlay from '@/components/RecalculationOverlay.vue';
import LoadingOverlay from '@/components/LoadingOverlay.vue';
import PlanLibrary from '@/components/PlanLibrary.vue';
import PlanSelectionDialog from '@/components/PlanSelectionDialog.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { safeAsyncComponent } from '@/lib/import';
import RunProgressBar from '@/components/auto/RunProgressBar.vue';
import { usePlanStartForm } from '@/composables/usePlanStartForm';
import NewLayoutGuide from '@/components/NewLayoutGuide.vue';
import SiteTabs from '@/components/SiteTabs.vue';
import SetupDock from '@/components/auto/SetupDock.vue';
import SweepRunner from '@/components/science/SweepRunner.vue';
import type { SweepRequest } from '@/search/sweepRequest';
import { virtueInventory } from '@/search/csv';
import type { ByDateRequest } from '@/search/byDateRequest';
import RunningElsewhere from '@/components/auto/RunningElsewhere.vue';
import { useSalesStore } from '@/stores/sales';
import { hashID, saveMetadata, loadMetadata } from '@/lib/storage/db';
import { useActionExecutor } from '@/composables/useActionExecutor';
import { usePersistence } from '@/composables/usePersistence';
import { compactActionHistory } from '@/composables/useCompactActionHistory';
import { generateActionId } from '@/types';
import { computeDependencies } from '@/lib/actions/executor';
import { restoreFromSnapshot } from '@/lib/actions/snapshot';
import { computeSnapshot } from '@/engine/compute';
import NewVersionBanner from '@/components/NewVersionBanner.vue';
import IntegrityAlert from '@/components/auto/IntegrityAlert.vue';
import { getSimulationContext, createBaseEngineState } from '@/engine/adapter';
import type { Action, VirtueEgg } from '@/types';
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { getArtifact, getArtifactLoadoutFromBackup } from '@/lib/artifacts';
import {
  initStartFromScratch,
  initPlanFuture,
  initContinueCurrent,
  initReconcile,
  refreshReconcile,
  loadAndSyncBackup,
  captureReconciliationTargets,
  catchUpFarmState,
} from '@/lib/modes';

// The four big tab panels load on first use: each sits behind a v-if (a tab, a loaded backup, or
// `?insane=1`), and together they were a large share of the planner's first download that nobody
// sees until they pick a tab. safeAsyncComponent retries and offers a reload if a deploy replaced
// the files this tab was built against.
const AutomaticPlanner = safeAsyncComponent(() => import('@/components/auto/AutomaticPlanner.vue'));
const FastestRoute = safeAsyncComponent(() => import('@/components/auto/FastestRoute.vue'));
const ByDateScreen = safeAsyncComponent(() => import('@/components/auto/ByDateScreen.vue'));
const LeaderboardPanel = safeAsyncComponent(() => import('@/components/auto/LeaderboardPanel.vue'));
const ChainExplorer = safeAsyncComponent(() => import('@/explorer/ChainExplorer.vue'));

// Dev server only (localhost or a LAN IP hitting the Vite dev server) - never in a production build.
const isDev = import.meta.env.DEV;

const playerId = ref(new URLSearchParams(window.location.search).get('playerId') || getSavedPlayerID() || '');

// The Update button's cache-buster (PlanFinalSummary.vue) has done its job once the page is here;
// left in, it rode along in every link copied afterwards.
if (new URLSearchParams(window.location.search).has('_hardReload')) {
  const url = new URL(window.location.href);
  url.searchParams.delete('_hardReload');
  window.history.replaceState(window.history.state, '', url.toString());
}

const chainSearchStore = useChainSearchStore();

/** Take a chain off the board into the Auto Planner. It is someone else's ANSWER, not a result
 *  for this account -- their artifacts and starting TE produced it -- so this loads the shape and
 *  leaves the pricing to a run here. */
function useLeaderboardChain(chain: number[]): void {
  pinnedRoute = null;
  chainSearchStore.applyChain(chain, false);
  uiStore.autoView = 'classic';
  plannerTab.value = 'automatic';
}
const initialStateStore = useInitialStateStore();
// The Auto Planner's start and timezone, restored and defaulted before any screen or chunk loads.
usePlanStartForm();
const actionsStore = useActionsStore();
const uiStore = useUIStore();
const { plannerTab, isHeaderCollapsed, isFooterCollapsed, loading, error } = storeToRefs(uiStore);

/**
 * Which tab is open, and its address (lib/siteNav.ts). The address follows every change, so a
 * reload or a copied link opens the same screen; old `?insane=1` / `#deadline` links are read once
 * and rewritten to the new address.
 */
const initialRoute = routeFromLocation(window.location.search, window.location.hash);
const { autoView, fastestDepth, compareView, scienceView } = storeToRefs(uiStore);

function currentRoute(): SiteRoute {
  const section: Section =
    plannerTab.value === 'automatic'
      ? 'auto'
      : plannerTab.value === 'leaderboard'
        ? 'compare'
        : plannerTab.value === 'science'
          ? 'science'
          : 'manual';
  return {
    section,
    auto: autoView.value,
    depth: fastestDepth.value,
    compare: compareView.value,
    science: scienceView.value,
  };
}

function applyRoute(r: SiteRoute): void {
  autoView.value = r.auto;
  fastestDepth.value = r.depth;
  if (r.compare) compareView.value = r.compare;
  if (r.science) scienceView.value = r.science;
  plannerTab.value =
    r.section === 'auto'
      ? 'automatic'
      : r.section === 'compare'
        ? 'leaderboard'
        : r.section === 'science'
          ? 'science'
          : 'manual';
}

if (initialRoute) {
  applyRoute(initialRoute);
  window.history.replaceState(null, '', canonicalUrl(window.location.href, initialRoute));
}

// The address follows the tabs. Replaced, not pushed: Back leaves the site rather than stepping
// through every tab clicked on the way.
watch(
  () => hashFor(currentRoute()),
  hash => {
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }
);
// A link inside the page (or an edited address) to another tab. Plain `#anchors` are not routes.
function onHashChange(): void {
  const r = routeFromLocation('', window.location.hash);
  if (!r) return;
  // Only the section the link names changes: a link to #/compare must not reset the Auto Planner's
  // screen and depth to their defaults (review, 30 Sept), or the other way round.
  const here = currentRoute();
  if (r.section === 'auto') goTo({ ...here, section: 'auto', auto: r.auto, depth: r.depth });
  else if (r.section === 'compare') goTo({ ...here, section: 'compare', compare: r.compare });
  else if (r.section === 'science') goTo({ ...here, section: 'science', science: r.science });
  else goTo({ ...here, section: r.section });
}
onMounted(() => window.addEventListener('hashchange', onHashChange));
onUnmounted(() => window.removeEventListener('hashchange', onHashChange));

/**
 * The search screen a running search belongs to. The searches share one store, so while one runs
 * the other search screens are locked: Smart search's panel would otherwise show a full sweep's
 * progress as its own. Classic, Manual and Compare stay open, as the other tabs always did.
 */
type SearchScreen = 'smart' | 'full' | 'by-date';
function searchScreenOf(r: SiteRoute): SearchScreen | null {
  if (r.section !== 'auto' || r.auto === 'classic') return null;
  return r.auto === 'by-date' ? 'by-date' : r.depth;
}
const runningScreen = ref<SearchScreen | null>(null);
/** A search going, counting the gaps between a Full sweep queue's chains (saving one, starting the
 *  next): without them the lock dropped between chains and another screen could take the run over. */
const searchActive = computed(() => chainSearchStore.busy || chainSearchStore.sweepQueue.at >= 0);
watch(searchActive, active => {
  runningScreen.value = active ? (searchScreenOf(currentRoute()) ?? runningScreen.value) : null;
});

/**
 * The screen the running search belongs to, for the progress bar: the one it was started from, or,
 * for a run that started elsewhere (a carry-on from another screen), the one its kind lives on.
 */
const runScreen = computed<SearchScreen | null>(() => {
  const kind = chainSearchStore.runProgress?.kind;
  if (!kind) return null;
  if (runningScreen.value) return runningScreen.value;
  if (kind === 'by-date' || kind === 'full' || kind === 'smart') return kind;
  return fastestDepth.value;
});
/** The screen a search is going on, gaps between a queue's chains included. */
const activeScreen = computed<SearchScreen | null>(() => runningScreen.value ?? runScreen.value);
/** The screen shown now, in the same terms. */
const screenHere = computed<SearchScreen | 'classic'>(() =>
  autoView.value === 'classic' ? 'classic' : autoView.value === 'by-date' ? 'by-date' : fastestDepth.value
);
function screenName(s: SearchScreen | 'classic'): string {
  return s === 'classic' ? NAMES.classic : s === 'by-date' ? NAMES.byDate : s === 'full' ? NAMES.full : NAMES.smart;
}
/** The running search's name when this Auto Planner screen isn't where it runs, else ''. */
const blockedBy = computed(() => {
  const a = activeScreen.value;
  if (plannerTab.value !== 'automatic' || !a || a === screenHere.value) return '';
  return chainSearchStore.runProgress?.kind === 'start-times' ? 'When should I start?' : screenName(a);
});
const hereLabel = computed(() => screenName(screenHere.value));

/** On every screen but the run's own, where the panel shows its progress in full. */
const showRunBar = computed(() => !!runScreen.value && searchScreenOf(currentRoute()) !== runScreen.value);
function showRun(): void {
  // A sweep started from Science: back to its window there, which is where it was started from.
  const science = uiStore.scienceRun;
  if (science && science.phase !== 'done' && !runningScreen.value) {
    goTo({ ...currentRoute(), section: 'science', science: 'check' });
    uiStore.scienceSweep = science.request;
    return;
  }
  const s = runScreen.value;
  if (s === 'by-date') goAuto('by-date');
  else if (s) goAuto('fastest', s);
}

/** Open a tab: a deliberate choice, so a backup finishing loading no longer pulls the page back. */
function goTo(r: SiteRoute): void {
  // Every screen opens, running search or not: the ones it isn't on show greyed out under a line
  // saying so (RunningElsewhere.vue), rather than refusing the click (the user, 30 Sept).
  pinnedRoute = null;
  const enteringAuto = r.section === 'auto' && plannerTab.value !== 'automatic';
  applyRoute(r);
  // Entering the Auto Planner fetches a fresh save and resets the planner around it -- never under a
  // search that's running (the progress bar's "Show it" is exactly that way in): it keeps the save
  // it started with, which is already set up.
  if (enteringAuto && !searchActive.value) void handleAutoPlannerTabClick();
}
/** A top tab: that section, as it was last left. */
function selectSection(section: Section): void {
  goTo({ ...currentRoute(), section });
}
function goAuto(auto: AutoView, depth: Depth = fastestDepth.value): void {
  goTo({ section: 'auto', auto, depth });
}

/** An Auto Planner sub-tab. "Fastest route" opens the depth that's running, if one is. */
function onAutoTab(auto: AutoView): void {
  const a = activeScreen.value;
  if (auto === 'fastest' && (a === 'smart' || a === 'full')) goAuto('fastest', a);
  else goAuto(auto);
}

/** A "How thorough" card on Fastest route. */
function onDepth(d: Depth): void {
  goAuto('fastest', d);
}

/** The Insane panel's own goal switch, when it asks (carrying on a fastest run from the date view). */
function onInsaneGoal(g: 'fastest' | 'deadline'): void {
  goAuto(g === 'deadline' ? 'by-date' : 'fastest', 'full');
}

// "Build this plan in the Auto Planner" from a search: Classic, in place, so the loaded save, the
// chain and its time-off cuts all carry over.
watch(
  () => uiStore.openPlannerRequested,
  () => {
    pinnedRoute = null;
    applyRoute({ section: 'auto', auto: 'classic', depth: fastestDepth.value });
  }
);

/**
 * A link to a tab keeps the page there while the save loads.
 *
 * The tab defaults to Manual, and every path that finishes loading a backup or a plan sets it back
 * to Manual -- reasonable for the Manual Planner, and wrong for a link whose whole purpose is another
 * tab (every "Run this sweep" link). Driven off `loading` because those handlers run AFTER a backup
 * finishes and would undo a one-shot switch. Only until the player picks a tab themselves.
 */
let pinnedRoute: SiteRoute | null = initialRoute && initialRoute.section !== 'manual' ? initialRoute : null;
watch(loading, (now, before) => {
  if (pinnedRoute && before && !now) applyRoute(pinnedRoute);
});
// Picking a leaderboard view or a Science view is picking a tab too (loads never change these).
watch([compareView, scienceView], () => (pinnedRoute = null));
// Another account loaded: a Full sweep queue started for the last one doesn't start its next chain
// on this one's save (its panel used to stop it by closing, which the tabs now do all the time).
watch(playerId, () => {
  if (chainSearchStore.sweepQueue.at >= 0) chainSearchStore.sweepQueue.cancelled = true;
});
// A copy with no collector has no Compare or Science tab: an address for one opens the Manual Planner.
if (!chainSearchStore.submitUrl && (plannerTab.value === 'leaderboard' || plannerTab.value === 'science')) {
  plannerTab.value = 'manual';
}

/**
 * On a link into the Auto Planner, set the account up the way clicking its tab does.
 *
 * That click runs `initPlanFuture`, which is what fills the planner's working state from the save:
 * the starting TE, the current virtue farm, the plan's start. A tab opened straight onto a search
 * never went through that click -- so a "Run this sweep" link planned from TE 0 with no farm, and
 * the pre-flight refused it as "your virtue farm had not finished loading". Once per player id, so
 * the loading watcher does not re-run it, and never over a load already in progress.
 */

const topTabs = computed(() => [
  {
    id: 'manual' as const,
    tab: 'manual',
    label: NAMES.manual,
    on: 'bg-slate-900 text-white shadow-lg shadow-slate-200',
  },
  {
    id: 'auto' as const,
    tab: 'automatic',
    label: NAMES.auto,
    on: 'bg-indigo-600 text-white shadow-lg shadow-indigo-100',
  },
  // Only with a collector: a fork with no VITE_SUBMIT_URL has no board and no Explorer.
  ...(chainSearchStore.submitUrl
    ? [
        {
          id: 'compare' as const,
          tab: 'leaderboard',
          label: NAMES.compare,
          on: 'bg-emerald-600 text-white shadow-lg shadow-emerald-100',
        },
        {
          id: 'science' as const,
          tab: 'science',
          label: NAMES.science,
          on: 'bg-amber-600 text-white shadow-lg shadow-amber-100',
        },
      ]
    : []),
]);
const autoTabs: { id: AutoView; label: string; screen: SearchScreen | null }[] = [
  { id: 'classic', label: NAMES.classic, screen: null },
  { id: 'fastest', label: NAMES.fastest, screen: null },
  { id: 'by-date', label: NAMES.byDate, screen: 'by-date' },
];
/**
 * TE straight from the loaded save, pending Truth Eggs included, the way the planner counts it when
 * it sets the save up (initialState + rollUpPendingTE: per egg, the claimed TE or the thresholds
 * passed, whichever is more, capped at 98). Science isn't a screen that sets the save up, and its
 * sweep ranges start from this.
 */
/** The save's artifacts, for the Science tab's gear cards to say which ones you have. */
const saveArtifacts = computed(() => virtueInventory(initialStateStore.rawBackup).artifacts);
const saveTE = computed(() => {
  const virtue = initialStateStore.rawBackup?.virtue;
  const earned = virtue?.eovEarned ?? [];
  const delivered = virtue?.eggsDelivered ?? [];
  let total = 0;
  for (let i = 0; i < 5; i++) {
    total += Math.min(98, Math.max(earned[i] ?? 0, countTEThresholdsPassed(delivered[i] ?? 0)));
  }
  return total;
});
/** The new-layout guide (NewLayoutGuide.vue): open until "Got it", remembered in this browser. */
const GUIDE_KEY = 'aap-new-layout-seen';
const showGuide = ref(
  (() => {
    try {
      return localStorage.getItem(GUIDE_KEY) !== '1';
    } catch {
      return true;
    }
  })()
);
function closeGuide(): void {
  showGuide.value = false;
  try {
    localStorage.setItem(GUIDE_KEY, '1');
  } catch {
    /* private window: it shows again next visit */
  }
}

const scienceTabs: { id: ScienceView; label: string }[] = [
  { id: 'check', label: NAMES.check },
  { id: 'submit', label: NAMES.submit },
];

let autoInitFor = '';
async function initAutoOnce(): Promise<void> {
  if (plannerTab.value !== 'automatic' || !playerId.value || loading.value || autoInitFor === playerId.value) return;
  autoInitFor = playerId.value;
  await handleAutoPlannerTabClick();
}
const virtueStore = useVirtueStore();
const fuelTankStore = useFuelTankStore();
const truthEggsStore = useTruthEggsStore();
const eventsStore = useEventsStore();
const salesStore = useSalesStore();

const notesStore = useNotesStore();
const { prepareExecution, completeExecution } = useActionExecutor();
const { partitionHash, saveActiveDraft, initPersistence, broadcastPresence } = usePersistence();

const isEarningsBoostActive = computed(() => actionsStore.effectiveSnapshot?.earningsBoost?.active ?? false);

const lastBackupFormatted = computed(() => {
  const approxTime = initialStateStore.rawBackup?.approxTime;
  if (approxTime == null) return 'Unknown';
  const date = new Date(approxTime * 1000);

  return date.toLocaleTimeString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
});

const lastBackupAge = computed(() => {
  const approxTime = initialStateStore.rawBackup?.approxTime;
  if (approxTime == null) return '';
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - approxTime);

  if (diff < 60) return 'Just now';

  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes}m ago`;
});

const pageTitle = computed(() => {
  const name = initialStateStore.rawBackup?.userName;
  return name ? `Ascension Planner ${name}` : 'Ascension Planner';
});

watch(
  pageTitle,
  newTitle => {
    document.title = newTitle;
  },
  { immediate: true }
);

function handleToggleEarningsEvent() {
  const beforeSnapshot = prepareExecution();
  const currentlyActive = beforeSnapshot.earningsBoost.active;

  // Find the multiplier from the event store if turning ON
  let multiplier = 2;
  if (!currentlyActive) {
    const event = eventsStore.getActiveEvents(initialStateStore.isUltra).find(e => e.type === 'earnings-boost');
    if (event) multiplier = event.multiplier;
  } else {
    multiplier = 1;
  }

  const payload = {
    active: !currentlyActive,
    multiplier,
  };

  // Update store state
  salesStore.setEarningsBoost(payload.active, payload.multiplier);

  completeExecution(
    {
      id: generateActionId(),
      timestamp: Date.now(),
      type: 'toggle_earnings_boost',
      payload,
      cost: 0,
      dependsOn: computeDependencies(
        'toggle_earnings_boost',
        payload,
        actionsStore.actionsBeforeInsertion,
        actionsStore.initialSnapshot.researchLevels
      ),
    },
    beforeSnapshot
  );
}

onMounted(async () => {
  eventsStore.fetchEvents();

  if (playerId.value) {
    await initPersistence(playerId.value);

    try {
      const pHash = await hashID(playerId.value);
      const savedBackup = await loadMetadata(pHash, 'rawBackup');
      if (savedBackup) {
        initialStateStore.rawBackup = savedBackup;
      }
    } catch (e) {
      console.error('Failed to load raw backup from DB', e);
    }
  }

  if (!actionsStore._initialSnapshot) {
    await actionsStore.recalculateAll();
  }

  // Fresh start: if only start_ascension exists and no farm state is loaded, add initial Wait for Full Habs
  const startAction = actionsStore.getStartAction();
  if (
    actionsStore.actions.length === 1 &&
    startAction &&
    !startAction.payload.initialFarmState &&
    !startAction.payload.isQuickContinue
  ) {
    actionsStore.pushWaitForFullHabsAction();
  }

  // A saved player id on a link into the Auto Planner: set it up now rather than waiting for a click.
  await initAutoOnce();
});

// Auto-save logic
let saveTimeout: ReturnType<typeof setTimeout>;
function triggerAutoSave() {
  if (!playerId.value) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveActiveDraft();
  }, 1000);
}

actionsStore.$subscribe(triggerAutoSave);
notesStore.$subscribe(triggerAutoSave);

// Re-init persistence when player ID changes
watch(playerId, async newId => {
  if (newId) {
    await initPersistence(newId);
  }
});

// Section expansion state
const expandedSections = ref({
  actionHistory: true,
  availableActions: true,
});

// isHeaderCollapsed moved to UI store

type PlannerMode = 'scratch' | 'future' | 'continue' | 'library' | 'reconcile' | null;
const plannerMode = ref<PlannerMode>(null);
const loadedPlanName = ref('');

const plannerModeLabel = computed(() => {
  if (plannerMode.value === 'scratch') return 'Start from Scratch';
  if (plannerMode.value === 'future') return 'Plan Future Ascension';
  if (plannerMode.value === 'continue') return 'Continue Current Ascension';
  if (plannerMode.value === 'library') return loadedPlanName.value;
  if (plannerMode.value === 'reconcile') return `Reconciling ${loadedPlanName.value}`;
  return null;
});

function handlePlanLoaded(name: string) {
  plannerMode.value = 'library';
  loadedPlanName.value = name;
  plannerTab.value = 'manual';
  isHeaderCollapsed.value = true;
  scrollToTop();
}

// Current state from actions store
const currentSnapshot = computed(() => actionsStore.currentSnapshot);
const totalCost = computed(() => actionsStore.totalCost);
const actionCount = computed(() => actionsStore.actionCount);

// Modal state
const undoAction = ref<Action | null>(null);
const undoDependentsA = ref<Action[]>([]);
const undoDependentsB = ref<Action[]>([]);
const showClearAllConfirmation = ref(false);

const showReconcileLibraryModal = ref(false);
const showUnsavedConfirm = ref(false);
const showArtifactSetConfirm = ref(false);
const pendingAction = ref<(() => void) | null>(null);

/**
 * Confirm unsaved changes before potentially destructive actions.
 */
function confirmUnsavedChanges(action: () => void) {
  if (actionsStore.isDirty) {
    pendingAction.value = action;
    showUnsavedConfirm.value = true;
  } else {
    action();
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showUndoConfirmation(action: Action, options?: { skipConfirmation: boolean }) {
  const validationA = actionsStore.prepareUndo(action.id);
  const validationB = actionsStore.prepareUndoUntilShift(action.id);

  undoAction.value = action;
  undoDependentsA.value = validationA.dependentActions;
  undoDependentsB.value = validationB.dependentActions;

  if (options?.skipConfirmation) {
    executeUndo('truncate');
  }
}

function cancelUndo() {
  undoAction.value = null;
  undoDependentsA.value = [];
  undoDependentsB.value = [];
}

function executeUndo(mode: 'dependents' | 'truncate' = 'dependents') {
  if (!undoAction.value) return;

  actionsStore.executeUndo(undoAction.value.id, mode, snapshot => {
    // Restore stores to the snapshot of the last remaining action
    restoreFromSnapshot(snapshot);
  });

  cancelUndo();
}

function handleClearAll(options?: { skipConfirmation: boolean }) {
  if (options?.skipConfirmation) {
    executeClearAll();
  } else {
    showClearAllConfirmation.value = true;
  }
}

function executeClearAll() {
  actionsStore.clearAll();
  showClearAllConfirmation.value = false;
}

/**
 * Start from Scratch: Full reset.
 * Delegates to initStartFromScratch mode initializer.
 */
async function startFromScratch() {
  error.value = '';
  try {
    plannerMode.value = 'scratch';
    plannerTab.value = 'manual';
    await initStartFromScratch();
    isHeaderCollapsed.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Reset failed';
    console.error('Start from Scratch error:', e);
  }
}

/**
 * Reconcile Plan: Fetch latest backup AND load a plan from library.
 */
function triggerReconcile() {
  actionsStore.showIncompleteOnly = true;
  showReconcileLibraryModal.value = true;
}

async function handleLibraryReconcile(plan: import('@/lib/storage/db').PlanData) {
  showReconcileLibraryModal.value = false;
  loading.value = true;
  error.value = '';

  try {
    plannerMode.value = 'reconcile';
    loadedPlanName.value = plan.name;
    plannerTab.value = 'manual';
    savePlayerID(playerId.value);
    await initReconcile(playerId.value, plan, broadcastPresence);
    isHeaderCollapsed.value = true;
  } catch (err) {
    console.error(err);
    alert('Failed to reconcile plan.');
  } finally {
    loading.value = false;
  }
}

async function handleRefreshReconcile() {
  if (!playerId.value || loading.value) return;

  loading.value = true;
  error.value = '';
  try {
    await refreshReconcile(playerId.value);
    // No full recalculateAll() needed here, as reconciliation statuses are reactive getters.
  } catch (err) {
    console.error(err);
    error.value = 'Failed to refresh backup.';
  } finally {
    loading.value = false;
  }
}

/**
 * After a failed fetch, rebuild the planner from the last save that DID load (fetchBackup keeps it on
 * this device), so the older save and the plan built from it match -- rather than leaving a plan from
 * one load beside a save from another. That mismatch is how a player at 170 TE was shown 147.
 */
async function planFromLastGoodSave(): Promise<void> {
  const older = initialStateStore.rawBackup;
  if (!playerId.value || !older) return;
  try {
    await initPlanFuture(playerId.value, older);
  } catch (e) {
    console.error('Could not rebuild the planner from the saved copy:', e);
  }
}

/** The fetch error in words a player can act on. The raw one names the forwarder's URL. */
function backupFailureReason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/timeout|timed out/i.test(msg)) return "the game's server didn't answer in time";
  if (/failed to fetch|network|load failed/i.test(msg)) return "the game's server couldn't be reached";
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
}

// IntegrityNotice's "Try again". Only initPlanFuture clears the warning: it is the one path that also
// rebuilds the plan snapshot the TE is read from (the header's reconcile refresh loads a save but
// leaves that snapshot as it was).
watch(
  () => uiStore.backupRetryRequested,
  () => void handleAutoPlannerTabClick()
);

async function handleAutoPlannerTabClick() {
  plannerTab.value = 'automatic';
  isHeaderCollapsed.value = true;
  await prepareAutoPlanner();
}

/**
 * Fetch a fresh save and set the planner up from it for the searches ("Plan Future" mode, zeroed
 * farm): what entering the Auto Planner does, and what a Science sweep does before showing its
 * figures (SweepRunner.vue). Resolves to '' when the planner is ready, else why not. A failed fetch
 * falls back to the last good save, and IntegrityNotice says so beside Start.
 */
async function prepareAutoPlanner(): Promise<string> {
  if (!playerId.value) return 'Enter your player ID at the top of the page first.';
  // Never under a search that is running: it is pricing against the planner as it is.
  if (searchActive.value) return 'A search is running. Let it finish or stop it first.';
  if (loading.value) return 'Your save is still loading. Try again in a moment.';
  loading.value = true;
  try {
    await initPlanFuture(playerId.value);
    uiStore.staleBackup = null;
    // Back from a run's own older save: its pinned start belongs to that save, not this one.
    if (uiStore.runSaveLoaded) chainSearchStore.resetPlanStartTo(initialStateStore.rawBackup?.approxTime);
    uiStore.runSaveLoaded = null;
    return '';
  } catch (e) {
    console.error('Failed to auto-init Auto Planner:', e);
    error.value = 'Failed to load fresh backup for Auto Planner.';
    uiStore.staleBackup = backupFailureReason(e);
    await planFromLastGoodSave();
    return initialStateStore.rawBackup ? '' : `Your save could not be loaded: ${uiStore.staleBackup}.`;
  } finally {
    loading.value = false;
  }
}

/** What we need to check's Run this sweep, on the Science tab: open its window. */
function openSweep(request: SweepRequest): void {
  uiStore.scienceSweep = request;
}
/** A By a date ask's button, on the Science tab: open that screen with the ask filled in (DeadlinePanel
 *  applies it). Under a running search the screen opens as it is: that search owns the boxes. */
function openByDate(request: ByDateRequest): void {
  if (!searchActive.value) uiStore.byDateRequest = request;
  goAuto('by-date');
}
function sweepKey(r: SweepRequest): string {
  return `${r.preset}|${r.bands}|${r.minGap}|${r.forceContinue}`;
}
/** The window's "See it in the Full sweep": the result is the store's, so that screen has it all. */
function showSweepResult(): void {
  uiStore.scienceSweep = null;
  goAuto('fastest', 'full');
}

/**
 * Load player data from the server when the player ID form is submitted.
 * This is NOT a mode initializer — it just fetches player data so the
 * mode buttons become usable and player info is displayed.
 */
async function submitPlayerId(id: string) {
  playerId.value = id;
  savePlayerID(id);
  // A `?playerId=` in the address wins over the saved ID on load, so it has to follow a change here:
  // otherwise a reload went back to the link's account after the player had entered their own.
  const url = new URL(window.location.href);
  if (url.searchParams.has('playerId') && url.searchParams.get('playerId') !== id) {
    url.searchParams.set('playerId', id);
    window.history.replaceState(window.history.state, '', url.toString());
  }
  error.value = '';
  loading.value = true;
  notesStore.$reset();

  try {
    // Clear existing plan to ensure a fresh start with new player data
    // We skip recalculate because setInitialSnapshot will trigger it at the end of this function.
    await actionsStore.clearAll(undefined, true);

    const data = await requestFirstContact(id);
    const backup = data.backup!;
    resolveColleggtibleContracts(backup);

    try {
      const pHash = await hashID(id);
      await saveMetadata(pHash, 'rawBackup', backup);
    } catch (dbErr) {
      console.error('Failed to save raw backup to DB', dbErr);
    }

    // Load into state store and sync global stores
    const { teEarnedPerEgg } = loadAndSyncBackup(id, backup, 'default');

    // Catch-up calculations (eggs, earnings, population) are now handled
    // automatically by computeSnapshot in the engine.
    const context = getSimulationContext();
    const baseState = createBaseEngineState(null);
    const initialSnapshot = computeSnapshot(baseState, context);

    // Sync farm state and Truth Eggs with caught-up values
    catchUpFarmState(initialSnapshot, baseState.bankValue, context.ascensionStartTime, teEarnedPerEgg);

    // Initialize initial state in actions store
    await actionsStore.setInitialSnapshot(initialSnapshot);

    loading.value = false;
  } catch (e) {
    loading.value = false;
    error.value = e instanceof Error ? e.message : 'Failed to load player data';
    console.error('Error fetching player data:', e);
    return;
  }
  // A player id typed on a link into the Auto Planner: same set-up as the tab click.
  await initAutoOnce();
}

/**
 * Try to determine which artifact set they have on based on stones.
 */
function detectArtifactSet(loadout: import('@/lib/artifacts').EquippedArtifact[]): 'earnings' | 'elr' | null {
  let totalSlots = 0;
  const allStones: string[] = [];

  for (const slot of loadout) {
    if (slot.artifactId) {
      const artifact = getArtifact(slot.artifactId);
      if (artifact) {
        totalSlots += artifact.slots;
      }
    }
    for (const stoneId of slot.stones) {
      if (stoneId) {
        allStones.push(stoneId);
      }
    }
  }

  // 1. If their artifact set has at least 3 stone slots, we can try to determine which set it is
  if (totalSlots < 3) {
    return null;
  }

  // If no stones are equipped, we can't reliably determine the set
  if (allStones.length === 0) {
    return null;
  }

  const isLunar = (id: string) => id.startsWith('lunar-stone-');
  const isELR = (id: string) => id.startsWith('quantum-stone-') || id.startsWith('tachyon-stone-');

  // 2. If all the stones are lunar stones, it's the earnings set
  if (allStones.every(isLunar)) {
    return 'earnings';
  }

  // 3. If all the stones are either quantum or tachyon, it's the elr set
  if (allStones.every(isELR)) {
    return 'elr';
  }

  return null;
}

async function triggerQuickContinue() {
  if (!playerId.value) return;
  loading.value = true;
  error.value = '';

  try {
    const data = await requestFirstContact(playerId.value);
    if (!data.backup) throw new Error('Could not fetch player backup');
    const backup = data.backup;
    resolveColleggtibleContracts(backup);

    const loadout = getArtifactLoadoutFromBackup(backup);
    const detectedSet = detectArtifactSet(loadout);

    if (detectedSet) {
      handleArtifactSetSelection(detectedSet);
    } else {
      loading.value = false;
      showArtifactSetConfirm.value = true;
    }
  } catch (e) {
    loading.value = false;
    error.value = e instanceof Error ? e.message : 'Quick Continue failed';
    console.error('Quick Continue error:', e);
  }
}

function handleArtifactSetSelection(selection: 'earnings' | 'elr') {
  showArtifactSetConfirm.value = false;
  quickContinueAscension(selection);
}

async function quickContinueAscension(selection: 'earnings' | 'elr') {
  if (!playerId.value) return;

  error.value = '';
  loading.value = true;

  try {
    plannerMode.value = 'continue';
    plannerTab.value = 'manual';
    savePlayerID(playerId.value);
    await initContinueCurrent(playerId.value, selection);
    isHeaderCollapsed.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Quick Continue failed';
    console.error('Quick Continue error:', e);
  } finally {
    loading.value = false;
  }
}

/**
 * Plan Next Ascension:
 * Delegates to initPlanFuture mode initializer.
 */
async function planNextAscension() {
  if (!playerId.value) return;

  error.value = '';
  loading.value = true;

  try {
    plannerMode.value = 'future';
    plannerTab.value = 'manual';
    savePlayerID(playerId.value);
    await initPlanFuture(playerId.value);
    uiStore.staleBackup = null;
    if (uiStore.runSaveLoaded) chainSearchStore.resetPlanStartTo(initialStateStore.rawBackup?.approxTime);
    uiStore.runSaveLoaded = null;
    isHeaderCollapsed.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Plan Next failed';
    uiStore.staleBackup = backupFailureReason(e);
    await planFromLastGoodSave();
    console.error('Plan Next Ascension error:', e);
  } finally {
    loading.value = false;
  }
}

async function saveCurrentPlan() {
  if (!partitionHash.value) return;

  if (actionsStore.activePlanId) {
    const { safeImport } = await import('@/lib/import');
    const plans = await (await safeImport(() => import('@/lib/storage/db'))).loadLibraryPlans(partitionHash.value!);
    const current = plans.find(p => p.id === actionsStore.activePlanId);
    if (current) {
      await actionsStore.savePlan(current.name, partitionHash.value);
      return;
    }
  }

  // Prompt for name if no active plan
  const name = prompt('Enter a name for this plan:');
  if (name) {
    await actionsStore.savePlan(name, partitionHash.value);
  }
}

async function savePlanAs() {
  if (!partitionHash.value) return;
  const name = prompt('Enter a new name for this plan:');
  if (name) {
    // Reset ID to trigger a new save
    const tempId = actionsStore.activePlanId;
    actionsStore.activePlanId = null;
    try {
      await actionsStore.savePlan(name, partitionHash.value);
    } catch (err) {
      actionsStore.activePlanId = tempId;
      alert('Save failed: ' + err);
    }
  }
}

// Chevron for the collapsible sections. A render function, not a `template:` string: the app ships
// Vue's runtime-only build, which cannot compile a template at runtime and renders such a component
// as an empty comment, so the collapse buttons had no visible icon at all.
const ChevronIcon: FunctionalComponent<{ expanded?: boolean }> = props =>
  h(
    'svg',
    {
      class: ['w-5 h-5 text-gray-400 transition-transform', { 'rotate-180': props.expanded }],
      fill: 'none',
      stroke: 'currentColor',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
    },
    [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M19 9l-7 7-7-7' })]
  );
ChevronIcon.props = { expanded: Boolean };
</script>

<style scoped>
.heading-xl {
  @apply text-3xl md:text-4xl font-black uppercase tracking-tighter;
}
.text-gradient {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.section-premium {
  @apply bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500;
}
.btn-premium {
  @apply rounded-xl font-black uppercase tracking-widest text-[10px] transition-all duration-300 flex items-center justify-center gap-2;
}
.btn-primary {
  @apply bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95;
}
.btn-ghost {
  @apply bg-transparent hover:bg-slate-50 border border-slate-100;
}
</style>
