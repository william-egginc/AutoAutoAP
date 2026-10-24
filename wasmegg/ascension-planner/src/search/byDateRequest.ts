/**
 * The "open Highest TE by a date, set up like this" hand-off from the Science tab and the Chain
 * Explorer, for the two ends to share (like sweepRequest.ts does for the Full sweep):
 *
 *   ./?insane=1&goal=deadline&eggday=1&asc=1,2,3&chain3=150-160:2&last=220-300[&pm5=3&step5=1][&centre3=28:2]
 *
 * A chain with n ascensions has n-1 early-stop boxes (`chainN`) and a last stop the panel finds
 * itself, starting inside `last`. A chain without a box is suggested from the opener's own save
 * (DeadlinePanel's Suggest a space). `pm` and `step` are that suggestion's two sliders (TE either
 * side of each stop, and the step between them) and must be one of the sliders' own values. No
 * account is in the link.
 */
import { SPACE_STEPS, SPACE_WIDTHS } from './deadlineSuggest';

/** Widths only a Science card's request may ask for, narrower than the By a date slider goes (the
 *  long chains are too many sets at +-3). They never appear on the slider's own scale. */
export const SCIENCE_WIDTHS = [1, 2];
const REQUEST_WIDTHS = [...SCIENCE_WIDTHS, ...SPACE_WIDTHS];

export interface ByDateRequest {
  /** Ascension counts, one chain each (1 to 8). */
  asc: number[];
  eggDay: boolean;
  /** Boxes by ascension count (`chain3=...`), where the link gave them. */
  chains: Record<number, string>;
  /** The last stop's starting box. */
  last?: string;
  /** Suggest a space's two sliders for the chains that name them, by ascension count (`pm5=3&step5=1`):
   *  TE either side of each stop, and the step. A chain not named here keeps the panel's own setting,
   *  which is how a normal By a date run stays as it is. */
  around?: Record<number, { pm: number; step: number }>;
  /**
   * Centre a chain's later boxes on the instant answer's route for that count, when the panel has one
   * (`centre4=25:5,30:10`): each box after the first, its TE either side and step. The chain's own box
   * (`chainN`) is kept as the first box, and as every box when there is no instant answer for it.
   */
  centre?: Record<number, { pm: number; step: number }[]>;
}

/** Bounds on a `centre` entry: whole TE either side and steps the boxes could sensibly use. */
const CENTRE_PM_MAX = 80;
const CENTRE_STEP_MAX = 20;

/** The query string (with a leading `?`) that opens By a date on this request. */
export function byDateRequestQuery(r: ByDateRequest): string {
  const q = new URLSearchParams({ insane: '1', goal: 'deadline' });
  if (r.eggDay) q.set('eggday', '1');
  q.set('asc', r.asc.join(','));
  for (const n of r.asc) if (r.chains[n]) q.set(`chain${n}`, r.chains[n]);
  if (r.last) q.set('last', r.last);
  for (const n of r.asc) {
    const a = r.around?.[n];
    if (a) {
      q.set(`pm${n}`, String(a.pm));
      q.set(`step${n}`, String(a.step));
    }
    const c = r.centre?.[n];
    if (c?.length) q.set(`centre${n}`, c.map(x => `${x.pm}:${x.step}`).join(','));
  }
  return `?${q.toString()}`;
}

/** Read a request out of a query string; null when it names no ascension count. Every field is
 *  bounded: counts 1 to 8, boxes and `last` length-capped (they are parsed as bands later), `pm` and
 *  `step` only when they are values the sliders have. */
export function parseByDateRequest(search: string): ByDateRequest | null {
  const params = new URLSearchParams(search);
  const asc = [
    ...new Set(
      (params.get('asc') ?? '')
        .split(',')
        .slice(0, 16)
        .map(x => Math.floor(Number(x)))
        .filter(n => n >= 1 && n <= 8)
    ),
  ];
  if (!asc.length) return null;
  const chains: Record<number, string> = {};
  for (const n of asc) chains[n] = (params.get(`chain${n}`) ?? '').slice(0, 300);
  const last = (params.get('last') ?? '').slice(0, 100);
  // A count's own pm/step, else the plain ones; each only when it is a value the sliders have.
  const around: Record<number, { pm: number; step: number }> = {};
  for (const n of asc) {
    const pm = Number(params.get(`pm${n}`) ?? params.get('pm'));
    const step = Number(params.get(`step${n}`) ?? params.get('step'));
    if (REQUEST_WIDTHS.includes(pm) && SPACE_STEPS.includes(step)) around[n] = { pm, step };
  }
  // `centreN=25:5,30:10`: up to 7 boxes, each whole TE either side and a step, both bounded.
  const centre: Record<number, { pm: number; step: number }[]> = {};
  for (const n of asc) {
    const raw = (params.get(`centre${n}`) ?? '').slice(0, 100);
    if (!raw) continue;
    const list = raw
      .split(',')
      .slice(0, 7)
      .map(x => x.split(':').map(Number))
      .map(([pm, step]) => ({ pm, step }));
    if (
      list.length === n - 2 &&
      list.every(
        x =>
          Number.isInteger(x.pm) &&
          Number.isInteger(x.step) &&
          x.pm >= 1 &&
          x.pm <= CENTRE_PM_MAX &&
          x.step >= 1 &&
          x.step <= CENTRE_STEP_MAX
      )
    )
      centre[n] = list;
  }
  return {
    asc,
    eggDay: params.get('eggday') === '1',
    chains,
    ...(last ? { last } : {}),
    ...(Object.keys(around).length ? { around } : {}),
    ...(Object.keys(centre).length ? { centre } : {}),
  };
}
