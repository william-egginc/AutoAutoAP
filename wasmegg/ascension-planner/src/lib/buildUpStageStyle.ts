/**
 * The stages' colours in the Build-up tracker (spec-stages, Jordan 13 Nov 2026: "colour-coded by stage, a coloured line down
 * the left side of each row", with a key). Three hues apart for colour-blind eyes (violet, teal, orange); the line and the
 * key's swatch at -600 (3:1 or more on white, the page's grey and the next row's tint), the band's words at -700 (AA,
 * UX review H7). Colour is never the only cue: the bands and the header say the stage in words. The app has no dark mode.
 * Class names are written out in full (Tailwind reads them from here). Not a result code input.
 */
import colors from 'tailwindcss/colors';
import type { Stage } from './buildUpStages';

export interface StageStyle {
  /** A row's left line (with `border-l-4`). */
  line: string;
  /** The key's swatch. */
  swatch: string;
  /** The band's words. */
  text: string;
  /** The line's colour, for Compact's day line (a gradient across stages) and for specs. */
  hex: string;
  /** The band's words' colour, for specs. */
  textHex: string;
}

export const STAGE_STYLE: Record<Stage, StageStyle> = {
  tier13: { line: 'border-violet-600', swatch: 'bg-violet-600', text: 'text-violet-700', hex: colors.violet[600], textHex: colors.violet[700] },
  roi: { line: 'border-teal-600', swatch: 'bg-teal-600', text: 'text-teal-700', hex: colors.teal[600], textHex: colors.teal[700] },
  delivery: { line: 'border-orange-600', swatch: 'bg-orange-600', text: 'text-orange-700', hex: colors.orange[600], textHex: colors.orange[700] },
};

/**
 * A Compact day's line down its left: the stages of the day's lines, top to bottom. One stage: its colour; more: hard
 * stops in proportion to the lines; none: ''.
 */
export function stageStripe(stages: readonly Stage[]): string {
  if (!stages.length) return '';
  const runs: { stage: Stage; n: number }[] = [];
  for (const s of stages) {
    const last = runs[runs.length - 1];
    if (last && last.stage === s) last.n++;
    else runs.push({ stage: s, n: 1 });
  }
  if (runs.length === 1) return STAGE_STYLE[runs[0].stage].hex;
  let at = 0;
  const stops = runs.map(r => {
    const from = at;
    at += (r.n / stages.length) * 100;
    const hex = STAGE_STYLE[r.stage].hex;
    return `${hex} ${Math.round(from * 100) / 100}%, ${hex} ${Math.round(at * 100) / 100}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}
