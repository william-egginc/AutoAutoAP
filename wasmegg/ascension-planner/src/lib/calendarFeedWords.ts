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
  upload: "Your plan couldn't be sent to your calendar, so the calendar may be out of date. Try again in a moment.",
};
