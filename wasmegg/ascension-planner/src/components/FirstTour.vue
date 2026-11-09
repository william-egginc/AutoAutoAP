<!--
  The first-visit tour on the page (spec-firsttour, 8 Nov 2026; design ~/code/aaap-tools/notes/tutorial-design.md):
  a ring around the step's real target (lib/firstTour.ts TOUR_ANCHORS) and the card (FirstTourCard.vue) beside it, a
  bottom sheet below 640 px kept above the Setup pill (measured live: it is draggable and one or two lines tall). No
  backdrop, no dimming, nothing made inert: the ring is aria-hidden and takes no pointer. What it does is the controller's
  (composables/useFirstTour.ts); this wires the page to it: the targets, the waits it can only see on the page (an update
  box, the planned-update banner, a modal dialog), Esc, a Follow press, focus, and Tab on from the card to the target.
  Mounted once in App.vue.
-->
<template>
  <Teleport to="body">
    <p class="sr-only" role="status" aria-live="polite" data-testid="first-tour-live">{{ shown ? tour.state.announce : '' }}</p>
    <template v-if="shown">
      <div
        v-if="ring"
        class="pointer-events-none fixed z-[1050] rounded-[14px] ring-[3px] ring-indigo-600 shadow-[0_0_0_7px_rgba(79,70,229,0.18)]"
        :style="{ left: `${ring.x}px`, top: `${ring.y}px`, width: `${ring.w}px`, height: `${ring.h}px` }"
        aria-hidden="true"
        data-testid="first-tour-ring"
      ></div>
      <div
        ref="boxEl"
        class="fixed z-[1060]"
        :class="place.sheet ? 'left-2 right-2' : 'w-[22.5rem] max-w-[calc(100vw-2rem)]'"
        :style="place.style"
        data-testid="first-tour-box"
      >
        <span
          v-if="place.arrow"
          class="absolute h-3.5 w-3.5 rotate-45 border-indigo-200 bg-white"
          :class="
            place.arrow.dir === 'up'
              ? '-top-[7px] border-l border-t'
              : place.arrow.dir === 'down'
                ? '-bottom-[7px] border-b border-r'
                : '-left-[7px] border-b border-l'
          "
          :style="place.arrow.dir === 'left' ? { top: `${place.arrow.at}px` } : { left: `${place.arrow.at}px` }"
          aria-hidden="true"
        ></span>
        <div :class="place.sheet ? 'max-h-[45vh] overflow-y-auto rounded-2xl' : ''">
          <FirstTourCard
            ref="cardEl"
            :label="label"
            :title="words.title"
            :body="body"
            :closing="tour.isLast.value ? FIRST_TOUR_CLOSING : undefined"
            :first="tour.isFirst.value"
            :last="tour.isLast.value"
            :remind="tour.state.remind"
            @back="tour.back()"
            @next="tour.next()"
            @done="tour.done()"
            @skip="tour.skip()"
            @update:remind="(v: boolean) => (tour.state.remind = v)"
          />
        </div>
      </div>
      <!-- Tab from the card's last control goes on to the step's target (no trap: Shift+Tab and the page work as usual). -->
      <span tabindex="0" class="sr-only" data-testid="first-tour-bridge" @focus="toTarget"></span>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import FirstTourCard from './FirstTourCard.vue';
import { TOUR_ANCHORS, TOUR_UNION, type TourAnchor } from '@/lib/firstTour';
import { storageBlocked } from '@/lib/storageGuard';
import { FIRST_TOUR_CLOSING, FIRST_TOUR_MYRUNS_NOT_YET, FIRST_TOUR_STEPS, firstTourLabel } from '@/lib/firstTourWords';
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

/** What the page shows that the tour waits behind and only the page can see; polled while the tour is open. */
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

