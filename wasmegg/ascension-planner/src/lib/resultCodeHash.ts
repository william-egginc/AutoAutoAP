/**
 * THE RESULT CODE HASH, worked out at BUILD time (vite.config.ts defines it as `__RESULT_CODE_HASH__`; the page reads
 * it through lib/resultCode.ts). Release 7, allanfieldhouse: after reloading onto a new build the page kept the answer
 * the OLD code had worked out, because his inputs had not changed; only "Work it out again" gave the new code's
 * answer. Every kept result (the instant answer, My runs' pricing record and simulated ascension, the Build-up
 * tracker's plan) now carries this hash, and one kept under another hash is worked out again.
 *
 * WHAT IT COVERS: the code that decides results, not the words. A deploy that only changes wording keeps the hash, so
 * nobody's kept answers are thrown away for nothing; a change to the search, the simulator or the instant / follow /
 * build-up code changes it.
 *   - Whole directories (`RESULT_CODE_DIRS`): src/search, src/auto, src/engine, src/calculations, src/workers.
 *   - Named files (`RESULT_CODE_FILES`): the composables and lib files that work out or keep those results.
 *   - Whatever those import from src/lib, src/types and src/calculations, followed through (`CLOSURE_DIRS`).
 *   - NEVER: specs, tests and fixtures; wording-only files (`isWordingOnly`: release.ts, the update notes, siteNav and
 *     the error words, any lib/*Words.ts / *Word.ts); anything under src/components or src/stores (src/stores/chainSearch.ts mixes the
 *     search's orchestration with its words and changes with nearly every release: its own results are the player's
 *     saved runs, which are kept, not recomputed); non-.ts files.
 * It hashes bytes, so a comment changed in leg.ts changes it too: a needless recompute once, never a stale answer.
 *
 * search/simVersion.ts SIM_SOURCE_HASH (the simulator only, set by hand, for the precomputed tables) is a different
 * thing: it covers src/engine, src/auto, tableBuild and precomputedLeg, not search/leg.ts or chain.ts, which also moved
 * results lately (continue-set, noemptybuild, a1choice).
 *
 * Pure: it is handed every candidate file (path relative to wasmegg/ascension-planner, '/' separators, and its text).
 * Node only (node:crypto): never imported by the page.
 */
import { createHash } from 'node:crypto';

export const RESULT_CODE_DIRS = ['src/search/', 'src/auto/', 'src/engine/', 'src/calculations/', 'src/workers/'] as const;

export const RESULT_CODE_FILES = [
  'src/composables/useCurrentSim.ts',
  'src/composables/useInstantCompute.ts',
  'src/composables/useFollowEstimate.ts',
  'src/lib/followSim.ts',
  'src/lib/followEstimate.ts',
  'src/lib/followPrice.ts',
  'src/lib/buildUpTracker.ts',
  'src/lib/buildUpBought.ts',
  'src/lib/a1Choice.ts',
  'src/lib/nowPlan.ts',
] as const;

/** Imports from these are followed (an import into src/stores or src/components is not). */
export const CLOSURE_DIRS = ['src/lib/', 'src/types/', 'src/calculations/'] as const;

/** Files that only say things: never part of the hash. */
export const WORDING_FILES = [
  'release.ts',
  'src/lib/updateNotes.ts',
  'src/lib/releaseNoteWarning.ts',
  // Every name players read (tabs, addresses), and errors put into words.
  'src/lib/siteNav.ts',
  'src/lib/plainError.ts',
  'src/lib/uploadError.ts',
] as const;

/** Specs, tests, fixtures and anything that is not TypeScript. */
export function isTestOrFixture(path: string): boolean {
  return !path.endsWith('.ts') || path.endsWith('.d.ts') || /\.(spec|test)\.ts$/.test(path) || /\.fixture\./.test(path) || path.startsWith('src/test/');
}

/** Wording only: release.ts, the update notes, lib/*Words.ts and the like, and every component. */
export function isWordingOnly(path: string): boolean {
  return (
    (WORDING_FILES as readonly string[]).includes(path) ||
    /(^|\/)[A-Za-z0-9]*Words?\.ts$/.test(path) ||
    path.startsWith('src/components/') ||
    path.endsWith('.vue')
  );
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

function dirOf(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}
function normalise(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** The file an import names, when it is one of `files`; null for a package or anything not handed in. */
export function resolveImport(from: string, spec: string, files: ReadonlyMap<string, string>): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('./') || spec.startsWith('../')) base = normalise(`${dirOf(from)}/${spec}`);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}/index.ts`]) if (files.has(c)) return c;
  return null;
}

/** The files the hash is made of, sorted. */
export function resultCodeInputs(files: ReadonlyMap<string, string>): string[] {
  const ok = (p: string) => files.has(p) && !isTestOrFixture(p) && !isWordingOnly(p);
  const picked = new Set<string>();
  const queue: string[] = [];
  const add = (p: string) => {
    if (!picked.has(p) && ok(p)) {
      picked.add(p);
      queue.push(p);
    }
  };
  for (const p of [...files.keys()].sort()) if (RESULT_CODE_DIRS.some(d => p.startsWith(d))) add(p);
  for (const p of RESULT_CODE_FILES) add(p);
  while (queue.length) {
    const p = queue.shift()!;
    const text = files.get(p) ?? '';
    for (const m of text.matchAll(IMPORT)) {
      const r = resolveImport(p, m[1], files);
      if (r && CLOSURE_DIRS.some(d => r.startsWith(d))) add(r);
    }
  }
  return [...picked].sort();
}

/** Twelve hex characters of sha256 over each input's path and text, in path order. */
export function resultCodeHash(files: ReadonlyMap<string, string>): { hash: string; inputs: string[] } {
  const inputs = resultCodeInputs(files);
  const h = createHash('sha256');
  for (const p of inputs) {
    h.update(p + '\0');
    h.update(files.get(p) ?? '');
    h.update('\0');
  }
  return { hash: h.digest('hex').slice(0, 12), inputs };
}
