/** version.json as vite.config.ts writes it (lib/versionJson.ts), with and without the egg-beta env vars. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { versionJsonBody } from './versionJson';

const entries = { index: 'assets/index-AAAA.js', explorer: 'assets/explorer-BBBB.js' };
const history = [{ at: '2026-10-31T00:00:00Z', note: 'a note', key: 'k1' }];
const release = { reloadIfBuiltBefore: '2026-10-20T00:00:00Z', history };
const BUILT = '2026-11-01T19:00:00.000Z';

describe('versionJsonBody', () => {
  it('no env vars: exactly the shape written before (no eggBeta, reloadIfBuiltBefore from release.ts)', () => {
    const body = versionJsonBody(entries, release, {}, BUILT);
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({
        ...entries,
        release: { reloadIfBuiltBefore: '2026-10-20T00:00:00Z', note: '', history },
      })
    );
    expect(body).not.toHaveProperty('eggBeta');
  });

  it('empty env values count as unset', () => {
    const body = versionJsonBody(entries, release, { AAP_EGG_BETA_RELOAD_BEFORE: '', AAP_EGG_BETA_RELOAD_AT: ' ' }, BUILT);
    expect(JSON.stringify(body)).toBe(JSON.stringify(versionJsonBody(entries, release, {}, BUILT)));
  });

  it('AAP_EGG_BETA_RELOAD_BEFORE overrides release.reloadIfBuiltBefore (normalised ISO)', () => {
    const body = versionJsonBody(entries, release, { AAP_EGG_BETA_RELOAD_BEFORE: '2026-11-01T19:30:00Z' }, BUILT);
    expect(body.release.reloadIfBuiltBefore).toBe('2026-11-01T19:30:00.000Z');
    expect(body).not.toHaveProperty('eggBeta');
  });

  it('AAP_EGG_BETA_RELOAD_BEFORE=now uses the build time', () => {
    const body = versionJsonBody(entries, release, { AAP_EGG_BETA_RELOAD_BEFORE: 'now' }, BUILT);
    expect(body.release.reloadIfBuiltBefore).toBe(BUILT);
  });

  it('AAP_EGG_BETA_RELOAD_AT writes eggBeta.reloadAt and this build time', () => {
    const body = versionJsonBody(entries, release, { AAP_EGG_BETA_RELOAD_AT: '2026-11-01T22:00:00Z' }, BUILT);
    expect(body.eggBeta).toEqual({ reloadAt: '2026-11-01T22:00:00.000Z', builtAt: BUILT });
    expect(body.release.reloadIfBuiltBefore).toBe('2026-10-20T00:00:00Z');
  });

  it('an unreadable time fails the build instead of writing nonsense', () => {
    expect(() => versionJsonBody(entries, release, { AAP_EGG_BETA_RELOAD_AT: '2pm' }, BUILT)).toThrow(/AAP_EGG_BETA_RELOAD_AT/);
    expect(() => versionJsonBody(entries, release, { AAP_EGG_BETA_RELOAD_BEFORE: 'soon' }, BUILT)).toThrow(
      /AAP_EGG_BETA_RELOAD_BEFORE/
    );
  });

  it('vite.config.ts writes version.json through this helper, and defines the egg-beta build flag from the env', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../vite.config.ts'), 'utf8');
    expect(src).toMatch(/versionJsonBody\(/);
    expect(src).toMatch(/__AAP_EGG_BETA_RELOAD__:\s*JSON\.stringify\(eggBetaBuild\(process\.env\)\)/);
  });
});

describe('reloadPlanned (the planned-update notice, lib/reloadPlanned.ts)', () => {
  it('unset: no field, the body exactly as before', () => {
    const body = versionJsonBody(entries, release, { AAP_RELOAD_PLANNED_AT: ' ', AAP_RELOAD_PLANNED_NOTE: 'x' }, BUILT);
    expect(body).not.toHaveProperty('reloadPlanned');
    expect(JSON.stringify(body)).toBe(JSON.stringify(versionJsonBody(entries, release, {}, BUILT)));
  });

  it('AAP_RELOAD_PLANNED_AT writes reloadPlanned.at (normalised ISO), with the note when given', () => {
    expect(versionJsonBody(entries, release, { AAP_RELOAD_PLANNED_AT: '2026-11-08T03:00:00Z' }, BUILT).reloadPlanned).toEqual({
      at: '2026-11-08T03:00:00.000Z',
    });
    expect(
      versionJsonBody(
        entries,
        release,
        { AAP_RELOAD_PLANNED_AT: '2026-11-08T03:00:00Z', AAP_RELOAD_PLANNED_NOTE: ' New tables ' },
        BUILT
      ).reloadPlanned
    ).toEqual({ at: '2026-11-08T03:00:00.000Z', note: 'New tables' });
  });

  it('does not touch release or eggBeta', () => {
    const body = versionJsonBody(entries, release, { AAP_RELOAD_PLANNED_AT: '2026-11-08T03:00:00Z' }, BUILT);
    expect(body.release.reloadIfBuiltBefore).toBe(release.reloadIfBuiltBefore);
    expect(body).not.toHaveProperty('eggBeta');
  });

  it('an unreadable time or a note over 200 characters fails the build', () => {
    expect(() => versionJsonBody(entries, release, { AAP_RELOAD_PLANNED_AT: 'tonight' }, BUILT)).toThrow(/AAP_RELOAD_PLANNED_AT/);
    expect(() =>
      versionJsonBody(entries, release, { AAP_RELOAD_PLANNED_AT: '2026-11-08T03:00:00Z', AAP_RELOAD_PLANNED_NOTE: 'x'.repeat(201) }, BUILT)
    ).toThrow(/AAP_RELOAD_PLANNED_NOTE/);
  });
});
