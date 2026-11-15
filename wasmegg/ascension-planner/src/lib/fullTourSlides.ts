/**
 * The full tour's pictures (spec-fulltour, 14 Nov 2026): one per step, a real screen of the sample account with everything
 * but the step's part greyed out, baked in, as the first tour's (lib/tourSlides.ts). Made by
 * ~/code/aaap-tools/harness-r7/spec-fulltour/make-full-tour-images.mjs. Loaded ONLY when the full tour opens
 * (components/TourModal.vue imports this file dynamically), so a visitor who never asks never downloads them; vite
 * fingerprints them. Nothing the result hash covers imports this file.
 */
import type { FullTourStepId } from './fullTour';
import type { TourPicture } from './tourSlides';
import tabsDesk from '@/assets/fulltour/1-tabs-desk.webp';
import tabsPhone from '@/assets/fulltour/1-tabs-phone.webp';
import chipDesk from '@/assets/fulltour/2-chip-desk.webp';
import chipPhone from '@/assets/fulltour/2-chip-phone.webp';
import saveBlockDesk from '@/assets/fulltour/3-saveBlock-desk.webp';
import saveBlockPhone from '@/assets/fulltour/3-saveBlock-phone.webp';
import switchDesk from '@/assets/fulltour/4-switch-desk.webp';
import switchPhone from '@/assets/fulltour/4-switch-phone.webp';
import filtersDesk from '@/assets/fulltour/5-filters-desk.webp';
import filtersPhone from '@/assets/fulltour/5-filters-phone.webp';
import answerDesk from '@/assets/fulltour/6-answer-desk.webp';
import answerPhone from '@/assets/fulltour/6-answer-phone.webp';
import followSimDesk from '@/assets/fulltour/7-followSim-desk.webp';
import followSimPhone from '@/assets/fulltour/7-followSim-phone.webp';
import rightNowDesk from '@/assets/fulltour/8-rightNow-desk.webp';
import rightNowPhone from '@/assets/fulltour/8-rightNow-phone.webp';
import trackerDesk from '@/assets/fulltour/9-tracker-desk.webp';
import trackerPhone from '@/assets/fulltour/9-tracker-phone.webp';
import eggsDesk from '@/assets/fulltour/10-eggs-desk.webp';
import eggsPhone from '@/assets/fulltour/10-eggs-phone.webp';
import dockDesk from '@/assets/fulltour/11-dock-desk.webp';
import dockPhone from '@/assets/fulltour/11-dock-phone.webp';
import moreDesk from '@/assets/fulltour/12-more-desk.webp';
import morePhone from '@/assets/fulltour/12-more-phone.webp';
import blackBoxDesk from '@/assets/fulltour/13-blackBox-desk.webp';
import blackBoxPhone from '@/assets/fulltour/13-blackBox-phone.webp';
import leaderboardDesk from '@/assets/fulltour/14-leaderboard-desk.webp';
import leaderboardPhone from '@/assets/fulltour/14-leaderboard-phone.webp';

const desk = (src: string): TourPicture => ({ src, width: 720, height: 406 });
const phone = (src: string): TourPicture => ({ src, width: 390, height: 440 });

export interface FullTourSlide {
  id: FullTourStepId;
  desk: TourPicture;
  phone: TourPicture;
}
const PICTURES: Record<FullTourStepId, { desk: TourPicture; phone: TourPicture }> = {
  tabs: { desk: desk(tabsDesk), phone: phone(tabsPhone) },
  chip: { desk: desk(chipDesk), phone: phone(chipPhone) },
  saveBlock: { desk: desk(saveBlockDesk), phone: phone(saveBlockPhone) },
  switch: { desk: desk(switchDesk), phone: phone(switchPhone) },
  filters: { desk: desk(filtersDesk), phone: phone(filtersPhone) },
  answer: { desk: desk(answerDesk), phone: phone(answerPhone) },
  followSim: { desk: desk(followSimDesk), phone: phone(followSimPhone) },
  rightNow: { desk: desk(rightNowDesk), phone: phone(rightNowPhone) },
  tracker: { desk: desk(trackerDesk), phone: phone(trackerPhone) },
  eggs: { desk: desk(eggsDesk), phone: phone(eggsPhone) },
  dock: { desk: desk(dockDesk), phone: phone(dockPhone) },
  more: { desk: desk(moreDesk), phone: phone(morePhone) },
  blackBox: { desk: desk(blackBoxDesk), phone: phone(blackBoxPhone) },
  leaderboard: { desk: desk(leaderboardDesk), phone: phone(leaderboardPhone) },
};
export const FULL_TOUR_SLIDES: FullTourSlide[] = (Object.keys(PICTURES) as FullTourStepId[]).map(id => ({ id, ...PICTURES[id] }));
