/**
 * The "Credit me as" name, one per account for the whole site: Fastest route, By a date, the Full
 * sweep (its card and its share box), Science's sweep runner and the unsent results all read and write
 * this one, so a name typed in one is already in the others (composables/useShareResult.ts).
 *
 * Kept in this browser under the account's partition hash (`aap-share-name:<sha-256>`, as owner.ts
 * keeps its code), never under the player ID. In memory it is keyed by the ID the screens already
 * hold. Until a name is typed for an account there is none here, and each box shows the account's
 * own name (useShareResult.ts `useAccountName`).
 *
 * "Submit anonymously" or "Credit me as" is one per account too (the user, 14 Oct: he kept sending
 * anonymously because each screen started on anonymous again). Kept the same way, under
 * `aap-share-anon:<sha-256>` ('1' anonymous, '0' credit me); anonymous until the player picks.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { hashID } from '@/lib/storage/db';
import { capName } from '@/lib/study';

const PREFIX = 'aap-share-name:';
const ANON_PREFIX = 'aap-share-anon:';
/** The collector keeps 40 characters, and every send cuts there: the name is kept at that too (QA, 22 Oct
 *  2026: a paste of 500 characters was held in full), in memory and in this browser. */
const MAX = 40;

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}
function write(key: string, v: string): void {
  try {
    if (v.trim()) localStorage.setItem(PREFIX + key, capName(v, MAX));
    else localStorage.removeItem(PREFIX + key);
  } catch {
    // A private window: the name still works for this visit.
  }
}

function readAnon(key: string): boolean | undefined {
  try {
    const v = localStorage.getItem(ANON_PREFIX + key);
    return v === '1' ? true : v === '0' ? false : undefined;
  } catch {
    return undefined;
  }
}
function writeAnon(key: string, v: boolean): void {
  try {
    localStorage.setItem(ANON_PREFIX + key, v ? '1' : '0');
  } catch {
    // A private window: the choice still holds for this visit.
  }
}

export const useShareNameStore = defineStore('shareName', () => {
  /** By player ID (trimmed), in memory only: the name typed, '' when cleared. */
  const names = ref<Record<string, string>>({});
  const loaded = new Set<string>();
  /** The latest write per account, so an older one finishing its hash late cannot win. */
  const writes = new Map<string, number>();
  /** By player ID (trimmed), in memory: anonymous (true) or "Credit me as" (false), once chosen. */
  const anon = ref<Record<string, boolean>>({});
  const anonWrites = new Map<string, number>();
  /** Partition hash -> player ID, for the accounts this tab has hashed: what a storage event names. */
  const idOfHash = new Map<string, string>();
  const hashOf = async (id: string): Promise<string> => {
    const key = await hashID(id);
    idOfHash.set(key, id);
    return key;
  };

  /** The name typed for this account, or undefined when none has been. */
  function nameFor(playerId: string): string | undefined {
    return names.value[playerId.trim()];
  }

  /** Read this account's kept name, once. A name typed meanwhile wins over the kept one. */
  async function load(playerId: string): Promise<void> {
    const id = playerId.trim();
    if (!id || loaded.has(id)) return;
    loaded.add(id);
    const key = await hashOf(id);
    const kept = read(key);
    if (kept !== null && names.value[id] === undefined) names.value = { ...names.value, [id]: capName(kept, MAX) };
    const keptAnon = readAnon(key);
    if (keptAnon !== undefined && anon.value[id] === undefined) anon.value = { ...anon.value, [id]: keptAnon };
  }

  /** Anonymous or "Credit me as" for this account, or undefined until the player has picked. */
  function anonymousFor(playerId: string): boolean | undefined {
    return anon.value[playerId.trim()];
  }

  function setAnonymous(playerId: string, v: boolean): void {
    const id = playerId.trim();
    anon.value = { ...anon.value, [id]: v };
    if (!id) return;
    const n = (anonWrites.get(id) ?? 0) + 1;
    anonWrites.set(id, n);
    void hashOf(id).then(key => {
      if (anonWrites.get(id) === n) writeAnon(key, v);
    });
  }

  function setName(playerId: string, name: string): void {
    const id = playerId.trim();
    name = capName(name, MAX);
    names.value = { ...names.value, [id]: name };
    if (!id) return;
    const n = (writes.get(id) ?? 0) + 1;
    writes.set(id, n);
    void hashOf(id).then(key => {
      if (writes.get(id) === n) write(key, name);
    });
  }

  /**
   * Two tabs (prelive, 22 Oct 2026): another tab changed an account's name or its anonymous choice. This tab
   * takes it at once (held to the cap), for an account it has already read; one it has not reads the new value
   * when it loads. Nothing is written back, so no tab ever answers another's write (no echo). Exported for the
   * specs.
   */
  function storageEvent(key: string | null, newValue: string | null): void {
    if (!key) return;
    const isName = key.startsWith(PREFIX);
    if (!isName && !key.startsWith(ANON_PREFIX)) return;
    const id = idOfHash.get(key.slice(isName ? PREFIX.length : ANON_PREFIX.length));
    if (!id) return;
    if (isName) {
      const v = newValue === null ? '' : capName(newValue, MAX);
      if (names.value[id] !== v) names.value = { ...names.value, [id]: v };
      return;
    }
    const v = newValue === '1' ? true : newValue === '0' ? false : undefined;
    if (v !== undefined && anon.value[id] !== v) anon.value = { ...anon.value, [id]: v };
  }
  try {
    if (typeof window !== 'undefined')
      window.addEventListener('storage', e => {
        if (e.storageArea === null || e.storageArea === localStorage) storageEvent(e.key, e.newValue);
      });
  } catch {
    // no window events: one tab only
  }

  return { names, nameFor, load, setName, anon, anonymousFor, setAnonymous, storageEvent };
});
