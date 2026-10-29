/**
 * WHERE "SHARE THIS RESULT" GOES, LOOKED UP WHEN IT IS NEEDED (ux29-c, 27 Oct 2026: pieha reloaded his save with
 * the update banner up, and the instant answer showed "The instant answer couldn't be shown…").
 *
 * The instant card (InstantRoute.vue) draws its "Share this result" line at the bottom of the search panel, in
 * `#search-share-<screen>` (SearchPanel.vue), a Teleport away. It used to be a deferred Teleport to that selector.
 * Vue looks a Teleport's target up ONCE, when it mounts, and never again: a panel that was not on the page at that
 * moment (its first draw failed, and it drew fine a moment later) left the Teleport with no target for good. The
 * line itself shows only once a search has a result, and then Vue put it into "nothing" inside the card's own
 * update, which threw ("Cannot read properties of null (reading 'nextSibling')", or 'insertBefore'), and the
 * guard (InstantGuard.ts) showed its message in place of the whole answer. A panel drawn again (a new element) left
 * the line in the old, detached one: never seen.
 *
 * So the target is looked up (useTeleportTarget.ts, shared with DeadlinePanel's run controls and results): once
 * the page around the card is drawn (onMounted, after the panel below it), and again each time the line is about to
 * show (before the card draws), so a panel drawn late or drawn again is found. No target: null, and the card shows
 * the line under the answer instead (the Teleport disabled), never nothing and never a throw.
 */
export {
  teleportTargetOf as shareTargetOf,
  useTeleportTarget as useShareTarget,
  type FindElement,
} from './useTeleportTarget';
