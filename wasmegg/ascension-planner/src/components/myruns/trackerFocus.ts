/**
 * Where keyboard focus goes when ticking a Build-up tracker line unmounts its box (review S-4, 15 Nov 2026): the next box after it
 * that is on screen and still to tick; none after it, the first such box; none at all, null (the caller then takes the done run's
 * toggle). `order` is the boxes' keys as they were on screen before the tick, `present` the keys on screen after it.
 */
export function focusKeyAfterTick(o: {
  order: readonly string[];
  gone: string;
  ticked: ReadonlySet<string>;
  present: ReadonlySet<string>;
}): string | null {
  const ok = (k: string) => o.present.has(k) && !o.ticked.has(k);
  const at = o.order.indexOf(o.gone);
  for (let i = at + 1; i < o.order.length; i++) if (ok(o.order[i]!)) return o.order[i]!;
  for (const k of o.order) if (ok(k)) return k;
  return null;
}
