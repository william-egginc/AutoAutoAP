/**
 * Whether a run the page holds is this account's, for My runs › Your latest run (16 Oct 2026: with another
 * account loaded, it showed the first account's By a date run). Shown only when:
 *  - its tag (the chain-search store's `chainResultOwner` / `deadlineResultOwner`: the partition hash of the
 *    player ID it was run, loaded or opened for, lib/accountHash.ts) is this account's hash. A result read
 *    back from IndexedDB is tagged with the partition it was read from, so an older record with no account
 *    of its own is tied to the account it is stored under; an untagged one ('') is never shown;
 *  - and, when both are known, the save it was priced on (search/runSaves.ts `accountOf`, kept with the
 *    stored save) is the loaded save's account: an ID typed over another account's save doesn't borrow it.
 */
export interface RunOwnerCheck {
  /** The run's tag ('' unknown). */
  owner: string;
  /** This account's hash ('' while it is worked out, or with no account). */
  here: string;
  /** The account of the save the run priced, when known. */
  saveAccount?: string;
  /** The account of the save loaded now, when known. */
  nowAccount?: string;
}

export function runIsMine(c: RunOwnerCheck): boolean {
  if (!c.here || !c.owner || c.owner !== c.here) return false;
  if (c.saveAccount && c.nowAccount && c.saveAccount !== c.nowAccount) return false;
  return true;
}
