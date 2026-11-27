/**
 * The leg spill worker's messages (workers/legSpill.worker.ts; search/legSpill.ts). Every request carries an
 * id and gets one reply with it: `ok` and a result, or `error` (a message, and `quota` when the disk or the
 * origin's quota is full). Files live in OPFS under `aaap-legs/`.
 */
export type LegSpillRequest =
  | { id: number; op: 'open'; name: string }
  | { id: number; op: 'append'; name: string; bytes: Uint8Array }
  | { id: number; op: 'readMany'; name: string; spans: Float64Array }
  | { id: number; op: 'sync'; name: string }
  | { id: number; op: 'truncate'; name: string; size: number }
  | { id: number; op: 'close'; name: string; remove: boolean }
  /** Text appended to a plain file (a CSV being written for a download), created empty by `start`. */
  | { id: number; op: 'write'; name: string; text: string; start?: boolean }
  /** Close a `write` file so the page can read it. */
  | { id: number; op: 'done'; name: string };

export type LegSpillReply =
  | { id: number; ok: true; size?: number; parts?: Uint8Array[] }
  | { id: number; ok: false; error: string; quota?: boolean };

/** The OPFS folder the worker keeps its files in. */
export const LEG_SPILL_DIR = 'aaap-legs';
