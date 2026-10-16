/**
 * The account's partition hash (lib/storage/db.ts `hashID`: SHA-256 of the player ID, the key IndexedDB and
 * the per-account localStorage records live under), remembered once worked out, so a view can read it
 * synchronously (`accountHashNow`) after anything has asked for it (`accountHash`). Only hashes are kept;
 * the ID is the map's key in memory, never stored or shown.
 *
 * Used to tie what the page holds in memory to an account (16 Oct 2026, My runs › Your latest run: a run
 * on one account never shows on another): the chain-search store tags its Fastest and By a date results
 * with the hash of the account they ran for.
 */
import { hashID } from '@/lib/storage/db';

const known = new Map<string, string>();

const norm = (id: string) => (id || '').trim();

/** The hash, worked out (and remembered) if needed; '' for no account. */
export async function accountHash(playerId: string): Promise<string> {
  const id = norm(playerId);
  if (!id) return '';
  const held = known.get(id);
  if (held) return held;
  const h = await hashID(id);
  known.set(id, h);
  return h;
}

/** The hash if it was worked out already, else '' (callers then ask `accountHash` and wait). */
export function accountHashNow(playerId: string): string {
  return known.get(norm(playerId)) ?? '';
}
