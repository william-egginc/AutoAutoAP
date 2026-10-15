/**
 * A table row that opens on a click anywhere on its name area (the user, 15 Oct: the small arrow was a tiny target),
 * without hijacking what is inside it: a click on a link, button, field or label (Use, CSV, Hide, the arrow itself)
 * does what that thing does, and a click that ended a text selection (copying a route) opens nothing. The arrow button
 * stays the keyboard way in (Enter and Space click it).
 */
export function clickedInteractive(ev: Event): boolean {
  const t = ev.target as Element | null;
  return !!t?.closest?.('a, button, input, select, textarea, label, summary');
}

export function onRowClick(ev: Event, toggle: () => void): void {
  if (clickedInteractive(ev)) return;
  try {
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return;
  } catch {
    /* no selection API: open it */
  }
  toggle();
}
