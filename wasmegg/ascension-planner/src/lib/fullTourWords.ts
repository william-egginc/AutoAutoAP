/**
 * Every word of the full tour (spec-fulltour, 14 Nov 2026; rebuilt as 42 slides, spec-tour-v4, 16 Nov 2026). Words owns the text
 * (~/code/aaap-tools/notes/words-full-tour-text-2026-11-16.md): the slides that are also in the first tour say what the first
 * tour says (lib/firstTourWords.ts), the rest are Words' for the full tour. Titles are DRAFT (UI's). Each body stays within the
 * first tour's cap (lib/firstTourWords.spec.ts), plain words, "Press" for what you do. Wording only, so never part of the result hash.
 */
import type { FullTourStepId } from './fullTour';
import { FIRST_TOUR_ALT, FIRST_TOUR_STEPS } from './firstTourWords';
import type { TourStepId } from './firstTour';

/** The slides the full tour shares with the first tour. */
const SHARED = ['tabManual', 'tabAuto', 'tabChain', 'tabMyruns', 'load', 'goalTarget', 'goalDate', 'result', 'filters', 'setupAwake', 'setupTimeOff', 'prefer', 'simulate', 'follow', 'myrunsPage', 'followedRoute', 'nextStep', 'tracker', 'setupWhere', 'setupInside', 'shifts'] as const satisfies readonly TourStepId[];
type SharedId = (typeof SHARED)[number];
type OwnId = Exclude<FullTourStepId, SharedId>;

