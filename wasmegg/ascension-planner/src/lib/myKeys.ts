/**
 * The account keys (lib/leaderboardRank.ts `accountKeyOf`: timezone + best artifact per family) this
 * browser has seen for an account, so My runs' "maybe you" (lib/myRuns.ts `isMyRun`) still finds a run
 * sent before the gear or the timezone changed (16 Oct 2026: a tester's runs from an earlier save went
 * missing once the save moved on).
 *
 * Kept in this browser under the account's partition hash (`aap-my-keys:<sha-256>`, as search/owner.ts
 * keeps its code), never under the player ID, and never sent anywhere. The newest MAX_KEYS keys only.
 */
const PREFIX = 'aap-my-keys:';
export const MAX_KEYS = 12;

interface Kept {
  key: string;
  /** When this browser last saw the key (ms). */
  at: number;
}

function read(partition: string): Kept[] {
  try {
    const raw = localStorage.getItem(PREFIX + partition);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((k): k is Kept => !!k && typeof k.key === 'string' && typeof k.at === 'number')
      : [];
  } catch {
    return [];
  }
}

/** The keys this browser remembered for the account, newest first. */
export function rememberedKeys(partition: string): string[] {
  if (!partition) return [];
  return read(partition).map(k => k.key);
}

/** Remember `key` for the account (moved to the front if already kept); returns the keys now kept. */
export function rememberKey(partition: string, key: string, now = Date.now()): string[] {
  if (!partition || !key) return rememberedKeys(partition);
  const list = [{ key, at: now }, ...read(partition).filter(k => k.key !== key)].slice(0, MAX_KEYS);
  try {
    localStorage.setItem(PREFIX + partition, JSON.stringify(list));
  } catch {
    // A private window: the key still counts for this visit.
  }
  return list.map(k => k.key);
}
