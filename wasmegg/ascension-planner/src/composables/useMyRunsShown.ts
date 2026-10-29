/**
 * Whether the account on screen has anything My runs shows (lib/myRunsShown.ts): a followed route, an instant answer
 * snapshot or a saved By a date answer, a kept Fast, Exact or Custom result, a saved run, or something seen there
 * before. Reads only this browser's storage (localStorage and the saved-run library); nothing is fetched. Looked at
 * again when the account changes and whenever something may have been kept (`myRunsBump`: an instant answer saved, a
 * result kept, a follow), and when the search store's saved runs or answers change.
 */
import { ref, watch, type Ref } from 'vue';
import { getActivePinia } from 'pinia';
import { accountHash, accountHashNow } from '@/lib/accountHash';
import { useFollowStore } from '@/stores/follow';
import { readFollows } from '@/lib/follow';
import { readKeptSearches } from '@/lib/searchPlan';
import { readSnapIndex } from '@/search/instantSnapshot';
import { accountOf } from '@/search/runSaves';
import { listRuns } from '@/search/runLibrary';
import { listSavedAnswers } from '@/search/deadlineStore';
import {
  myRunsBump,
  myRunsHasSomething,
  readMyRunsSeen,
  writeMyRunsSeen,
  type MyRunsContent,
  type MyRunsHas,
} from '@/lib/myRunsShown';

/** The account hashes (search/runSaves.ts `accountOf`) a snapshot or a kept result of this player may carry: the ID as
 *  typed, in capitals (as saves have it), and the loaded save's own when it is this player's. */
function accountsOf(id: string, raw: unknown): Set<string> {
  const out = new Set<string>([accountOf({ eiUserId: id }), accountOf({ eiUserId: id.toUpperCase() })]);
  const own = (raw as { eiUserId?: string | null } | null)?.eiUserId ?? '';
  if (own && own.trim().toLowerCase() === id.toLowerCase()) out.add(accountOf(raw));
  out.delete('');
  return out;
}

async function libraryCount(p: string): Promise<number> {
  try {
    const [runs, answers] = await Promise.all([listRuns(p), listSavedAnswers(p)]);
    return runs.length + answers.length;
  } catch {
    return 0;
  }
}

/** What the account has, read now (null: no account). */
export async function readMyRunsHas(id: string, raw: unknown): Promise<{ partition: string; has: MyRunsHas } | null> {
  const p = id ? await accountHash(id).catch(() => '') : '';
  if (!p) return null;
  const accounts = accountsOf(id, raw);
  const followed = Object.keys(readFollows(p)).length > 0;
  const answersHere = readSnapIndex().some(e => !!e.meta && accounts.has(e.meta.account));
  const kept = readKeptSearches().some(k => accounts.has(k.account));
  const seen = readMyRunsSeen(p);
  const saved = followed || answersHere || kept || seen ? false : (await libraryCount(p)) > 0;
  return { partition: p, has: { followed, answers: answersHere, kept, saved, seen } };
}

/** Remember that the account has something on My runs (a board run seen there). */
export async function markMyRunsSeen(id: string): Promise<void> {
  const p = id ? await accountHash(id).catch(() => '') : '';
  if (p) writeMyRunsSeen(p);
}

/**
 * A route followed in the follow store (stores/follow.ts) for the loaded save's account, read live (QA 24 Oct 2026,
 * Safari: "Follow this route" didn't bring My runs in). The store keeps follows under the hash of the save's own ID, and
 * the stored read above under the ID as typed: when the two differ (typed in lower case, or a save whose ID isn't the
 * one typed) the follow was never found. Only once the page has made the store (a Follow press or an automatic follow
 * always has), so nothing is made or fetched here for this; reactive on the store being made, its account and its
 * follows, so a follow on any screen counts at once. Never for an account the store hasn't caught up with yet.
 */
export function followedInStore(rawBackup: unknown): boolean {
  const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
  if (!pinia || !('follow' in pinia.state.value)) return false;
  const f = useFollowStore();
  const own = ((rawBackup as { eiUserId?: string | null } | null)?.eiUserId ?? '').trim();
  if (!f.partition || !own || f.partition !== accountHashNow(own)) return false;
  return f.followedGoals().length > 0;
}

export function useMyRunsShown(o: {
  playerId: () => string;
  rawBackup: () => unknown;
  /** The search store's saved runs and answers (a count): looked at again when one is saved or removed. */
  library?: () => number;
}): { content: Ref<MyRunsContent> } {
  const content = ref<MyRunsContent>('unknown');
  let lastId = '';
  let asked = 0;
  watch(
    () => [o.playerId().trim(), myRunsBump.value, o.library?.() ?? 0, o.rawBackup(), followedInStore(o.rawBackup())] as const,
    async ([id, , , , followedNow]) => {
      if (id !== lastId) {
        lastId = id;
        content.value = 'unknown';
      }
      if (!id) return;
      // A follow counts right away, before storage is read.
      if (followedNow) content.value = 'some';
      const n = ++asked;
      const got = await readMyRunsHas(id, o.rawBackup());
      if (n !== asked || o.playerId().trim() !== id || !got) return;
      const some = myRunsHasSomething(got.has) || followedInStore(o.rawBackup());
      if (some && !got.has.seen) writeMyRunsSeen(got.partition);
      content.value = some ? 'some' : 'none';
    },
    { immediate: true }
  );
  return { content };
}
