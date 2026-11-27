/**
 * WCAG 2 contrast (the UX review of 25 Oct 2026, accessibility): the ratio of two colours' relative luminances, and
 * a colour with Tailwind's `/NN` opacity laid over its background. AA asks 4.5:1 for text of any size here (every
 * small label in the planner is under 18 px). Pure, for specs that pin the shades the screens use.
 */

/** "#rrggbb" to [r, g, b] in 0-255. */
export function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** The contrast ratio of two colours, 1 to 21, whichever is lighter. */
export function contrastRatio(a: string | [number, number, number], b: string | [number, number, number]): number {
  const la = luminance(typeof a === 'string' ? rgbOf(a) : a);
  const lb = luminance(typeof b === 'string' ? rgbOf(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` at `alpha` (0-1) over an opaque `bg`, as the browser paints Tailwind's `text-indigo-700/80`. */
export function over(fg: string, alpha: number, bg: string): [number, number, number] {
  const f = rgbOf(fg);
  const b = rgbOf(bg);
  return [0, 1, 2].map(i => Math.round(f[i] * alpha + b[i] * (1 - alpha))) as [number, number, number];
}

/** WCAG AA for normal-size text. */
export const AA = 4.5;
