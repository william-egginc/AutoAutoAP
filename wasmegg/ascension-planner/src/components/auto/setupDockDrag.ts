/**
 * The round Setup gear on phones (SetupDock.vue; Jordan, 12 Nov 2026 pm): one control that is both the button and the
 * drag handle. A press that moves further than GEAR_DRAG_PX from where it went down is a drag; less is a tap.
 */
export const GEAR_DRAG_PX = 8;

export function movedPast(x0: number, y0: number, x: number, y: number, px = GEAR_DRAG_PX): boolean {
  return Math.hypot(x - x0, y - y0) > px;
}
