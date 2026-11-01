/**
 * THE BODY OF version.json (vite.config.ts versionFile writes it; composables/useNewVersion.ts and lib/eggBetaReload.ts
 * read it). Pure, so a spec can pin its shape.
 *
 * EGG-BETA ONLY (1 Nov 2026, Jordan): two build-time env vars, both unset on every other build (live included), where
 * the body is exactly what it was before:
 *   - AAP_EGG_BETA_RELOAD_BEFORE=<ISO time | now>: written as `release.reloadIfBuiltBefore` in place of release.ts's,
 *     so every open tab built before it is asked to reload (the ESSENTIAL banner, which tabs of every age understand).
 *     release.ts is not touched.
 *   - AAP_EGG_BETA_RELOAD_AT=<ISO time>: adds `eggBeta: { reloadAt, builtAt }`. Tabs built with this code, on the
 *     egg-beta host only, and older than `builtAt`, count down to `reloadAt` and reload then, never during a search
 *     (lib/eggBetaReload.ts). A later build without the var drops the field and turns it off.
 * An unreadable time throws, so the deploy fails instead of shipping nonsense.
 */
export type BuildEnv = Record<string, string | undefined>;

export interface VersionJsonRelease {
  reloadIfBuiltBefore: string;
  history: unknown[];
}

export interface VersionJsonBody {
  [entry: string]: unknown;
  release: { reloadIfBuiltBefore: string; note: string; history: unknown[] };
  eggBeta?: { reloadAt: string; builtAt: string };
}

/** The env var's value, '' when unset or blank. */
function envValue(env: BuildEnv, name: string): string {
  return (env[name] ?? '').trim();
}

/** An env var's time as ISO UTC; `now` is the build time. Throws when unreadable. */
function envTime(env: BuildEnv, name: string, buildTime: string): string {
  const v = envValue(env, name);
  if (v === 'now') return buildTime;
  const ms = Date.parse(v);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(ms)) {
    throw new Error(`${name}=${JSON.stringify(v)} is not an ISO time (e.g. 2026-11-01T22:00:00Z)`);
  }
  return new Date(ms).toISOString();
}

/** True when this build carries the egg-beta timed reload (vite.config.ts defines __AAP_EGG_BETA_RELOAD__ from it). */
export function eggBetaBuild(env: BuildEnv): boolean {
  return envValue(env, 'AAP_EGG_BETA_RELOAD_AT') !== '';
}

export function versionJsonBody(
  entries: Record<string, string>,
  release: VersionJsonRelease,
  env: BuildEnv,
  buildTime: string
): VersionJsonBody {
  const before = envValue(env, 'AAP_EGG_BETA_RELOAD_BEFORE')
    ? envTime(env, 'AAP_EGG_BETA_RELOAD_BEFORE', buildTime)
    : release.reloadIfBuiltBefore;
  const body: VersionJsonBody = {
    ...entries,
    release: {
      reloadIfBuiltBefore: before,
      // Empty on purpose (26 Oct 2026): tabs built before lib/updateNotes.ts fall back to this note when no
      // history entry is newer than their build, and it is always the newest entry, which such a tab
      // already has -- the stale Release 5 note. Empty, they say just "Small update available".
      note: '',
      // The newest 8, each with its `key` (its identity, a hash of its text) beside the old fields.
      history: release.history,
    },
  };
  if (eggBetaBuild(env)) body.eggBeta = { reloadAt: envTime(env, 'AAP_EGG_BETA_RELOAD_AT', buildTime), builtAt: buildTime };
  return body;
}
