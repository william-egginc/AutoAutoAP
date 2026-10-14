/**
 * One table cell simulated live: the fresh builds a table would hold for this account at a start TE
 * and start time (search/tableBuild.ts, the generator's own code). For a player above the table's
 * top, where it has no row: from there the fastest route is one ascension straight to the target
 * (routeFinder.ts USEFUL_STOP_MAX), so this one cell is all the instant answer needs, and tables need
 * not be built above the useful stops. A fraction of a second; on the player's own account, so
 * already at their delivery rate.
 */
import { buildAt, paramsOf, startStateAt } from './tableBuild';
import type { BuildParams } from './precomputedLeg';
import type { SearchInputs } from './types';

export function liveFreshBuilds(inputs: SearchInputs, te: number, start: number): BuildParams[] {
  const build = buildAt(inputs, startStateAt(inputs, te), start, te);
  return build.variants.map(v => paramsOf(build, v, start));
}
