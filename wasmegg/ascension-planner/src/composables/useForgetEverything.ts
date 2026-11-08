/**
 * "Delete everything saved online for this account" (client brief section 4; Jordan, 7 Nov 2026), the flow behind
 * Setup's button (components/auto/SaveOnlineSetup.vue):
 *   ask -> a confirm naming what goes (Words' SYNC_DELETE_CONFIRM) and what stays -> DELETE /forget?k=<key>&all=1
 *   (lib/syncedRecords.ts `forgetEverything`), the button disabled while it runs; Save online is turned OFF on this
 *   device BEFORE the call and stays off whatever it answers (decision b, 8 Nov 2026) -> 200: the counts; otherwise why, with Try again when the server could not
 *   be reached. Nothing in this browser changes on a failure, and on success only the switch does: an empty cloud never
 *   clears local data. Not gated by the switch (it works with Save online off). Shown only with SYNC_RECORDS on (the
 *   live collector has no /forget yet), a collector and an account key.
 */
import { computed, ref } from 'vue';
import { getActivePinia } from 'pinia';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { SYNC_RECORDS, forgetEverything, forgetUrlOf, type ForgetResult } from '@/lib/syncedRecords';
import { setSaveOnline } from '@/lib/saveOnline';
import { SAVE_ONLINE_OFF_AFTER_DELETE, SYNC_DELETED, SYNC_DELETE_CONFIRM } from '@/lib/syncWords';
import { SYNC_DELETE_STAYS, forgetCountsWords, forgetFailWords } from '@/lib/saveOnlineWords';

/** Delete went through on this page: the switch's line says what it did (SAVE_ONLINE_OFF_AFTER_DELETE). */
const deletedHere = ref(false);
export function deletedThisVisit(): boolean {
  return deletedHere.value;
}
/** Specs: a new page load. */
export function resetForgetEverything(): void {
  deletedHere.value = false;
}

export function useForgetEverything() {
  const searchStore = () => {
    try {
      const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
      return pinia && 'chainSearch' in pinia.state.value ? useChainSearchStore() : null;
    } catch {
      return null;
    }
  };
  const follows = useFollowStore();
  const submitUrl = () => searchStore()?.submitUrl ?? '';
  /** The button is there: the sync is on, there is a collector and an account key. */
  const available = computed(() => SYNC_RECORDS.enabled && !!forgetUrlOf(submitUrl()) && /^[0-9a-f]{64}$/.test(follows.cloudKey));
  const phase = ref<'idle' | 'confirm' | 'running' | 'done' | 'failed'>('idle');
  const result = ref<ForgetResult | null>(null);
  const busy = computed(() => phase.value === 'running');

  function ask(): void {
    if (busy.value) return;
    phase.value = 'confirm';
  }
  function cancel(): void {
    if (busy.value) return;
    phase.value = 'idle';
  }
  async function confirm(): Promise<void> {
    if (busy.value) return;
    phase.value = 'running';
    // Decision b (8 Nov 2026): off BEFORE the DELETE goes, and kept off whatever it answers, so a change whose wait
    // ends while it is out is never written back after it (Reliability's review).
    setSaveOnline(false);
    const key = follows.cloudKey;
    let r: ForgetResult;
    try {
      r = await forgetEverything(submitUrl(), key);
    } catch {
      r = { ok: false, why: 'offline' };
    }
    result.value = r;
    // The switch's own line says what Delete did only when it went through; a failure says it in its result lines.
    if (r.ok) deletedHere.value = true;
    phase.value = r.ok ? 'done' : 'failed';
  }

  const confirmLines = computed(() => [SYNC_DELETE_CONFIRM, SYNC_DELETE_STAYS]);
  const lines = computed<string[]>(() => {
    const r = result.value;
    if (!r || (phase.value !== 'done' && phase.value !== 'failed')) return [];
    // A failure says Save online is off on this device now (it went off before the call), beside why.
    return r.ok ? [forgetCountsWords(r.deleted), SYNC_DELETED] : [forgetFailWords(r.why, r.retryAfter), SAVE_ONLINE_OFF_AFTER_DELETE];
  });
  const canRetry = computed(() => phase.value === 'failed' && !!result.value && !result.value.ok && result.value.why === 'offline');

  return { available, phase, busy, result, ask, cancel, confirm, confirmLines, lines, canRetry };
}
