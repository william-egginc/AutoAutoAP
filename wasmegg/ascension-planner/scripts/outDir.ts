/**
 * The `--out DIR` directory: what a run leaves for `submit --from`, and what lets the same command
 * carry on after a kill.
 *
 *   DIR/run.json          what run this is (its flags' signature), its plan start, and how it ended
 *   DIR/checkpoint/       the store's own checkpoints (scripts/node-idb.ts)
 *   DIR/run.csv.gz        the table, as the site uploads it
 *   DIR/submission.json   the summary, as the site POSTs it (src/search/offline.ts)
 *   DIR/submitted.json    written by `submit` once the collector has it
 *
 * The plan start is pinned here because it is part of the run's fingerprint: priced chains only mean
 * anything against the clock they were priced under, and a default start of "the current hour" would
 * make every restart a different run.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type RunStatus = 'running' | 'stopped' | 'done' | 'failed';

export interface RunRecord {
  format: 1;
  /** `runSignature` of the flags (src/search/offline.ts). */
  signature: string;
  status: RunStatus;
  startDate: string;
  startTime: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export const RUN_FILE = 'run.json';
export const CHECKPOINT_DIR = 'checkpoint';

export function readRunRecord(dir: string): RunRecord | null {
  try {
    const r = JSON.parse(readFileSync(join(dir, RUN_FILE), 'utf8')) as Partial<RunRecord>;
    if (r.format !== 1 || typeof r.signature !== 'string' || typeof r.startDate !== 'string') return null;
    return r as RunRecord;
  } catch {
    return null;
  }
}

export function writeRunRecord(dir: string, rec: RunRecord): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, RUN_FILE);
  writeFileSync(file + '.tmp', JSON.stringify(rec, null, 2));
  renameSync(file + '.tmp', file);
}

export type OutPlan =
  | { action: 'new'; record: null }
  | { action: 'resume'; record: RunRecord }
  | { action: 'finished'; record: RunRecord };

/**
 * What to do with `dir` for a run of this signature. Throws when it holds another run, rather than
 * quietly mixing two runs' checkpoints; `fresh` clears it instead.
 */
export function planOutDir(dir: string, signature: string, fresh: boolean): OutPlan {
  const record = readRunRecord(dir);
  const hasCheckpoint = existsSync(join(dir, CHECKPOINT_DIR));
  if (fresh) {
    rmSync(join(dir, CHECKPOINT_DIR), { recursive: true, force: true });
    for (const f of [RUN_FILE, 'submission.json', 'run.csv.gz', 'run.csv', 'submitted.json']) rmSync(join(dir, f), { force: true });
    return { action: 'new', record: null };
  }
  if (!record) {
    if (hasCheckpoint) {
      throw new Error(
        `${dir} holds a checkpoint but no ${RUN_FILE}, so it cannot be told what run it is. Use another --out, or --fresh to clear it.`
      );
    }
    return { action: 'new', record: null };
  }
  if (record.signature !== signature) {
    throw new Error(
      `${dir} already holds a different run (its flags: ${record.signature || '(none)'}). ` +
        'Use another --out, or --fresh to throw it away and start this one.'
    );
  }
  return { action: record.status === 'done' ? 'finished' : 'resume', record };
}
