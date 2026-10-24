/**
 * The command line's file-backed IndexedDB (scripts/node-idb.ts) driven through lib/storage/db.ts
 * itself, as `fastsearch --out DIR` uses it: writes resolve when their transaction completes, prefix
 * reads and deletes go through IDBKeyRange, and a second "run" finds what the first left on disk.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { installFileIndexedDb } from '../../scripts/node-idb';

const dir = mkdtempSync(join(tmpdir(), 'node-idb-'));
const g = globalThis as { indexedDB?: unknown; IDBKeyRange?: unknown };
const saved = { indexedDB: g.indexedDB, IDBKeyRange: g.IDBKeyRange };
delete g.IDBKeyRange;
installFileIndexedDb(dir);
const db = await import('@/lib/storage/db');

afterAll(() => {
  g.indexedDB = saved.indexedDB;
  g.IDBKeyRange = saved.IDBKeyRange;
  rmSync(dir, { recursive: true, force: true });
});

describe('the command line’s file-backed IndexedDB', () => {
  it('a metadata write resolves (its transaction completes) and reads back', async () => {
    await db.saveMetadata('p1', 'run', { a: 1 });
    expect(await db.loadMetadata('p1', 'run')).toEqual({ a: 1 });
    expect(readdirSync(join(dir, 'metadata')).length).toBeGreaterThan(0);
  });

  it('writes several records in one transaction, reads a prefix in key order, deletes by prefix', async () => {
    await db.putMetadataRecords('p1', [
      { key: 'part_2', value: [2] },
      { key: 'part_1', value: [1] },
      { key: 'other', value: 'x' },
    ]);
    expect(await db.loadMetadataPrefix('p1', 'part_')).toEqual([[1], [2]]);
    await db.putMetadataRecords('p1', [{ key: 'part_3', value: [3], raw: true }], ['part_']);
    // The delete of the old parts and the new write land together; only the new part remains.
    expect(await db.loadMetadataPrefix('p1', 'part_')).toEqual([[3]]);
    expect(await db.loadMetadata('p1', 'other')).toBe('x');
  });

  it('another account’s records are not in the prefix', async () => {
    await db.saveMetadata('p2', 'part_1', 'theirs');
    expect(await db.loadMetadataPrefix('p1', 'part_')).toEqual([[3]]);
  });

  it('a fresh install on the same directory (a re-run) finds the records', async () => {
    installFileIndexedDb(dir);
    expect(await db.loadMetadata('p1', 'other')).toBe('x');
    expect(await db.loadMetadataPrefix('p1', 'part_')).toEqual([[3]]);
  });
});
