/** Test helper (not shipped with the Worker): Node's in-memory SQLite behind D1's prepare/bind/first/all/run, real migrations applied. */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = readdirSync(new URL('./migrations/', import.meta.url))
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));

/** `failInsert`: how many INSERTs into follows/prefs to refuse with a UNIQUE error first (a lost race). */
export function makeD1(failInsert = { n: 0 }) {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) db.exec(m);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    async first() {
      const row = db.prepare(sql).get(...args);
      return row ? { ...row } : null;
    },
    async all() {
      return { results: db.prepare(sql).all(...args).map(r => ({ ...r })), success: true };
    },
    async run() {
      if (failInsert.n > 0 && /^\s*INSERT INTO (follows|prefs) /i.test(sql)) {
        failInsert.n--;
        throw new Error('D1_ERROR: UNIQUE constraint failed');
      }
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: sql => statement(sql), _db: db };
}

