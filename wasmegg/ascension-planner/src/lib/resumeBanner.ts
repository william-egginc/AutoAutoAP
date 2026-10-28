/**
 * RESUME BANNER (ux29-d item 9, 27 Oct 2026): the one offer to carry on an unfinished run, shared by the panel box
 * below (CarryOnOffer.vue) and the slim sticky banner at the top of the Auto Planner (ResumeBanner.vue). Each
 * CarryOnOffer puts its offer here while it shows Carry on, with its own Carry on as `resume`, so the banner never
 * has a handler of its own: Resume is the panel's Carry on. The offer goes when the box goes (a run starts, the
 * screen changes). Dismiss hides the banner for that run (`key`) for this visit; the box below stays.
 */
import { computed, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue';

export interface ResumeOfferInput {
  /** The run (its screen and when it last saved), so Dismiss is per run. */
  key: string;
  /** The box's Carry on is disabled (the store is busy). */
  disabled: boolean;
}

export interface ResumeOffer extends ResumeOfferInput {
  /** The panel's own Carry on. */
  resume: () => void;
}

const offers = shallowRef<{ id: symbol; offer: ResumeOffer }[]>([]);
const dismissed = ref<string[]>([]);

function put(id: symbol, offer: ResumeOffer): void {
  offers.value = [...offers.value.filter(o => o.id !== id), { id, offer }];
}
function drop(id: symbol): void {
  if (offers.value.some(o => o.id === id)) offers.value = offers.value.filter(o => o.id !== id);
}

/** The newest offer not dismissed, or null. */
export const currentResumeOffer = computed<ResumeOffer | null>(() => {
  for (let i = offers.value.length - 1; i >= 0; i--) {
    const o = offers.value[i].offer;
    if (!dismissed.value.includes(o.key)) return o;
  }
  return null;
});

/** Hide the banner for this run (this visit only; the box below stays). */
export function dismissResumeOffer(key: string): void {
  if (!dismissed.value.includes(key)) dismissed.value = [...dismissed.value, key];
}

/**
 * Keep `source`'s offer in the list while it is not null, with `resume` as its Resume; dropped when the current
 * effect scope ends (the component unmounts).
 */
export function bindResumeOffer(source: () => ResumeOfferInput | null, resume: () => void): void {
  const id = Symbol('resume-offer');
  watch(
    source,
    o => (o ? put(id, { ...o, resume }) : drop(id)),
    { immediate: true }
  );
  onScopeDispose(() => drop(id));
}

/** In a component: bound once mounted (a server render never offers anything). */
export function useResumeOffer(source: () => ResumeOfferInput | null, resume: () => void): void {
  onMounted(() => bindResumeOffer(source, resume));
}

/** Specs: forget every offer and dismissal. */
export function resetResumeBanner(): void {
  offers.value = [];
  dismissed.value = [];
}
