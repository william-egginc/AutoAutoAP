/**
 * The race-to-the-target share, one copy for both depths of Fastest route (Smart search and the Full
 * sweep): the consent and name (useShareIdentity), the CSV and diagnostics boxes (useShareExtras), the
 * status line, Put my name on it and Retry the table (useBoardSubmit), and the send itself
 * (search/sendRun.ts `sendRunResult`, which the Science tab's runner uses too).
 *
 * Smart search used to carry a private copy of sendRunResult's steps, and a name that was neither
 * trimmed nor capped; the Full sweep had its own. Now a fix lands on both.
 */
import { computed, ref, watch, type Ref } from 'vue';
import type { useChainSearchStore } from '@/stores/chainSearch';
import { sendRunResult } from '@/search/sendRun';
import { onBoardLine } from '@/search/sentOnBoard';
import { useShareExtras } from './useShareExtras';
import { useBoardSubmit, useShareIdentity } from './useShareResult';
import { consentGivenThisVisit } from './useConsent';
import { downloadFile } from '@/utils/export';

type Store = ReturnType<typeof useChainSearchStore>;

/** The collector caps a nickname at 40 characters and truncates rather than rejecting. */
export const NICKNAME_MAX = 40;
/** ` YYYY-MM-DD HH:MM` -- the space plus sixteen characters. */
const STAMP_LEN = 17;

/** Local time, not UTC: it sits next to `startLocal` and `endLocal` on the row, which are local too. */
function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function useFastestShare(
  store: Store,
  playerId: () => string,
  /** The Full sweep's "Add the time to the name" (budgeted inside the 40 characters). */
  stampName: Ref<boolean> = ref(false)
) {
  const identity = useShareIdentity(playerId);
  const { optIn, anonymous, nickname } = identity;
  const { sendCsv: includeCsv, diagnosticsGo } = useShareExtras();

  /** The name a best so far goes under: the box's, without the time stamp (that is for the final row). */
  const plainName = computed(() => (anonymous.value ? '' : nickname.value.trim().slice(0, NICKNAME_MAX)));

  /** What actually goes on the row. Anonymous wins over whatever is in the box, so a half-typed name
   *  cannot be sent by someone who then picked anonymous. */
  const effectiveNickname = computed(() => {
    const base = plainName.value;
    if (!base || !stampName.value) return base;
    return `${base.slice(0, NICKNAME_MAX - STAMP_LEN)} ${localStamp()}`;
  });

  // A yes remembered for the account (arriving as it loads) is not a tick: rechecks wait for one.
  const board = useBoardSubmit(store, effectiveNickname, optIn, () => consentGivenThisVisit('leaderboard'));
  const { submitMessage, submitOk, refuseDuplicate } = board;
  const submitting = ref(false);

  /** Send the result on screen. `sweepSend`: a Science sweep link, whose card promises the full CSV and
   *  says nothing of diagnostics, so it always sends the one and never the other. */
  async function submit(sweepSend = false): Promise<void> {
    // Clicks made while the page was frozen building the table arrive afterwards; each one used to
    // send another copy.
    if (refuseDuplicate()) return;
    if (!optIn.value || submitting.value) return;
    submitting.value = true;
    submitOk.value = true;
    try {
      const res = await sendRunResult(
        store,
        effectiveNickname.value,
        sweepSend || includeCsv.value,
        text => {
          submitMessage.value = text;
        },
        !sweepSend && diagnosticsGo.value
      );
      submitOk.value = res.ok;
      submitMessage.value = res.text;
    } finally {
      submitting.value = false;
    }
  }

  /**
   * "Already on the Leaderboard (sent at 10:48 AM)" when the result's row is already there, known on load from
   * the account's rows (stores/chainSearch.ts `fastestOnBoard`; Jordan, 27 Oct 2026). '' otherwise, or while
   * the rows are not read: Submit as before. A send made this visit says how it went itself.
   */
  const fastestOnBoardLine = computed(() => {
    if (submitMessage.value) return '';
    const row = store.fastestOnBoard;
    return row ? onBoardLine(row) : '';
  });
  watch(
    () => store.bestDays > 0 && !store.isRunning,
    done => {
      if (done) void store.loadMineRows();
    },
    { immediate: true }
  );

  /** The payload, pretty-printed, so "show exactly what is sent" is the literal bytes. */
  function payloadPreview(): string {
    const p = store.buildRunSubmission(effectiveNickname.value);
    return p ? JSON.stringify(p, null, 2) : 'Nothing to share yet. Run a search first.';
  }

  /** The offline path, and the only one with no collector configured. A Blob (utils/export), not a `data:` URI:
   *  those are length-capped in some browsers. */
  function downloadSubmission(): void {
    if (!optIn.value) return;
    const payload = store.buildRunSubmission(effectiveNickname.value);
    if (!payload) return;
    // Through the page's one download (utils/export), which also clears any player ID left in it.
    downloadFile(store.submissionFilename(payload), JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    submitOk.value = true;
    submitMessage.value = 'Saved. Share it wherever you like.';
  }

  return {
    ...identity,
    ...board,
    includeCsv,
    diagnosticsGo,
    plainName,
    effectiveNickname,
    submitting,
    submit,
    payloadPreview,
    downloadSubmission,
    fastestOnBoardLine,
  };
}
