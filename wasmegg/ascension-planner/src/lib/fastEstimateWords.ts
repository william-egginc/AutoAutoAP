/**
 * The How long line for Fast and Exact before Start (FastestRoute.vue `levelEstimates`), when this device has finished
 * runs at the level to go on (lib/fastTypical.ts): the time at what the level typically prices here, with the bound
 * beside it. With nothing kept the line is the old one, at the bound.
 * DRAFT wording, Words owns it; wording only, so not part of the result code hash (lib/resultCodeHash.ts isWordingOnly).
 */
export function typicalHowLongLine(o: {
  time: string;
  device: string;
  workers: string;
  speed: string;
  typical: number;
  bound: number;
}): string {
  return `About ${o.time} on ${o.device} (${o.workers}, ${o.speed}): about ${o.typical.toLocaleString()} routes, as its runs here have priced; at most ~${o.bound.toLocaleString()}.`;
}
