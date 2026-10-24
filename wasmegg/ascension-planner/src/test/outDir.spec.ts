/** The command line's --out directory plan (scripts/outDir.ts): what a re-run does with what is there. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHECKPOINT_DIR, planOutDir } from '../../scripts/outDir';

const root = mkdtempSync(join(tmpdir(), 'out-dir-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('planOutDir', () => {
  it('an empty checkpoint left by a run that stopped before pricing anything starts afresh', () => {
    const dir = join(root, 'early');
    mkdirSync(join(dir, CHECKPOINT_DIR, 'metadata'), { recursive: true });
    expect(planOutDir(dir, 'sig', false)).toEqual({ action: 'new', record: null });
    expect(existsSync(join(dir, CHECKPOINT_DIR))).toBe(false);
  });

  it('a checkpoint with records but no run.json is still refused (it could be anything)', () => {
    const dir = join(root, 'unknown');
    mkdirSync(join(dir, CHECKPOINT_DIR, 'metadata'), { recursive: true });
    writeFileSync(join(dir, CHECKPOINT_DIR, 'metadata', 'x.json'), '{}');
    expect(() => planOutDir(dir, 'sig', false)).toThrow(/no run.json/);
  });

  it('nothing there: a new run', () => {
    expect(planOutDir(join(root, 'none'), 'sig', false)).toEqual({ action: 'new', record: null });
  });
});
