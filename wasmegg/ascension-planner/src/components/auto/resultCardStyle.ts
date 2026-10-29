/**
 * The answer cards' shared look (RouteResultCard.vue on Fastest, ByDateRouteCard.vue on By a date):
 * the button row and the leg table, so the two screens' answers read as one family (the user,
 * egg-beta review 11 Oct). Classes only; each card keeps its own content.
 *
 * Also the one home of the button, column-head and note type (type review batch 2, 26 Oct 2026): buttons are
 * sentence case, 14 px, bold (`BUTTON_TEXT`); column heads are the caps `.label` (components.css); notes are body
 * text. InstantRoute, ChainSearchPanel and the Help box (StudyForm) use these too.
 */
/** Every button's type: sentence case at the body size, bold. No caps, no tracking (Jordan, 26 Oct 2026). */
export const BUTTON_TEXT = 'text-body font-bold';
/** 44 px to tap below sm (phones), unchanged from sm up (23 Oct 2026). */
/** The card's main action: Simulate this plan (Fastest and By a date). */
export const PRIMARY_BUTTON = `inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-emerald-700 text-white ${BUTTON_TEXT} hover:bg-emerald-800 disabled:opacity-40`;
/** The rest of the row: Share, CSV, Save. */
export const SECONDARY_BUTTON = `inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg border border-emerald-300 bg-white ${BUTTON_TEXT} text-emerald-800 hover:border-emerald-500 disabled:opacity-40`;
/** A line of explanation inside the card. */
export const CARD_NOTE = 'text-body text-emerald-800';
/** The leg table under the card: header row and cells. */
export const LEG_TABLE = 'w-full text-small tabular-nums';
/** A table's column heads (on the <tr> or each <th>): the caps label. */
export const LEG_HEAD = 'label text-slate-400 text-left whitespace-nowrap';
export const LEG_ROW = 'border-t border-slate-100';
/**
 * A table row's route with its two buttons, Simulate this plan and Follow this route (the instant answer's "Every
 * number of ascensions", By a date and Fastest; Jordan, 29 Oct 2026: on a long route Follow dropped under the text
 * and the rows jagged). The route wraps in its own column (`min-w-0`); the buttons are one block of their own, the
 * same width on every row and every screen: one fixed 10rem column, one button over the other (the card is at most
 * 4xl, too narrow for four columns and both side by side; on a phone two side by side wrap their words), right of
 * the route from md up and under it below. Equal heights (`auto-rows-fr`), 44 px to tap on a phone (the buttons'
 * own classes).
 */
export const ROUTE_CELL = 'grid items-start gap-x-3 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_auto]';
export const ROUTE_TEXT = 'min-w-0 break-words tabular-nums text-slate-800';
export const ROUTE_ACTIONS = 'grid shrink-0 grid-cols-[10rem] auto-rows-fr gap-2 md:justify-self-end';
export const ROUTE_ACTION = 'w-full justify-center text-center whitespace-nowrap';
