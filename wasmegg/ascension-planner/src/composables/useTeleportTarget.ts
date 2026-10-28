/**
 * A TELEPORT'S TARGET, LOOKED UP WHEN IT IS NEEDED (ux29-c and teleport2, 27 Oct 2026). Vue 3.5 looks a Teleport's
 * target up ONCE, when it mounts (a deferred one: just after), and never again. A target not on the page at that
 * moment (the panel holding it failed its first draw and drew fine a moment later) left the Teleport with no target
 * for good: content shown later was put into "nothing" inside the owner's update, which threw ("Cannot read
 * properties of null (reading 'nextSibling')") and stopped that update half way. A target drawn again (a new
 * element) kept the content in the old, detached one: never seen.
 *
 * So the owner passes the ELEMENT, looked up here: once the page around it is drawn (onMounted, after the parts
 * below it), again each time its content is about to show (before the owner draws), and after each time the owner
 * draws again, so a target drawn late or drawn again is found. No target: null, and the owner disables the Teleport so the content shows in place, never
 * nothing and never a throw:
 *
 *   <Teleport :to="el ?? 'body'" :disabled="!el">  (never `defer`, never the selector itself)
 *
 * Users: InstantRoute.vue's "Share this result" (useShareTarget.ts), DeadlinePanel.vue's run controls and results.
 */
import { onMounted, onUpdated, shallowRef, watch, type ShallowRef, type WatchSource } from 'vue';

/** The page's own lookup; a parameter so a spec can hand in its own page. */
export type FindElement = (selector: string) => Element | null;

const pageLookup: FindElement = selector =>
  typeof document === 'undefined' ? null : document.querySelector(selector);

/** The element `selector` names, only while it is on the page; null for none, a bad selector or no page. */
export function teleportTargetOf(selector: string | undefined, find: FindElement = pageLookup): Element | null {
  if (!selector) return null;
  try {
    const el = find(selector);
    return el && el.isConnected !== false ? el : null;
  } catch {
    return null;
  }
}

/**
 * The target for `selector`, looked up after mount, whenever `shown` turns true (before the owner draws) and after
 * the owner draws again.
 * Null until found.
 */
export function useTeleportTarget(
  selector: () => string | undefined,
  shown: WatchSource<boolean>,
  find: FindElement = pageLookup
): ShallowRef<Element | null> {
  const target = shallowRef<Element | null>(null);
  const lookUp = (): void => {
    const el = teleportTargetOf(selector(), find);
    if (el !== target.value) target.value = el;
  };
  onMounted(lookUp);
  // Content that shows all along (Custom's run controls) gets no `shown` change: each time the owner draws again, a
  // target that has come (or come back as a new element) is picked up. Four lookups at most; a change draws once more.
  onUpdated(lookUp);
  watch(
    shown,
    on => {
      if (on) lookUp();
    },
    { flush: 'pre' }
  );
  return target;
}
