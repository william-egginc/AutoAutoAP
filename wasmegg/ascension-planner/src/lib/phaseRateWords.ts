/**
 * The rate under the Building / Producing badge in My runs (13 Nov 2026). "2.179q/hr · from your save" read as the
 * farm's speed; it is the speed with the set the save wears (the earnings set while building), about half of what the
 * delivery set gives. So the line names the set. `afterSwap` (the delivery-set rate on the same farm) is optional:
 * the page doesn't compute it yet, and the swap clause shows only when it is passed.
 */
export function phaseRateWords(o: {
  phase: 'building' | 'producing';
  /** Formatted eggs per hour without the "/hr", e.g. "2.179q". */
  rate: string;
  from: 'save' | 'projected';
  afterSwap?: string;
}): string {
  if (o.from === 'projected') return `${o.rate}/hr · projected`;
  const set = o.phase === 'building' ? 'earnings' : 'delivery';
  const swap = o.phase === 'building' && o.afterSwap ? `; about ${o.afterSwap}/hr after the swap to the delivery set` : '';
  return `${o.rate}/hr with your ${set} set${swap}`;
}
