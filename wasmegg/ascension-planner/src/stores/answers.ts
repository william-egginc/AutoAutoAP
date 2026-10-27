/**
 * The instant answer saved online for the account (lib/answersCloud.ts, contract aaap-tools/notes/instantcloud-contract.md
 * v1), one client per page load. The key is the follow store's (the account's follow key, a hash), the URL the
 * collector's own beside /follow. It does nothing without both, and after a 404 or 503 (an older collector) nothing
 * more on this page load.
 *
 * Read: only as the "stale answer" while the fresh one is worked out, and only when this browser keeps none for the
 * goal (InstantRoute.vue `showStale`; My runs' pricing meanwhile, composables/useNowPage.ts). Written: only a fresh
 * answer once kept in this browser (InstantRoute.vue `saveSnapshot`), never on load, never a restored or stale one.
 */
import { defineStore, getActivePinia } from 'pinia';
import { ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { AnswersClient, answersUrlOf, type AnswerOffer, type AnswersFetch, type CloudAnswer } from '@/lib/answersCloud';

/** The browser's fetch, called as itself (never as a method of another object: "Illegal invocation"). */
const browserFetch = (): AnswersFetch | null =>
  typeof fetch === 'function' ? (((u, i) => fetch(u, i as RequestInit)) as AnswersFetch) : null;
let fetchFor: () => AnswersFetch | null = browserFetch;
/** Specs: a stand-in collector (null: the real fetch). */
export function setAnswersFetch(f: AnswersFetch | null): void {
  fetchFor = f ? () => f : browserFetch;
}

/** How long a read waits for the account key and the collector before it gives up (quietly, with a console line). */
const READY_WAIT_MS = 20_000;

export const useAnswersStore = defineStore('answers', () => {
  const searchStore = () => {
    try {
      const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
      return pinia && 'chainSearch' in pinia.state.value ? useChainSearchStore() : null;
    } catch {
      return null;
    }
  };
  const keyNow = (): string => {
    try {
      return useFollowStore().cloudKey;
    } catch {
      return '';
    }
  };
  const urlNow = (): string => answersUrlOf(searchStore()?.submitUrl);
  /**
   * The key and the collector known (27 Oct 2026: a fresh private window asked before its account key was worked out,
   * got nothing and never asked again). Resolves when both are, or after READY_WAIT_MS (the read then says why not).
   */
  function whenReady(): Promise<void> {
    if (/^[0-9a-f]{64}$/.test(keyNow()) && urlNow()) return Promise.resolve();
    return new Promise<void>(resolve => {
      let stop: (() => void) | null = null;
      const timer = setTimeout(() => {
        stop?.();
        resolve();
      }, READY_WAIT_MS);
      stop = watch(
        () => /^[0-9a-f]{64}$/.test(keyNow()) && !!urlNow(),
        ok => {
          if (!ok) return;
          clearTimeout(timer);
          queueMicrotask(() => stop?.());
          resolve();
        },
        { immediate: true }
      );
    });
  }
  const client = new AnswersClient({
    key: keyNow,
    url: urlNow,
    whenReady,
    log: line => console.info(line),
    busy: () => {
      const s = searchStore();
      return !!s && (s.isRunning || s.deadlineRunning || s.resultSending);
    },
    fetch: () => fetchFor(),
  });
  /** Bumped when an answer is read back (My runs reads `read` again). */
  const readTick = ref(0);

  /** The answer saved online to show for a goal while it is worked out (lib/answersCloud.ts `pickEntry`: the exact entry,
   *  else this save's, else the goal's newest), or null (none, no collector, an older one, offline). */
  async function fallbackFor(want: { goal: string; e?: string | null; backupTime?: number | null }): Promise<CloudAnswer | null> {
    const a = await client.newestFor(want).catch(() => null);
    if (a) readTick.value++;
    return a;
  }
  /** The newest answer saved online of any goal (My runs' pricing meanwhile), or null. */
  async function newestAny(): Promise<CloudAnswer | null> {
    const a = await client.newestAny().catch(() => null);
    if (a) readTick.value++;
    return a;
  }
  /** The answers read back on this page load, newest first. */
  function read(): readonly CloudAnswer[] {
    void readTick.value;
    return client.read;
  }
  /** Save a fresh answer, once kept, online (debounced; quiet). */
  function offer(o: AnswerOffer): void {
    client.offer(o);
  }
  return { fallbackFor, newestAny, read, offer, readTick, client };
});
