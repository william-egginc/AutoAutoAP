/**
 * The stages' colours (spec-stages, Jordan 13 Nov 2026: "colour-coded by stage, a coloured line down the left side of each
 * row"): three distinct hues that hold on white and on the page's light grey, the key's swatches the same, and the band's
 * words a darker shade of the same hue at AA (UX review H7: 4.5:1 for small text; a line is a graphic: 3:1). Colour is
 * never the only cue: the bands and the header say the stage in words. Tailwind's own palette; the app has no dark mode.
 */
import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import { AA, contrastRatio, rgbOf } from './contrast';
import { STAGE_STYLE, stageStripe } from './buildUpStageStyle';
import type { Stage } from './buildUpStages';

const STAGES: Stage[] = ['tier13', 'roi', 'delivery'];
const GRAPHIC = 3;
const WHITE = '#ffffff';
const BACKDROPS = [WHITE, colors.gray[100], colors.indigo[50]];
/** The colour's hue in degrees (HSL). */
function hue(hex: string): number {
  const [r, g, b] = rgbOf(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('three distinct colours', () => {
  it('each stage has its own line, swatch and words colour', () => {
    expect(new Set(STAGES.map(s => STAGE_STYLE[s].line)).size).toBe(3);
    expect(new Set(STAGES.map(s => STAGE_STYLE[s].hex)).size).toBe(3);
    expect(new Set(STAGES.map(s => STAGE_STYLE[s].text)).size).toBe(3);
  });
  it('the line and swatch read at 3:1 on white, the page grey and the next-row tint', () => {
    for (const s of STAGES) for (const bg of BACKDROPS) expect(contrastRatio(STAGE_STYLE[s].hex, bg), `${s} on ${bg}`).toBeGreaterThanOrEqual(GRAPHIC);
  });
  it('the band\'s words read at AA on white and the page grey', () => {
    for (const s of STAGES) for (const bg of [WHITE, colors.gray[100]]) expect(contrastRatio(STAGE_STYLE[s].textHex, bg), `${s} on ${bg}`).toBeGreaterThanOrEqual(AA);
  });
  it('the hues are well apart (at least 60 degrees round the wheel, so no two read alike)', () => {
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const d = Math.abs(hue(STAGE_STYLE[STAGES[i]].hex) - hue(STAGE_STYLE[STAGES[j]].hex));
        expect(Math.min(d, 360 - d), `${STAGES[i]} / ${STAGES[j]}`).toBeGreaterThanOrEqual(60);
      }
  });
  it('the classes are the palette ones the hexes name', () => {
    expect(STAGE_STYLE.tier13.hex).toBe(colors.violet[600]);
    expect(STAGE_STYLE.roi.hex).toBe(colors.teal[600]);
    expect(STAGE_STYLE.delivery.hex).toBe(colors.orange[600]);
    expect(STAGE_STYLE.tier13.line).toBe('border-violet-600');
    expect(STAGE_STYLE.roi.swatch).toBe('bg-teal-600');
    expect(STAGE_STYLE.delivery.text).toBe('text-orange-700');
  });
});

describe('a Compact day\'s line', () => {
  it('one stage: a solid colour', () => {
    expect(stageStripe(['roi', 'roi', 'roi'])).toBe(colors.teal[600]);
  });
  it('two stages: hard stops in proportion to the lines', () => {
    expect(stageStripe(['tier13', 'tier13', 'tier13', 'roi'])).toBe(
      `linear-gradient(to bottom, ${colors.violet[600]} 0%, ${colors.violet[600]} 75%, ${colors.teal[600]} 75%, ${colors.teal[600]} 100%)`
    );
  });
  it('none: nothing', () => {
    expect(stageStripe([])).toBe('');
  });
});
