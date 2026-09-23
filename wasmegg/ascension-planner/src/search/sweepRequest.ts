/**
 * The "Run this sweep" hand-off from the Chain Explorer to the planner's Insane mode.
 *
 * One module for both ends, so the link the Explorer writes and the link Insane mode reads cannot
 * drift apart:
 *
 *   ./?insane=1&sweep=M2&label=M2,+3+ascensions&bands=181-280:2;+270-372:2&gap=10[&fc=1|0]
 *
 * NO PLAYER ID IN IT, deliberately. The Explorer never sees one; the player enters it in the planner,
 * which already knows how to remember it. A link someone shares therefore hands over a sweep, never
 * an account.
 */
import { parseBands } from './exhaustive';

export interface SweepRequest {
  preset: string;
  label: string;
  bands: string;
  minGap: number;
  /** true = finish the current run first, false = prestige straight away, null = leave the default. */
  forceContinue: boolean | null;
}

/** The query string (with a leading `?`) that opens Insane mode on this sweep. */
export function sweepRequestQuery(r: Omit<SweepRequest, 'forceContinue'> & { forceContinue?: boolean | null }): string {
  const q = new URLSearchParams({ insane: '1', sweep: r.preset, label: r.label, bands: r.bands, gap: String(r.minGap) });
  if (r.forceContinue === true) q.set('fc', '1');
  if (r.forceContinue === false) q.set('fc', '0');
  return `?${q.toString()}`;
}

/**
 * Read a sweep request back out of a query string, or null when there is none or it is malformed.
 * Everything here ends up on screen and in a submission, so each field is bounded: the preset is a
 * short plain id (it becomes the sweep tag), the label and bands are length-capped, and the bands
 * must parse.
 */
export function parseSweepRequest(search: string): SweepRequest | null {
  const params = new URLSearchParams(search);
  const preset = params.get('sweep') ?? '';
  const bands = (params.get('bands') ?? '').slice(0, 400);
  if (!/^[A-Za-z0-9-]{1,16}$/.test(preset) || !parseBands(bands).length) return null;
  const gap = Number(params.get('gap') ?? 10);
  const fc = params.get('fc');
  return {
    preset,
    label: (params.get('label') ?? preset).slice(0, 80),
    bands,
    minGap: Number.isFinite(gap) ? Math.max(0, Math.floor(gap)) : 10,
    forceContinue: fc === '1' ? true : fc === '0' ? false : null,
  };
}
