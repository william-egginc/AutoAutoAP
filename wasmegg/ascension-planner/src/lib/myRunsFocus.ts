/**
 * "Dig deeper into your plan ›" (DigDeeperLink.vue) opens My runs on its Your runs section rather than its top
 * (spec myruns-now v3, section 6). The link is a plain address (#/myruns); its click leaves this ask, which
 * MyRunsView takes when it mounts. One shot, a minute at most: an ask nobody took is forgotten.
 */
import { shallowRef } from 'vue';

const ASK_TTL_MS = 60_000;
const asked = shallowRef<number | null>(null);

export function askYourRuns(now = Date.now()): void {
  asked.value = now;
}

/** True once for an ask made in the last minute; cleared either way. */
export function takeYourRunsAsk(now = Date.now()): boolean {
  const at = asked.value;
  asked.value = null;
  return at != null && now - at >= 0 && now - at < ASK_TTL_MS;
}
