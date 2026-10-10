/**
 * Finished results not yet on the board, kept in this browser until they are sent or dismissed
 * ("This result wasn't sent: Send it now").
 *
 * WHY. On 9 Oct a 19.5 h By a date run crashed during its end-of-run send; its carry-on finished but
 * did not send; a reload then lost the answer from memory, leaving only a Saved answers entry that
 * could not be sent as the run. So when a run (By a date, Smart search or a Full sweep) finishes, the
 * stores/chainSearch.ts store keeps everything a send needs, as it will be sent: the payload (which
 * carries the run's own account snapshot, so the send never reads whatever save is loaded later), the
 * CSV already gzipped in its final format, the stored save's key (kept from pruning while this is
 * here), and, once the player has said yes, the name, CSV and diagnostics choices. Any send of the
 * same result uses the kept CSV rather than building it again, and removes the record when it lands.
 *
 * Plain data in IndexedDB (lib/storage/db.ts), one record each, with no JSON round-trip (an
 * ArrayBuffer does not survive one). Only the newest MAX_PENDING_SENDS are kept: each holds up to 8 MB.
 */
import { loadMetadataPrefix, putMetadataRecords } from '@/lib/storage/db';
import type { Submission } from './submission';

const PREFIX = 'pendingSend:';
export const MAX_PENDING_SENDS = 3;

export type PendingKind = 'deadline' | 'fastest';

/** The player's yes, and how: what Send it now sends under without asking again. */
export interface PendingConsent {
  /** '' for anonymous. */
  nickname: string;
  sendCsv: boolean;
  sendDiagnostics: boolean;
}

export interface PendingSend {
  id: string;
  kind: PendingKind;
  /** What makes it the same result: `deadline:<result.at>`, or the Fastest result's `resultKey()`. */
  key: string;
  /** "248 TE by Jul 14, 2027 9:00 AM", "490 TE in 512.31 days": for the list. */
  label: string;
  createdAt: number;
  /** As built when the run finished: anonymous, the run's note, `replaces` its best so far. */
  payload: Submission;
  /** The CSV, gzipped, in its final format; absent when it could not be built (too big, a failure). */
  csvGz?: ArrayBuffer;
  /** Set once the player agreed (Find and submit, a yes during the run, or a send that began). */
  consent?: PendingConsent | null;
  /** The run's stored save (search/runSaves.ts): kept from pruning while this is here. */
  inputsKey?: string;
  /** The last try's failure, for the list. */
  lastError?: string;
}

const keyOf = (id: string) => `${PREFIX}${id}`;

export function newPendingId(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listPendingSends(partitionHash: string): Promise<PendingSend[]> {
  const raw = (await loadMetadataPrefix(partitionHash, PREFIX)) as PendingSend[];
  return raw
    .filter(
      p => p && typeof p.id === 'string' && typeof p.key === 'string' && p.payload && typeof p.payload === 'object'
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Keep `p` (replacing any record of the same result), and drop all but the newest MAX_PENDING_SENDS. */
export async function keepPendingSend(partitionHash: string, p: PendingSend): Promise<PendingSend[]> {
  const others = (await listPendingSends(partitionHash)).filter(x => x.id !== p.id && x.key !== p.key);
  const all = [p, ...others].sort((a, b) => b.createdAt - a.createdAt);
  const kept = all.slice(0, MAX_PENDING_SENDS);
  const dropped = all.slice(MAX_PENDING_SENDS);
  const replaced = (await listPendingSends(partitionHash)).filter(x => x.id !== p.id && x.key === p.key);
  await putMetadataRecords(partitionHash, [
    { key: keyOf(p.id), value: p, raw: true },
    ...[...dropped, ...replaced].map(x => ({ key: keyOf(x.id), value: null })),
  ]);
  return kept;
}

export async function dropPendingSend(partitionHash: string, id: string): Promise<void> {
  await putMetadataRecords(partitionHash, [{ key: keyOf(id), value: null }]);
}

/** The payload to send for a kept result under the player's choices: name and note put on it. */
export function pendingPayload(p: PendingSend, nickname: string, note?: string): Submission {
  const out: Submission = { ...p.payload };
  if (nickname) out.nickname = nickname;
  else delete out.nickname;
  if (note !== undefined) {
    if (note) out.note = note;
    else delete out.note;
  }
  return out;
}
