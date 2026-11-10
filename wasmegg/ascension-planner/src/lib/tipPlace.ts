/**
 * Where a tip goes (components/Tip.vue): above the button it describes when it fits, else below, never over it;
 * across, centred on the button and clamped inside the screen with a margin, so a button at the edge of a 320 px
 * phone still shows the whole tip. Pure: Tip.vue hands in the button's box, the tip's size and the screen's.
 */
export interface TipAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export const TIP_MARGIN = 8;
/** Between the button and the tip. */
export const TIP_GAP = 6;

export function placeTip(
  anchor: TipAnchor,
  tip: { width: number; height: number },
  view: { width: number; height: number }
): { left: number; top: number; side: 'above' | 'below' } {
  const maxLeft = Math.max(TIP_MARGIN, view.width - tip.width - TIP_MARGIN);
  const left = Math.min(Math.max(TIP_MARGIN, anchor.left + anchor.width / 2 - tip.width / 2), maxLeft);
  const aboveTop = anchor.top - TIP_GAP - tip.height;
  const belowTop = anchor.bottom + TIP_GAP;
  const fitsAbove = aboveTop >= TIP_MARGIN;
  const fitsBelow = belowTop + tip.height <= view.height - TIP_MARGIN;
  // Neither fits (a tall tip on a short screen): the side with more room.
  const side = fitsAbove ? 'above' : fitsBelow ? 'below' : anchor.top > view.height - anchor.bottom ? 'above' : 'below';
  return { left, top: side === 'above' ? aboveTop : belowTop, side };
}
