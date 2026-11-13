/**
 * lib/blackBoxDiag.ts stays out of the result code hash (lib/resultCodeHash.ts). Its entries are
 * diagnostics; written in search/blackBox.ts and search/stepAway.ts (bc4f1eee9) they moved the hash,
 * and every player's kept answers would have been worked out again for nothing. Over the real tree,
 * walked as vite.config.ts `readResultCodeFiles` walks it. No hash value is pinned: it moves with every
 * legitimate change to the hashed code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTestOrFixture, RESULT_CODE_DIRS, resolveImport, resultCodeInputs } from './resultCodeHash';

const DIAG = 'src/lib/blackBoxDiag.ts';

function realTree(): Map<string, string> {
  const root = path.resolve(__dirname, '../..');
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.ts')) files.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    }
  };
  walk('src');
  files.set('release.ts', fs.readFileSync(path.join(root, 'release.ts'), 'utf8'));
  return files;
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
/** The non-spec files under `prefixes` that import lib/blackBoxDiag.ts. */
function importersOfDiag(files: ReadonlyMap<string, string>, prefixes: readonly string[]): string[] {
  const out: string[] = [];
  for (const [p, text] of files) {
    if (isTestOrFixture(p) || !prefixes.some(d => p.startsWith(d))) continue;
    for (const m of text.matchAll(IMPORT)) if (resolveImport(p, m[1], files) === DIAG) out.push(p);
  }
  return out;
}

describe('lib/blackBoxDiag.ts is not a result code hash input', () => {
  it('the file exists, and is not among the inputs', () => {
    const files = realTree();
    expect(files.has(DIAG)).toBe(true);
    expect(resultCodeInputs(files)).not.toContain(DIAG);
  });

  it('no hashed directory, and no src/lib or src/types file, imports it (only src/stores and src/composables may)', () => {
    const files = realTree();
    expect(importersOfDiag(files, [...RESULT_CODE_DIRS, 'src/lib/', 'src/types/'])).toEqual([]);
  });
});
