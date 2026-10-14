import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jointSimVersion, SIM_SOURCE_HASH, SIM_SOURCES, SIM_VERSION, tableSimMismatch } from './simVersion';

const ROOT = join(__dirname, '../..');

function filesOf(path: string): string[] {
  const full = join(ROOT, path);
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full, { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map(f => relative(ROOT, join(full, f)).split('\\').join('/'));
}

/** sha256 over each file's path and bytes, sorted by path, so the order on disk does not matter. */
function simSourceHash(): string {
  const h = createHash('sha256');
  for (const f of SIM_SOURCES.flatMap(filesOf).sort()) {
    h.update(f + '\0');
    h.update(readFileSync(join(ROOT, f)));
    h.update('\0');
  }
  return h.digest('hex');
}

describe('simulator version', () => {
  it('SIM_SOURCE_HASH matches the simulator code (see simVersion.ts before changing it)', () => {
    // Failing? The simulator's code changed. If any table cell can change, bump SIM_VERSION too.
    // If not (bitcheck identical), only copy the new hash into SIM_SOURCE_HASH.
    expect(simSourceHash()).toBe(SIM_SOURCE_HASH);
  });

  it('a table stamped with this simulator matches', () => {
    expect(tableSimMismatch({ simVersion: SIM_VERSION })).toBeNull();
    expect(tableSimMismatch(null)).toBeNull();
  });

  it('an older or unstamped table does not', () => {
    expect(tableSimMismatch({ simVersion: '2026-01-01-old' })).toBe('built with simulator 2026-01-01-old');
    expect(tableSimMismatch({})).toBe('built before tables were stamped');
  });

  it('a joined table keeps the stamp only when both parts agree', () => {
    expect(jointSimVersion(SIM_VERSION, SIM_VERSION)).toBe(SIM_VERSION);
    expect(jointSimVersion(SIM_VERSION, 'other')).toBeUndefined();
    expect(jointSimVersion(undefined, SIM_VERSION)).toBeUndefined();
  });
});
