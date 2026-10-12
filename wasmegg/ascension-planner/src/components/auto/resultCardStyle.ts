/**
 * The answer cards' shared look (RouteResultCard.vue on Fastest, ByDateRouteCard.vue on By a date):
 * the button row and the leg table, so the two screens' answers read as one family (the user,
 * egg-beta review 11 Oct). Classes only; each card keeps its own content.
 */
/** The card's main action: Build this plan (Fastest), Simulate this plan (By a date). */
export const PRIMARY_BUTTON =
  'px-4 py-2 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800 disabled:opacity-40';
/** The rest of the row: Share, CSV, Save. */
export const SECONDARY_BUTTON =
  'px-3 py-2 rounded-lg border border-emerald-300 bg-white text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:border-emerald-500 disabled:opacity-40';
/** A line of explanation inside the card. */
export const CARD_NOTE = 'text-[11px] text-emerald-800 leading-relaxed';
/** The leg table under the card: header row and cells. */
export const LEG_TABLE = 'w-full text-xs tabular-nums';
export const LEG_HEAD = 'text-[9px] font-black text-slate-400 uppercase tracking-widest text-left whitespace-nowrap';
export const LEG_ROW = 'border-t border-slate-100';
