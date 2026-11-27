/**
 * The How long line for Fast and Exact before Start (FastestRoute.vue `levelEstimates`), when this device has finished
 * runs at the level to go on, or for Fast on a first run its built-in share (lib/fastTypical.ts): the time at what the
 * level typically prices, with the bound beside it. Exact with nothing kept keeps the old line, at the bound.
 * Final wording (Words, 9 Nov 2026: "(up to ~915)" in brackets, not "; at most ~915", which read as a hedge after the estimate); wording only, so not part of the result code hash (lib/resultCodeHash.ts isWordingOnly).
 */
export function typicalHowLongLine(o: {
  time: string;
  device: string;
  workers: string;
  speed: string;
  typical: number;
  bound: number;
  /** This device's finished runs, or the built-in share from players' Fast runs (a first run here). */
  from: 'here' | 'default';
}): string {
  const why = o.from === 'here' ? 'as its runs here have priced' : 'what Fast runs typically price';
  return `About ${o.time} on ${o.device} (${o.workers}, ${o.speed}): about ${o.typical.toLocaleString()} routes, ${why} (up to ~${o.bound.toLocaleString()}).`;
}