const onScreen = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0;
function pick(sel: string): HTMLElement | null {
  for (const el of document.querySelectorAll(sel)) if (onScreen(el)) return el as HTMLElement;
  return null;
}
function isFixed(el: HTMLElement): boolean {
  for (let e: HTMLElement | null = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true;
  return false;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The step's target on screen now: its element(s), the anchor used. */
const target = ref<{ els: HTMLElement[]; anchor: TourAnchor } | null>(null);
function findTarget(): void {
  const step = tour.step.value;
  const anchors = TOUR_ANCHORS[step];
  const found: { el: HTMLElement; anchor: TourAnchor }[] = [];
  for (const a of anchors) {
    let el = pick(a.sel);
    if (el && a.up) el = (el.closest(a.up) as HTMLElement | null) ?? el;
    if (el) {
      found.push({ el, anchor: a });
      if (!TOUR_UNION.includes(step)) break;
    }
  }
  target.value = found.length ? { els: found.map(f => f.el), anchor: found[0].anchor } : null;
  // The step's target changed under it (My runs opened on step 5: the tracker): bring the new one into view.
  const now = target.value?.els[0] ?? null;
  if (now && now !== lastEl) {
    if (lastEl && lastStep === step) moved = true;
    lastEl = now;
    lastStep = step;
  }
}
let moved = false;
let lastEl: HTMLElement | null = null;
let lastStep = '';

const beforeSave = computed(() => !props.hasAccount && !props.hasSaveFile && tour.step.value !== 'load');
const words = computed(() => FIRST_TOUR_STEPS[tour.step.value]);
const body = computed(() => (target.value?.anchor.notYet ? FIRST_TOUR_MYRUNS_NOT_YET : words.value.body));
const label = computed(() => firstTourLabel(tour.state.index + 1, tour.total.value, beforeSave.value));

/** Where the ring and the card are, worked out from the target's live rectangle. */
const rect = ref<Box | null>(null);
const vw = ref(1024);
const vh = ref(768);
const pill = ref<Box | null>(null);
const boxEl = ref<HTMLElement | null>(null);
const cardH = ref(220);

function measure(): void {
  vw.value = window.innerWidth;
  vh.value = window.innerHeight;
  const p = pick('[data-testid="setup-dock-pill"]');
  const pr = p?.getBoundingClientRect();
  pill.value = pr ? { x: pr.left, y: pr.top, w: pr.width, h: pr.height } : null;
  if (boxEl.value) cardH.value = boxEl.value.getBoundingClientRect().height || cardH.value;
  const els = target.value?.els.filter(e => e.isConnected && onScreen(e)) ?? [];
  if (!els.length) {
    rect.value = null;
    return;
  }
  const rs = els.map(e => e.getBoundingClientRect());
  const x = Math.min(...rs.map(r => r.left));
  const y = Math.min(...rs.map(r => r.top));
  rect.value = { x, y, w: Math.max(...rs.map(r => r.right)) - x, h: Math.max(...rs.map(r => r.bottom)) - y };
}

const phone = computed(() => vw.value < 640);
/** The sheet's bottom edge, px from the viewport's bottom: above the Setup pill when it sits low. */
const sheetBottom = computed(() => (pill.value && pill.value.y > vh.value / 2 ? vh.value - pill.value.y + 8 : 16));
const PAD = 6;
const ring = computed<Box | null>(() => {
  const r = rect.value;
  if (!r || r.y + r.h < 0 || r.y > vh.value) return null;
  let h = r.h + 2 * PAD;
  const cap = target.value?.anchor.ringMax;
  if (cap) h = Math.min(h, cap + 2 * PAD);
  // On a phone the sheet never covers the ringed part: a tall target is ringed at its top.
  if (phone.value) {
    const sheetTop = vh.value - sheetBottom.value - cardH.value;
    if (r.y < sheetTop) h = Math.min(h, sheetTop - (r.y - PAD) - 8);
  }
  return { x: r.x - PAD, y: r.y - PAD, w: r.w + 2 * PAD, h: Math.max(h, 24) };
});

const CARD_W = 360;
const GAP = 14;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
interface Place {
  sheet: boolean;
  style: Record<string, string>;
  arrow: { dir: 'up' | 'down' | 'left'; at: number } | null;
}
const place = computed((): Place => {
  if (phone.value) return { sheet: true, style: { bottom: `calc(${sheetBottom.value}px + env(safe-area-inset-bottom, 0px))` }, arrow: null };
  const r = ring.value;
  const W = vw.value;
  const H = vh.value;
  const ch = cardH.value;
  if (!r) return { sheet: false, style: { left: `${Math.max(16, (W - CARD_W) / 2)}px`, top: `${Math.max(80, H * 0.25)}px` }, arrow: null };
  const left = Math.min(Math.max(16, r.x + r.w / 2 - CARD_W / 2), W - 16 - CARD_W);
  const arrowAt = Math.min(Math.max(16, r.x + r.w / 2 - left - 7), CARD_W - 30);
  const below = r.y + r.h + GAP;
  const clearOfPill = (top: number) => !pill.value || overlaps({ x: left, y: top, w: CARD_W, h: ch }, pill.value) === false;
  if (below + ch <= H - 8 && clearOfPill(below)) return { sheet: false, style: { left: `${left}px`, top: `${below}px` }, arrow: { dir: 'up', at: arrowAt } };
  const above = r.y - GAP - ch;
  if (above >= 8) return { sheet: false, style: { left: `${left}px`, top: `${above}px` }, arrow: { dir: 'down', at: arrowAt } };
  if (r.x + r.w + GAP + CARD_W <= W - 8) {
    const top = Math.min(Math.max(8, r.y), H - ch - 8);
    return { sheet: false, style: { left: `${r.x + r.w + GAP}px`, top: `${top}px` }, arrow: { dir: 'left', at: Math.min(Math.max(16, r.y + 20 - top), ch - 30) } };
  }
  return { sheet: false, style: { left: `${left}px`, top: `${Math.min(below, H - ch - 8)}px` }, arrow: null };
});

/** Bring the target into view on a new step (never while the player scrolls). */
function scrollToTarget(): void {
  const el = target.value?.els[0];
  if (!el || isFixed(el)) return;
  const r = el.getBoundingClientRect();
  const H = window.innerHeight;
  const room = phone.value ? H - sheetBottom.value - cardH.value : H;
  // In view and in the upper half (room for the card under it, clear of the Setup pill): left where it is.
  if (r.top >= 56 && r.top <= H / 2 && r.top + Math.min(r.height, 120) <= room - 8) return;
  const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 72), behavior: smooth ? 'smooth' : 'auto' });
}

