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
import { ref } from 'vue';
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

export const useAnswersStore = defineStore('answers', () => {
  const searchStore = () => {
    try {
      const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
      return pinia && 'chainSearch' in pinia.state.value ? useChainSearchStore() : null;
    } catch {
      return null;
    }
  };
  const client = new AnswersClient({
    key: () => {
      try {
        return useFollowStore().cloudKey;
      } catch {
        return '';
      }
    },
    url: () => answersUrlOf(searchStore()?.submitUrl),
    busy: () => {
      const s = searchStore();
      return !!s && (s.isRunning || s.deadlineRunning || s.resultSending);
    },
    fetch: () => fetchFor(),
  });
  /** Bumped when an answer is read back (My runs reads `read` again). */
  const readTick = ref(0);

  /** The newest answer saved online for `goal`, or null (none, no collector, an older one, offline). */
  async function fallbackFor(goal: string): Promise<CloudAnswer | null> {
    const a = await client.newestFor(goal).catch(() => null);
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
