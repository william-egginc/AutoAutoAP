/**
 * After a fold is closed from its foot (MoreFold.vue's Less, Allan 9 Nov 2026): the content above the press is gone,
 * so the page can be left showing whatever came after the fold. The header takes the focus (without the browser's own
 * scroll), and is brought into view only when it is now off screen, so a fold folded with its header in sight does
 * not jump.
 */
export interface FoldHeader {
  getBoundingClientRect(): { top: number; bottom: number };
  focus(options?: { preventScroll?: boolean }): void;
  scrollIntoView(options?: ScrollIntoViewOptions): void;
}

/** Focus the header; scroll it into view if it is above or below the screen. True when it scrolled. */
export function headerBackInView(header: FoldHeader, viewportHeight: number): boolean {
  header.focus({ preventScroll: true });
  const r = header.getBoundingClientRect();
  const off = r.top < 0 || r.bottom > viewportHeight;
  if (off) header.scrollIntoView({ block: 'start' });
  return off;
}
