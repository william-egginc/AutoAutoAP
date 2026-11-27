/**
 * The BETA badge on the Auto Planner tab passes WCAG AA for its text (4.5:1; red team R7 S5, axe "color-contrast",
 * 1 Nov 2026: white on indigo-500 is 4.47:1, and the unselected tab's 90 % white less). The colours come from the
 * badge's own classes, read from the template and resolved through Tailwind's palette, so a later class change is
 * checked the same way. Selected: white on indigo-600, 6.29:1; unselected: the same (no faded white any more).
 */
import fs from 'node:fs';
import path from 'node:path';
import colors from 'tailwindcss/colors';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'SiteTabs.vue'), 'utf8');
const badge = src.match(/<span\s+v-if="t\.id === 'auto'"[\s\S]*?>BETA<\/span/)![0];

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB;
/** A Tailwind colour class's value ("indigo-600", "white", with an optional "/90" opacity). */
function tw(name: string): { rgb: RGB; alpha: number } {
  const [base, op] = name.split('/');
  const [hue, shade] = base.split('-');
  const palette = colors as unknown as Record<string, string | Record<string, string>>;
  const v = shade ? (palette[hue] as Record<string, string>)[shade] : (palette[hue] as string);
  return { rgb: hex(v === '#fff' ? '#ffffff' : v), alpha: op ? Number(op) / 100 : 1 };
}
const blend = (fg: RGB, a: number, bg: RGB): RGB => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;
const lum = (rgb: RGB) => {
  const [r, g, b] = rgb.map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the BETA badge contrast (WCAG AA, 4.5:1)', () => {
  it('the maths: white on indigo-500 is the failing 4.47:1 axe found', () => {
    expect(contrast(tw('white').rgb, tw('indigo-500').rgb)).toBeCloseTo(4.47, 2);
  });

  it('every text colour the badge can have, on its background, is at least 4.5:1', () => {
    const bg = badge.match(/\bbg-([a-z]+-\d+)\b/)![1];
    const texts = [...badge.matchAll(/\btext-((?:white|black|[a-z]+-\d+)(?:\/\d+)?)(?=[\s'"])/g)].map(m => m[1]);
    expect(texts.length).toBeGreaterThan(0);
    const back = tw(bg).rgb;
    for (const t of texts) {
      const fg = tw(t);
      const ratio = contrast(blend(fg.rgb, fg.alpha, back), back);
      expect(ratio, `${t} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // Pinned: white on indigo-600.
    expect(bg).toBe('indigo-600');
    expect(texts).toEqual(['white']);
    expect(contrast(tw('white').rgb, tw('indigo-600').rgb)).toBeCloseTo(6.29, 2);
  });
});
