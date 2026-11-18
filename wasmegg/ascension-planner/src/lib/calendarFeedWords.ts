/**
 * The Setup card for the calendar feed (spec-calendar-ui, 14 Nov 2026): Words' text, part 1A of
 * ~/code/aaap-tools/notes/words-calendar-and-fulltour-2026-11-14.md. The privacy text (their part 1C: About, the wiki,
 * privacyWords) waits for Jordan's OK and is NOT here. Wording only, so never part of the result hash.
 */
export const CAL_LABEL = 'Put my plan in my calendar';
export const CAL_LINE = 'Makes a private link your calendar can subscribe to. It shows the times of your planned shifts, buys and ascensions.';
export const CAL_OFF = 'Off. Nothing is shared.';
export const CAL_STALE = 'Your calendar may show times up to a day old. For a step that matters to the minute, open the planner.';

export const CAL_GET = 'Get link';
export const CAL_COPY = 'Copy';
export const CAL_COPIED = 'Copied';
export const CAL_APPLE = 'Add to Apple Calendar';
export const CAL_GOOGLE = 'Add to Google Calendar';
export const CAL_RESET = 'Reset link';

export const CAL_SHOWN_ONCE = "Copy it now. It is shown only once. Anyone with this link can see your plan, so don't post it.";
export const CAL_LINKED = 'You have a link. It was shown only once, when you made it. Press Reset link to make a new one.';
export const CAL_RESET_ASK = 'Every link you made stops working at once. Your calendar will need a new one. Reset?';
export const CAL_RESET_YES = 'Reset';
export const CAL_RESET_NO = 'Keep it';
export const CAL_RESET_DONE = 'Done. Your old links no longer work.';

/** Why a call didn't work, in plain words (Words, 14 Nov 2026). `off` is when the plan has no way to reach the server: no collector, or Save online off (the
 *  calendar has its own switch; the plan only travels through Save online's sync). `limit`: Reset link frees every slot at once. */
export const CAL_ERRORS: Record<'limit' | 'busy' | 'offline' | 'error' | 'off' | 'upload', string> = {
  limit: 'You already have 3 links. Press Reset link, then Get link.',
  busy: "That's a lot of links today. Try again tomorrow.",
  offline: "Couldn't reach the planner's server. Try again in a moment.",
  error: "That didn't work. Try again in a moment.",
  off: 'Calendar links need Save online turned on in Setup.',
  // The plan's own upload failing (not a link button): said so, and that the calendar may be stale. It really is sent again: the next plan change, or
  // My runs opened again, finds the last good list unchanged and sends.
  upload: "Couldn't send the plan to your calendar, so it may be out of date. Try again in a moment.",
};

/** Under a link just made while My runs has not given the plan yet (only the marker is up). Words, 14 Nov 2026. */
export const CAL_OPEN_MYRUNS = 'Open My runs once so the plan reaches your calendar. It is only sent from there.';

/** On the card between My runs opening and the first plan upload: the tracker takes a minute or more under load (QA, 15 Nov 2026). Words' text; the plan is worked out and sent from My runs, so leaving it stops the work (third sentence). */
export const CAL_WORKING = 'The plan is being worked out for your calendar. It goes out as soon as it is ready, which can take a minute or two. Keep this page open until then.';

/** The nod under "Add all N upcoming to calendar" on My runs' plan table (Jordan, 15 Nov 2026; Words' final text). "Sharing" is the card's real heading in Setup. */
export const CAL_NOD_SUGGEST = 'Want it to update itself? Turn on Put my plan in my calendar in Setup › Sharing. Then there is nothing to add again.';
export const CAL_NOD_UPDATE = 'Update cloud calendar';
export const CAL_NOD_SENT = 'Sent to your calendar.';
export const CAL_NOD_SAME = 'Your calendar is already up to date.';
/** The feed only gets the plan from My runs, so "whenever you open My runs", not "when the plan changes". */
export const CAL_NOD_HINT = 'It also updates by itself whenever you open My runs.';

/**
 * THE SAVED LINK (callink, 17 Nov 2026; Jordan: the calendar link shows in every browser of a player's). DRAFT (UI; Words to review). The link is
 * kept, encrypted in the browser, so another browser can show it again; `unreadable` is a saved copy this browser can't read.
 */
/** Above the link read back from the saved copy, in place of CAL_SHOWN_ONCE. */
export const CAL_SAVED = "Your saved link. Anyone with it can see your planned shifts and times, so don't post it.";
/** While the saved copy is being fetched. */
export const CAL_CHECKING = 'Checking for your saved link.';
/** A saved copy exists but can't be read here. */
export const CAL_UNREADABLE = "Couldn't read your saved link here. Get a new link to see one again.";
export const CAL_REPLACE = 'Get a new link';
/** The confirm before a new link: every link already added to a calendar app stops (all three slots are freed at once). */
export const CAL_REPLACE_ASK = "This stops every link already added to a calendar app. You will need to add the new one. Go on?";
export const CAL_REPLACE_YES = 'Yes, get a new link';
