/**
 * The first-visit tour's slideshow (spec-firsttour2, 9 Nov 2026; design ~/code/aaap-tools/notes/tutorial-v2-design.md):
 * one picture per step, a real screen of a sample account ("Sample": a scrubbed save, no player ID) with everything but
 * the step's part greyed out, baked in. Tour v3 (spec-tour-v3, 16 Nov 2026) adds an arrow to each, and a
 * magnified target when a slide points at one thing. Made by ~/code/aaap-tools/harness-r7/simpler/tour/make-tour-images-v3.mjs
 * (rerun it whenever one of these screens changes; it writes assets/tour/rings.json too, which lib/tourRings.spec.ts checks). Imported, so vite fingerprints them; the page
 * asks for them only when the slideshow shows, and a <picture> fetches one set (desk from 640 px, phone below).
 * Nothing the result hash covers imports this file.
 */
import { stepsFor, TOUR_STEPS, type TourStepId } from './firstTour';
import overlayData from '@/assets/tour/overlays.json';

/** Every picture in src/assets/tour/, by file stem (vite fingerprints them; eager, so each is a URL, loaded by the page only
 *  when the slideshow asks for it). */
const FILES = import.meta.glob('../assets/tour/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const tourUrl = (stem: string): string => {
  const u = FILES[`../assets/tour/${stem}.webp`];
  if (!u) throw new Error(`tour picture missing: ${stem}`);
  return u;
};

/** The baked picture of a slide that has no live overlay (several targets), numbered in tour order. */
export const TOUR_FILES: Record<TourStepId, string> = {
  tabManual: '1-tab-manual',
  tabAuto: '2-tab-auto',
  tabChain: '3-tab-chain',
  tabMyruns: '4-tab-myruns',
  load: '5-load',
  goalTarget: '6-goal-target',
  goalDate: '7-goal-date',
  result: '8-result',
  filters: '9-filters',
  setupAwake: '10-setup-awake',
  setupTimeOff: '11-setup-time-off',
  prefer: '12-prefer',
  simulate: '14-simulate',
  follow: '15-follow',
  myrunsPage: '16-myruns-page',
  followedRoute: '17-followed-route',
  nextStep: '18-next-step',
  tracker: '19-tracker',
  setupWhere: '20-setup-where',
  setupInside: '21-setup-inside',
  shifts: '22-shifts',
  closing: '23-closing',
};

export interface TourPicture {
  src: string;
  width: number;
  height: number;
}
export interface TourRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** What the dialog draws over a shared page picture (all numbers in the picture's own crop pixels, `cw` x `ch`): the ring
 *  (round `rect`, the thing), an arrow whose tip (x, y) touches the ring, an enlarged copy of the thing (`sprite`, drawn in
 *  `rect`) when it is one small thing, and light rings round the top tab it lives under (`tabs`). The dim is the ring's own
 *  shadow. Slides that share a picture slide the ring, arrow and copy from one to the next (components/TourOverlay.vue). */
export interface SlideOverlay {
  cw: number;
  ch: number;
  rect: TourRect;
  ring: TourRect;
  sprite: string | null;
  tabs: TourRect[];
  /** When the top tab the thing lives under is scrolled out of the picture: a small copy of the tab row at the top left, with that tab
   *  ringed lightly (`sprite` drawn in `rect`, the ring round the tab in `ring`). */
  inset: { sprite: string; rect: TourRect; ring: TourRect } | null;
  arrow: { dir: 'left' | 'right' | 'up' | 'down'; x: number; y: number; len: number };
}
export interface SlideForm {
  picture: TourPicture;
  overlay: SlideOverlay | null;
}
export interface TourSlide {
  id: TourStepId;
  /** From 640 px: 720×406 (a 1100 px screen's 1100×620 crop). */
  desk: TourPicture;
  /** Below 640 px: 390×440. */
  phone: TourPicture;
  /** The live overlay, desk and phone, or absent (a baked picture: the ring is in the picture). */
  overlay?: { desk: SlideOverlay; phone: SlideOverlay };
}
const desk = (src: string): TourPicture => ({ src, width: 720, height: 406 });
const phone = (src: string): TourPicture => ({ src, width: 390, height: 440 });

type RawOverlay = { base: string; cw: number; ch: number; rect: TourRect; ring: TourRect; mag: string | null; tabs: TourRect[]; inset?: { sprite: string; rect: TourRect; ring: TourRect } | null; arrow: SlideOverlay['arrow'] };
const raw = overlayData as Record<string, RawOverlay>;
const overlayOf = (key: string): SlideOverlay | null => {
  const o = raw[key];
  return o ? { cw: o.cw, ch: o.ch, rect: o.rect, ring: o.ring, sprite: o.mag ? tourUrl(o.mag) : null, tabs: o.tabs, inset: o.inset ? { ...o.inset, sprite: tourUrl(o.inset.sprite) } : null, arrow: o.arrow } : null;
};
/** A slide of the tour from the generator's output: live (a shared base picture + overlay) or baked. Exported for the full tour. */
export function buildSlide<Id extends string>(id: Id, bakedStem: string, key: string = id): { id: Id; desk: TourPicture; phone: TourPicture; overlay?: { desk: SlideOverlay; phone: SlideOverlay } } {
  const d = raw[`${key}-desk`], p = raw[`${key}-phone`];
  if (d && p) return { id, desk: desk(tourUrl(d.base)), phone: phone(tourUrl(p.base)), overlay: { desk: overlayOf(`${key}-desk`)!, phone: overlayOf(`${key}-phone`)! } };
  return { id, desk: desk(tourUrl(`${bakedStem}-desk`)), phone: phone(tourUrl(`${bakedStem}-phone`)) };
}

export const TOUR_SLIDES: TourSlide[] = TOUR_STEPS.map(id => buildSlide(id, TOUR_FILES[id]));

/** Whether two slides share one page picture (so the dialog slides the overlay instead of fading). */
export function sharesPicture(a: { desk: TourPicture; phone: TourPicture } | null | undefined, b: { desk: TourPicture; phone: TourPicture } | null | undefined): boolean {
  return !!a && !!b && a.desk.src === b.desk.src && a.phone.src === b.phone.src;
}

/** The slides for what is loaded: a save file with no player ID has no My Runs tab and ends at Follow this route (lib/firstTour.ts stepsFor). */
export function slidesFor(p: { hasAccount: boolean; hasSaveFile: boolean }): TourSlide[] {
  const ids = stepsFor(p);
  return TOUR_SLIDES.filter(s => ids.includes(s.id));
}
