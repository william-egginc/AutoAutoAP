/**
 * The "Credit me as" name, one per account for the whole site: Fastest route, By a date, the Full
 * sweep (its card and its share box), Science's sweep runner and the unsent results all read and write
 * this one, so a name typed in one is already in the others (composables/useShareResult.ts).
 *
 * Kept in this browser under the account's partition hash (`aap-share-name:<sha-256>`, as owner.ts
 * keeps its code), never under the player ID. In memory it is keyed by the ID the screens already
 * hold. Until a name is typed for an account there is none here, and each box shows the account's
 * own name (useShareResult.ts `useAccountName`). Which of anonymous or named to send stays each
 * screen's own choice.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { hashID } from '@/lib/storage/db';

const PREFIX = 'aap-share-name:';
/** The collector keeps 40 characters; a little over, in case a box allows it. */
const MAX = 60;

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}
function write(key: string, v: string): void {
  try {
    if (v.trim()) localStorage.setItem(PREFIX + key, v.slice(0, MAX));
    else localStorage.removeItem(PREFIX + key);
  } catch {
    // A private window: the name still works for this visit.
  }
}

export const useShareNameStore = defineStore('shareName', () => {
  /** By player ID (trimmed), in memory only: the name typed, '' when cleared. */
  const names = ref<Record<string, string>>({});
  const loaded = new Set<string>();
  /** The latest write per account, so an older one finishing its hash late cannot win. */
  const writes = new Map<string, number>();

  /** The name typed for this account, or undefined when none has been. */
  function nameFor(playerId: string): string | undefined {
    return names.value[playerId.trim()];
  }

  /** Read this account's kept name, once. A name typed meanwhile wins over the kept one. */
  async function load(playerId: string): Promise<void> {
    const id = playerId.trim();
    if (!id || loaded.has(id)) return;
    loaded.add(id);
    const kept = read(await hashID(id));
    if (kept !== null && names.value[id] === undefined) names.value = { ...names.value, [id]: kept };
  }

  function setName(playerId: string, name: string): void {
    const id = playerId.trim();
    names.value = { ...names.value, [id]: name };
    if (!id) return;
    const n = (writes.get(id) ?? 0) + 1;
    writes.set(id, n);
    void hashID(id).then(key => {
      if (writes.get(id) === n) write(key, name);
    });
  }

  return { names, nameFor, load, setName };
});