const OWN: Record<OwnId, { title: string; body: string }> = {
  tabLeaderboard: { title: "Leaderboard", body: "Leaderboard shows everyone's shared runs. It shows only once turned on, in Setup › More options › How the site shows things." },
  tabScience: { title: "Science", body: "Science explains how the planner works and how it was checked. It shows only once turned on, in Setup › More options › How the site shows things." },
  tabInsights: { title: "Insights", body: "Insights shows what the planner has learned from shared runs. It is part of the Leaderboard, so turn that tab on first, in Setup › More options." },
  m1more: { title: "More", body: "More is the fold at the foot of Chain Finder. It holds the searches, maxed gear and how it works, and stays shut until you open it." },
  m2search: { title: "Search", body: "Search has three choices: Fast, Exact and Custom. Each says what it is for, and Fast and Exact show how long they take here." },
  m3fast: { title: "Fast", body: "Fast is a quick check near the instant answer. It is usually close to the best." },
  m4exact: { title: "Exact", body: "Exact is a slower, wider check. Press it for a second opinion on the instant answer." },
  m5custom: { title: "Custom", body: "Custom lets you set the search boxes yourself, to prove the answer inside them." },
  m6run: { title: "Run", body: "Run starts the search you picked. The estimate beside it is how long it takes here, on your phone or computer." },
  m7send: { title: "Send to the Leaderboard", body: "Tick this to send the result to the Leaderboard when it finishes. Never your player ID or your save. The line under it, Before you send, shows what goes." },
  m8whatThisDoes: { title: "What this does", body: "What this does says what the search checks, and what it leaves out." },
  m9searchSettings: { title: "Settings", body: "Settings shows where the search starts, which ascension counts it tries and how many routes it may check." },
  m10maxedGear: { title: "Maxed gear", body: "The What if you had maxed gear? line finds your route again as if all your gear were maxed (all legendary, T4 stones). It is a ballpark, to show what is possible." },
  m11steppingAway: { title: "Stepping away", body: "The Stepping away? fold has helpers for a long search: carry on after a crash, watch it from your phone and send progress." },
  m12howItWorks: { title: "How it works", body: "How it works opens Science, which shows how the answer is worked out and how it was checked." },
  r1changeRoute: { title: "Change route", body: "Change route is where you stop following, go back to an earlier version, or follow another route by typing or picking one." },
  r2gearSets: { title: "Gear sets", body: "The Gear sets for the route fold shows what you wear now, the earnings set, the delivery set, and what you are missing for a perfect set." },
  r3tryNext: { title: "Try next", body: "The Try next buttons are the next searches to run: Egg Day, Fast; Exact on my 490 route; and Custom (around 5 ascensions). The numbers come from your route." },
  r4share: { title: "Share my instant answer", body: "The Share my instant answer with my runs tick sends its route and date beside each run you send, so the Leaderboard shows what the search gained. Never your ID or save." },
  r5yourRuns: { title: "Your runs", body: "Your runs lists your searches: the latest Fastest, the latest By a date, or all of them. Each is compared with the instant answer for your save that day." },
  r6boardRuns: { title: "Leaderboard runs", body: "The Your runs on the Leaderboard fold lists the runs you sent. The A run of yours isn’t here? fold says why a run is missing, from its id." },
};
const OWN_ALT: Record<OwnId, string> = {
  tabLeaderboard: "The tab row, with the Leaderboard tab turned on and ringed, an arrow pointing at it.",
  tabScience: "The tab row, with the Science tab turned on and ringed, an arrow pointing at it.",
  tabInsights: "The Leaderboard screen with its Insights view ringed, an arrow pointing at it.",
  m1more: "The More fold on Chain Finder, with an arrow pointing at its header.",
  m2search: "The Search card inside More, with an arrow pointing at the Fast, Exact and Custom choices.",
  m3fast: "The Fast choice, ringed, with an arrow pointing at it.",
  m4exact: "The Exact choice, ringed, with an arrow pointing at it.",
  m5custom: "The Custom choice, ringed, with an arrow pointing at it.",
  m6run: "The Run button and its time estimate, with an arrow pointing at them.",
  m7send: "The tick to send the result to the Leaderboard when the search finishes, with an arrow pointing at it.",
  m8whatThisDoes: "The What this does fold, with an arrow pointing at it.",
  m9searchSettings: "The Settings fold, with an arrow pointing at it.",
  m10maxedGear: "The What if you had maxed gear? line in More, with an arrow pointing at it.",
  m11steppingAway: "The Stepping away? fold, with an arrow pointing at it.",
  m12howItWorks: "The How it works link at the foot of More, with an arrow pointing at it.",
  r1changeRoute: "The Change route card inside More on My runs, with an arrow pointing at it.",
  r2gearSets: "The gear sets for the route inside More on My runs, with an arrow pointing at them.",
  r3tryNext: "The Try next buttons inside More on My runs, with an arrow pointing at them.",
  r4share: "The Share my instant answer with my runs tick inside More on My runs, with an arrow pointing at it.",
  r5yourRuns: "The Latest and All my runs choices under Your runs, with an arrow pointing at them.",
  r6boardRuns: "The Your runs on the Leaderboard fold and the A run of yours is not here? fold, with an arrow pointing at them.",
};

export const FULL_TOUR_STEPS_WORDS = Object.fromEntries([
  ...SHARED.map(id => [id, FIRST_TOUR_STEPS[id]] as const),
  ...(Object.keys(OWN) as OwnId[]).map(id => [id, OWN[id]] as const),
]) as Record<FullTourStepId, { title: string; body: string }>;

/** Each picture's alt text: what is highlighted, on the sample account. */
export const FULL_TOUR_ALT = Object.fromEntries([
  ...SHARED.map(id => [id, FIRST_TOUR_ALT[id]] as const),
  ...(Object.keys(OWN_ALT) as OwnId[]).map(id => [id, OWN_ALT[id]] as const),
]) as Record<FullTourStepId, string>;

export const FULL_TOUR_CLOSING = "That's everything. Show it again any time from More › Full tour.";
/** The entries: More's item, the first tour's last card, About's line. */
export const FULL_TOUR_ITEM = 'Full tour';
export const FULL_TOUR_FROM_FIRST = 'More: Full tour';
export const FULL_TOUR_ABOUT = 'Want to see where everything is? Open More on Chain Finder or My runs and press Full tour.';

/** Said to a screen reader on each step. */
export const fullTourAnnounce = (n: number, of: number, title: string): string => `Full tour, step ${n} of ${of}: ${title}`;
