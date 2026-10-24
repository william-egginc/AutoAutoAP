/**
 * The part of the save a chain-search worker actually reads.
 *
 * Every worker used to receive the whole backup (`context.rawBackup`): the mission archive, the
 * contract archive, the home-farm inventory, every farm. With 31 workers that is 31 copies of a
 * save that the simulator touches four corners of. Chrome gives the page and all its workers one
 * shared ~4 GB heap cage, so each copy is memory a search could have used.
 *
 * What reads the backup inside a worker (traced from search/chain.ts and search/leg.ts down; every
 * other reader of `rawBackup` is on the page, which keeps the full one):
 *   - `getOptimalELRSet` (lib/artifacts/virtue.ts; called by auto/shifts/h1.ts, by
 *     calculations/researchRanking.ts under auto/shifts/c3.ts's sale buys, and by search/leg.ts for
 *     continue and the instant answer's delivery scale):
 *       artifactsDb.virtueAfxDb.inventoryItems and artifactsDb.artifactStatus (lib Inventory),
 *       farms[0].habs / .vehicles / .trainLength (when not assuming max habs and vehicles),
 *       farms[0].commonResearch (only when the caller passes no research levels),
 *       game.epicResearch (only when the caller passes no epic levels),
 *       contracts.archive / contracts.contracts (only when the caller passes no colleggtible
 *       modifiers: lib/collegtibles.ts `allModifiersFromColleggtibles`).
 *   - `getOptimalEarningsSet` (auto/shifts/c1.ts, search/leg.ts continue): artifactsDb (as
 *     above, plus virtueAfxDb.activeArtifacts), game.permitLevel. Its `recommendArtifactSet` uses
 *     a virtue strategy, which never builds a lib `Farm` or reads prophecy eggs.
 *   - `getArtifactLoadoutFromBackup` (search/leg.ts continue): artifactsDb.virtueAfxDb.
 *   - Truthiness checks (`if (!context.rawBackup)`) in h1.ts, c1.ts and leg.ts.
 *
 * Every simulator caller passes `context.epicResearchLevels` and `context.colleggtibleModifiers`, so
 * the contract archive is kept only if the context somehow lacks the modifiers (it never does from
 * `getSimulationContext()`); epic research and the first farm are small and kept regardless.
 *
 * Nested shapes are kept exactly (same keys, same nesting, values shared, not copied); keys absent
 * from the save stay absent. src/search/workerBackup.spec.ts prices chains with the full and the
 * trimmed save and requires identical results.
 */
import type { SimulationContext } from '@/engine/types';
import type { SearchInputs } from './types';

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null;
}

/** `src`'s own `keys`, those it has, in a new object. */
function pick(src: Obj, keys: readonly string[]): Obj {
  const out: Obj = {};
  for (const k of keys) if (k in src && src[k] !== undefined) out[k] = src[k];
  return out;
}

const FARM_KEYS = ['habs', 'vehicles', 'trainLength', 'commonResearch'] as const;

/**
 * The backup cut down to what the simulator reads (see the module comment). Anything that is not
 * an object comes back unchanged (`null`/`undefined` means "no save" to every reader).
 */
export function trimBackupForWorkers<T>(raw: T, context?: Pick<SimulationContext, 'colleggtibleModifiers'>): T {
  if (!isObj(raw)) return raw;
  const out: Obj = {};

  const db = raw.artifactsDb;
  if (isObj(db)) out.artifactsDb = pick(db, ['virtueAfxDb', 'artifactStatus']);
  else if (db !== undefined) out.artifactsDb = db;

  const farms = raw.farms;
  if (Array.isArray(farms)) {
    // Only farms[0] is ever read. A missing first farm stays missing (an empty array).
    out.farms = farms.length && isObj(farms[0]) ? [pick(farms[0], FARM_KEYS)] : farms.length ? [farms[0]] : [];
  } else if (farms !== undefined) out.farms = farms;

  const game = raw.game;
  if (isObj(game)) out.game = pick(game, ['permitLevel', 'epicResearch']);
  else if (game !== undefined) out.game = game;

  if (!context?.colleggtibleModifiers && isObj(raw.contracts)) {
    out.contracts = pick(raw.contracts, ['archive', 'contracts']);
  }
  return out as T;
}

/** `inputs` with `context.rawBackup` trimmed for a worker; nothing else touched or copied. */
export function inputsForWorkers(inputs: SearchInputs): SearchInputs {
  const raw = inputs.context?.rawBackup;
  if (!isObj(raw)) return inputs;
  return { ...inputs, context: { ...inputs.context, rawBackup: trimBackupForWorkers(raw, inputs.context) } };
}
