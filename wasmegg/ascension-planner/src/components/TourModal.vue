<!--
  The first-visit tour v2 on the page (spec-firsttour2, 9 Nov 2026; design ~/code/aaap-tools/notes/tutorial-v2-design.md):
  a REAL modal. Teleported to <body>, outside #app; while it shows the app behind is inert (hidden from screen readers
  too) and the page doesn't scroll, the backdrop greys it out and does nothing when tapped, Tab and Shift+Tab stay inside
  the box, Esc = Skip, ← / → move the slides. It waits, hidden, behind every other modal dialog, the update box, the
  egg-beta reload and planned-update banners, the consent box (a replay), the Setup panel and a page load, so two never
  stack. What it does is the controller's (composables/useFirstTour.ts); what it shows is TourDialog.vue. Mounted once
  in App.vue. Replaces v1's FirstTour.vue (a ring and a card beside the real page).
-->
<template>
  <Teleport to="body">
    <p class="sr-only" role="status" aria-live="polite" data-testid="tour-live">{{ shown ? tour.state.announce : '' }}</p>
    <div v-if="shown" class="fixed inset-0 z-[1200] overflow-y-auto" data-testid="tour-modal" @keydown="onKeydown" @mousedown="keepFocus">
      <div class="fixed inset-0 bg-slate-900/60" aria-hidden="true" data-testid="tour-backdrop"></div>
      <div
        class="relative flex min-h-full justify-center p-2 sm:p-6"
        :class="tour.state.phase === 'welcome' ? 'items-center' : 'items-start sm:items-center'"
      >
        <TourDialog
          ref="dialogEl"
          :phase="tour.state.phase === 'welcome' ? 'welcome' : 'slides'"
          :remind="tour.state.remind"
          :index="tour.state.index"
          :total="tour.total.value"
          :slide="slide"
          @take="tour.take()"
          @skip="tour.skip()"
          @load="tour.loadMySave()"
          @back="tour.back()"
          @next="tour.next()"
          @done="tour.done()"
          @update:remind="(v: boolean) => (tour.state.remind = v)"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import TourDialog from './TourDialog.vue';
import { storageBlocked } from '@/lib/storageGuard';
import { TOUR_SLIDES } from '@/lib/tourSlides';
import { createTourController, tourReplayAsked, useFirstTour, type TourWait } from '@/composables/useFirstTour';
import { studyBoxOpen } from '@/composables/useStudy';
import { useUIStore } from '@/stores/ui';

const props = defineProps<{
  hasAccount: boolean;
  hasSaveFile: boolean;
  /** A search is running (any screen). */
  running: boolean;
  /** The egg-beta timed reload banner shows (App.vue `eggBetaActive`). */
  eggBetaActive: boolean;
  loading: boolean;
  /** No saved player ID and no remembered tab when the page loaded (lib/firstTour.ts isNewVisitor). */
  newVisitor: boolean;
}>();

const ui = useUIStore();
const tour = useFirstTour(() => createTourController({ blocked: storageBlocked(), newVisitor: props.newVisitor }))!;
const env = () => ({ hasAccount: props.hasAccount, hasSaveFile: props.hasSaveFile, running: props.running });
const slide = computed(() => TOUR_SLIDES.find(s => s.id === tour.step.value) ?? null);

/** What only the page can show that the tour waits behind; looked at while it is open. */
const seen = reactive({ updateBox: false, plannedUpdate: false, modal: false });
const wait = computed<TourWait>(() => ({
  consentOpen: studyBoxOpen.value,
  updateBox: seen.updateBox,
  eggBetaReload: props.eggBetaActive,
  plannedUpdate: seen.plannedUpdate,
  modal: seen.modal,
  setupOpen: ui.setupOpen,
  loading: props.loading,
}));
const shown = computed(() => tour.visible(wait.value));

const onScreen = (el: Element) => el.getClientRects().length > 0;
function look(): void {
  seen.updateBox = [...document.querySelectorAll('[data-testid^="update-banner-"]')].some(onScreen);
  seen.plannedUpdate = [...document.querySelectorAll('[data-testid="reload-planned-banner"]')].some(onScreen);
  seen.modal = [...document.querySelectorAll('[aria-modal="true"]:not([data-testid="tour-dialog"]), [role="alertdialog"]')].some(onScreen);
}
let timer: ReturnType<typeof setInterval> | null = null;
watch(
  () => tour.state.phase,
  phase => {
    if (phase !== 'closed' && !timer) {
      look();
      timer = setInterval(look, 400);
    } else if (phase === 'closed' && timer) {
      clearInterval(timer);
      timer = null;
    }
  },
  { immediate: true }
);

// The app behind: inert (no focus, no pointer, hidden from screen readers) and not scrolling while the box shows.
let before: HTMLElement | null = null;
function setBehind(on: boolean): void {
  const app = document.getElementById('app');
  if (app) app.inert = on;
  document.documentElement.style.overflow = on ? 'hidden' : '';
}
watch(shown, on => {
  if (on && !before) before = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  setBehind(on);
});

// Focus: Take the tour when the box opens, the slide's title on each slide.
const dialogEl = ref<InstanceType<typeof TourDialog> | null>(null);
watch(
  () => [shown.value, tour.state.wantFocus, tour.state.index] as const,
  async ([s, want]) => {
    if (!s || !want) return;
    await nextTick();
    if (want === 'take') dialogEl.value?.focusTake();
    else dialogEl.value?.focusTitle();
    tour.focused();
  }
);
// After it closes: the ID box, the save-file button, or where focus was.
watch(
  () => tour.state.restore,
  async r => {
    if (!r) return;
    await nextTick();
    const to =
      r === 'id'
        ? document.getElementById('playerId')
        : r === 'file'
          ? document.querySelector<HTMLElement>('[data-testid="no-account-save-file"] button')
          : before && before.isConnected
            ? before
            : null;
    (to ?? document.getElementById('playerId'))?.focus();
    before = null;
    tour.focusRestored();
  }
);

/** Tab and Shift+Tab wrap inside the box. */
function trapTab(e: KeyboardEvent): void {
  const box = document.querySelector<HTMLElement>('[data-testid="tour-dialog"]');
  if (!box) return;
  const items = [...box.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter(onScreen);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (e.shiftKey && (at === first || !box.contains(at))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (at === last || !box.contains(at))) {
    e.preventDefault();
    first.focus();
  }
}
/** A press outside the box does nothing, and doesn't take focus out of it either. */
function keepFocus(e: MouseEvent): void {
  if (!document.querySelector('[data-testid="tour-dialog"]')?.contains(e.target as Node)) e.preventDefault();
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Tab') trapTab(e);
}
/** Esc = Skip, ← / → the slides (on the document, so it works wherever focus is while the box shows). */
function onDocKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || !shown.value) return;
  if (e.key === 'Tab' && !document.querySelector('[data-testid="tour-dialog"]')?.contains(document.activeElement)) {
    trapTab(e);
    return;
  }
  if (tour.key(e.key, wait.value)) e.preventDefault();
}

watch(
  () => [props.hasAccount, props.hasSaveFile] as const,
  () => tour.setEnv(env())
);
watch(
  () => props.running,
  r => {
    tour.setEnv(env());
    if (r) tour.searchStarted();
  }
);
watch(tourReplayAsked, () => {
  before = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  tour.replay(env());
});

onMounted(() => {
  tour.begin(env());
  document.addEventListener('keydown', onDocKey);
});
onUnmounted(() => {
  document.removeEventListener('keydown', onDocKey);
  if (timer) clearInterval(timer);
  setBehind(false);
});
</script>