const cardEl = ref<InstanceType<typeof FirstTourCard> | null>(null);
let before: HTMLElement | null = null;
/** Tab on from the card: the target's first control, else the target if it takes focus. */
function toTarget(): void {
  const el = target.value?.els[0];
  if (!el) return;
  const f = el.matches('a[href],button,input,select,textarea,[tabindex]')
    ? el
    : el.querySelector<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
  f?.focus();
}

function refresh(): void {
  seen.updateBox = !!pick('[data-testid^="update-banner-"]');
  seen.plannedUpdate = !!pick('[data-testid="reload-planned-banner"]');
  seen.modal = [...document.querySelectorAll('[aria-modal="true"], [role="alertdialog"]')].some(e => onScreen(e));
  findTarget();
  measure();
  // Kept until the card shows (a page loading in between hides it).
  if (moved && shown.value) {
    moved = false;
    scrollToTarget();
  }
}
let frame = 0;
const onMove = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    measure();
  });
};
function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || !shown.value) return;
  if (tour.key(e.key, wait.value)) e.preventDefault();
}
/** A Follow this route press in the instant answer on step 4 moves on by itself. */
function onClick(e: MouseEvent): void {
  if (!tour.state.open || tour.step.value !== 'follow') return;
  const b = (e.target as Element | null)?.closest?.('[data-testid="follow-route"]');
  if (b && b.closest('[data-tour="instant-answer"]')) setTimeout(() => tour.followed(), 0);
}

let timer: ReturnType<typeof setInterval> | null = null;
function startPolling(): void {
  if (timer) return;
  refresh();
  timer = setInterval(refresh, 400);
}
function stopPolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
watch(
  () => tour.state.open,
  open => {
    if (open) {
      if (!before) before = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      startPolling();
    } else stopPolling();
  }
);

// Focus: the card's title when it shows after an open or Back / Next; back where it was after Skip or Done.
watch(
  () => [shown.value, tour.state.wantFocus, tour.state.index] as const,
  async ([s, want]) => {
    if (!s) return;
    await nextTick();
    refresh();
    if (want) {
      cardEl.value?.focusTitle();
      tour.focused();
    }
  }
);
watch(
  () => tour.state.index,
  async () => {
    await nextTick();
    refresh();
    scrollToTarget();
  }
);
watch(
  () => tour.state.restoreFocus,
  r => {
    if (!r) return;
    const back = before && before.isConnected ? before : (document.getElementById('main-content') as HTMLElement | null);
    back?.focus?.({ preventScroll: true });
    before = null;
    tour.focusRestored();
  }
);

watch(
  () => [props.hasAccount, props.hasSaveFile] as const,
  () => {
    tour.setEnv(env());
    tour.saveLoaded();
  }
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
  window.addEventListener('scroll', onMove, { passive: true });
  window.addEventListener('resize', onMove);
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onClick, true);
  if (tour.state.open) startPolling();
});
onUnmounted(() => {
  stopPolling();
  window.removeEventListener('scroll', onMove);
  window.removeEventListener('resize', onMove);
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('click', onClick, true);
});
</script>
