/**
 * Page-level helpers for the update banners (R8.1 QA, 18 Nov 2026), kept out of the components so they can be pinned
 * without a DOM (components render on the server in the specs).
 *
 * - `lockBehind`: while the full-screen reload box is open (NewVersionBanner.vue), everything behind it is `inert`
 *   (Tab cannot reach it, clicks do nothing, screen readers skip it) and the page behind does not scroll. aria-modal
 *   alone did neither (QA: Tab reached the page behind, and it scrolled).
 * - `floatingBannerBottom`: how far down the screen the floating update banner reaches (its bottom edge plus a gap, in
 *   px; 0 when none shows). PlannedUpdateNotice.vue starts below it, so the two stack instead of the banner covering the
 *   notice (QA at 390 px: the fallback reload banner hid the top ~95 px of the notice).
 */
import { ref } from 'vue';

/** The parts of a DOM element used here (a plain object in the specs). */
export interface LockNode {
  parentElement: LockNode | null;
  readonly children: ArrayLike<LockNode>;
  inert?: boolean;
  style?: { overflow: string };
}

/** Makes every element that is not `box` or one of its ancestors `inert`, up to and including `body`'s other children,
 *  and stops `html` and `body` scrolling. Returns the undo: only what this call changed is put back (an element that was
 *  already inert stays inert). */
export function lockBehind(box: LockNode, html: LockNode | null, body: LockNode | null): () => void {
  const madeInert: LockNode[] = [];
  let node: LockNode = box;
  while (node.parentElement) {
    const parent: LockNode = node.parentElement;
    for (const sib of Array.from(parent.children)) {
      if (sib !== node && !sib.inert) {
        sib.inert = true;
        madeInert.push(sib);
      }
    }
    if (parent === body) break;
    node = parent;
  }
  const scrollers = [html, body].filter((n): n is LockNode & { style: { overflow: string } } => !!n?.style);
  const before = scrollers.map(n => n.style.overflow);
  for (const n of scrollers) n.style.overflow = 'hidden';
  let undone = false;
  return () => {
    if (undone) return;
    undone = true;
    for (const n of madeInert) n.inert = false;
    scrollers.forEach((n, i) => (n.style.overflow = before[i]));
  };
}

/** The gap left under the floating banner, px. */
export const FLOATING_BANNER_GAP = 8;

/** Bottom edge of the floating update banner on screen plus the gap, px; 0 when no floating banner shows. */
export const floatingBannerBottom = ref(0);

/** The value for `floatingBannerBottom` from the banner's bounding box (null: no banner). */
export function bannerClearance(rect: { bottom: number } | null): number {
  if (!rect || !(rect.bottom > 0)) return 0;
  return Math.ceil(rect.bottom) + FLOATING_BANNER_GAP;
}
