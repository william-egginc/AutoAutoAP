/**
 * A remembered Setup pill position (SetupDock.vue; Jordan, 17 Nov 2026, window about 890 css px): the spot was saved in pixels, so it
 * lay over the content at any other window size. It is kept only while the window's width is within POS_WIDTH_SLACK px of the
 * width it was saved at; an entry from before the width was kept is forgotten once. Pure.
 */
export const POS_WIDTH_SLACK = 40;

export interface RememberedPos {
  x: number;
  y: number;
  w: number;
}

export function rememberedPos(raw: string | null, width: number): RememberedPos | null {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.w)) return null;
    return Math.abs(v.w - width) > POS_WIDTH_SLACK ? null : { x: v.x, y: v.y, w: v.w };
  } catch {
    return null;
  }
}
