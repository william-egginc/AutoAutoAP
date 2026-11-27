/**
 * One strict check for every file a player can upload (owner's item 13, 22 Oct 2026): Manual plan files,
 * Plan Library files (single plans, library exports, Auto-Plan exports), save files, and the Explorer's
 * chain CSV (plain or gzip) and diagnostics JSON. CSVs are read by the one CSV reader, lib/csvParse.ts.
 *
 * Every upload goes through, in order:
 * 1. a size cap, from `File.size`, before a byte is read;
 * 2. gzip, when the bytes are gzip, inflated as a stream with a cap on what comes out (a gzip bomb stops
 *    at the cap instead of filling memory);
 * 3. strict UTF-8 text (a binary file is refused, not read as mojibake);
 * 4. JSON with `__proto__`, `constructor` and `prototype` keys refused anywhere in it, and every
 *    value checked: numbers finite (`1e999` reads as Infinity), strings and lists of bounded length,
 *    nesting of bounded depth;
 * 5. the expected fields and their types and ranges for what the file says it is (TE 0-490, known
 *    action types, and so on), and a cap on rows and actions.
 * Any failure throws an `UploadError` with a plain message, before anything is applied, so an upload is
 * all or nothing.
 */
import { isActionTypeName as isKnownActionType } from '@/lib/actions/actionTypes';
import { UploadError } from './uploadError';
import { unpackExportedPlan } from '@/lib/planExportPack';

export { UploadError };

const MB = 1024 * 1024;

/** What each kind of upload may be. Old Auto-Plan exports (before packing) ran to 65 MB for 2 ascensions. */
export const UPLOAD_LIMITS = {
  /** A Manual plan file (summary bar Import). */
  plan: { bytes: 32 * MB, inflated: 64 * MB },
  /** Anything the Plan Library imports: a plan, a library export, an Auto-Plan export. */
  library: { bytes: 160 * MB, inflated: 256 * MB },
  /** An Egg, Inc. save as JSON. */
  save: { bytes: 32 * MB, inflated: 64 * MB },
  /** The Explorer's chain CSV, plain or .gz. */
  csv: { bytes: 256 * MB, inflated: 384 * MB },
  /** The Explorer's diagnostics JSON. */
  diagnostics: { bytes: 16 * MB, inflated: 32 * MB },
} as const;
export type UploadKind = keyof typeof UPLOAD_LIMITS;

const mb = (n: number) => `${Math.round(n / MB)} MB`;

/** Refuses a file over the kind's size before it is read. */
export function checkFileSize(size: number, kind: UploadKind, name = 'This file'): void {
  const cap = UPLOAD_LIMITS[kind].bytes;
  if (!(size >= 0) || size > cap) throw new UploadError(`${name} is ${mb(size)}, more than the ${mb(cap)} this upload takes.`);
  if (size === 0) throw new UploadError(`${name} is empty.`);
}

export const isGzip = (b: Uint8Array): boolean => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;

/** Gzip bytes inflated as a stream, stopping with an UploadError once more than `cap` bytes come out. */
export async function inflateCapped(bytes: Uint8Array, cap: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined')
    throw new UploadError('This browser cannot unpack .gz files. Unpack it first, or use Chrome, Edge, Firefox or Safari 16.4+.');
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        void reader.cancel().catch(() => {});
        throw new UploadError(`This .gz file unpacks to more than ${mb(cap)}, more than this upload takes.`);
      }
      parts.push(value);
    }
  } catch (e) {
    if (e instanceof UploadError) throw e;
    throw new UploadError('This .gz file is damaged: it ends before the data does. Download it again.');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** Strict UTF-8: a binary file is refused. A byte-order mark is dropped. */
export function decodeText(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    throw new UploadError("This file isn't text, so it isn't a file the planner wrote.");
  }
}

/** A File (or anything with size and arrayBuffer) as text: size cap, gzip with its cap, strict UTF-8. */
export async function readUploadText(
  file: { size: number; name?: string; arrayBuffer(): Promise<ArrayBuffer> },
  kind: UploadKind
): Promise<string> {
  checkFileSize(file.size, kind, file.name ? `"${file.name.slice(0, 80)}"` : 'This file');
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  if (isGzip(bytes)) bytes = await inflateCapped(bytes, UPLOAD_LIMITS[kind].inflated);
  else if (bytes.byteLength > UPLOAD_LIMITS[kind].inflated) checkFileSize(bytes.byteLength, kind);
  return decodeText(bytes);
}

// ------------------------------------------------------------------------------------------ JSON

const BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface JsonLimits {
  /** Nesting depth. */
  maxDepth: number;
  /** Characters in one string. */
  maxString: number;
  /** Items in one list. */
  maxArray: number;
  /** Keys in one object. */
  maxKeys: number;
}
export const DEFAULT_JSON_LIMITS: JsonLimits = { maxDepth: 24, maxString: 20_000, maxArray: 100_000, maxKeys: 5_000 };

/**
 * JSON with the dangerous keys refused anywhere in it, then every value checked against `limits`.
 * `revive` (the kept-save format's Infinity, for one) runs after the key check, and the values it makes
 * may be non-finite.
 */
export function parseJsonStrict(
  text: string,
  what: string,
  limits: Partial<JsonLimits> = {},
  revive?: (key: string, value: unknown) => unknown
): unknown {
  // JSON.parse makes a "__proto__" key an ordinary own field (no pollution while parsing); the walk below
  // finds and refuses it before anything spreads or assigns the value. Without `revive` no reviver is
  // passed: a reviver triples the time JSON.parse takes on a 65 MB Auto-Plan file.
  let value: unknown;
  try {
    value = revive
      ? JSON.parse(text, function (key, v) {
          if (BANNED_KEYS.has(key)) throw new UploadError(`${what} has a field named "${key}", which no planner file has.`);
          return revive.call(this, key, v);
        })
      : JSON.parse(text);
  } catch (e) {
    if (e instanceof UploadError) throw e;
    throw new UploadError(`${what} isn't JSON; it may have been cut off while saving.`);
  }
  checkJsonValues(value, what, { ...DEFAULT_JSON_LIMITS, ...limits }, !!revive);
  return value;
}

/** Every value in `v`: numbers finite (non-finite ones allowed only where `revive` made them), sizes bounded. */
export function checkJsonValues(v: unknown, what: string, lim: JsonLimits, allowNonFinite = false): void {
  const stack: [unknown, number][] = [[v, 0]];
  while (stack.length) {
    const [x, depth] = stack.pop()!;
    if (depth > lim.maxDepth) throw new UploadError(`${what} is nested deeper than any planner file.`);
    if (typeof x === 'number') {
      if (!Number.isFinite(x) && !allowNonFinite) throw new UploadError(`${what} holds a number too large to be real (${x}).`);
    } else if (typeof x === 'string') {
      if (x.length > lim.maxString)
        throw new UploadError(`${what} has a text field longer than ${lim.maxString.toLocaleString('en-US')} characters.`);
    } else if (Array.isArray(x)) {
      if (x.length > lim.maxArray) throw new UploadError(`${what} has a list longer than ${lim.maxArray.toLocaleString('en-US')} items.`);
      for (const y of x) stack.push([y, depth + 1]);
    } else if (x && typeof x === 'object') {
      const keys = Object.keys(x);
      if (keys.length > lim.maxKeys) throw new UploadError(`${what} has an object with more than ${lim.maxKeys} fields.`);
      for (const k of keys) {
        if (BANNED_KEYS.has(k)) throw new UploadError(`${what} has a field named "${k}", which no planner file has.`);
        stack.push([(x as Record<string, unknown>)[k], depth + 1]);
      }
    }
  }
}

// ------------------------------------------------------------------------------------ field checks

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function need(ok: boolean, msg: string): void {
  if (!ok) throw new UploadError(msg);
}
/** A number in [lo, hi] (null or missing allowed when `optional`). */
function num(v: unknown, lo: number, hi: number, msg: string, optional = true): void {
  if (optional && (v === undefined || v === null)) return;
  need(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi, msg);
}
function str(v: unknown, max: number, msg: string, optional = true): void {
  if (optional && (v === undefined || v === null)) return;
  need(typeof v === 'string' && v.length <= max, msg);
}
function list(v: unknown, max: number, msg: string, optional = true): v is unknown[] {
  if (optional && (v === undefined || v === null)) return false;
  need(Array.isArray(v) && v.length <= max, msg);
  return true;
}
const perEgg = (v: unknown, hi: number, msg: string) => {
  if (v === undefined || v === null) return;
  need(isObj(v), msg);
  for (const n of Object.values(v as Obj)) num(n, 0, hi, msg);
};

/** Actions in one plan or variant, at most. A real ascension has about 3,300. */
export const MAX_ACTIONS = 20_000;
const MAX_TE_TOTAL = 490;

function checkActions(actions: unknown, where: string): void {
  need(Array.isArray(actions), `${where} has no list of steps.`);
  const a = actions as unknown[];
  need(a.length <= MAX_ACTIONS, `${where} has ${a.length.toLocaleString('en-US')} steps, more than any plan (${MAX_ACTIONS.toLocaleString('en-US')}).`);
  for (let i = 0; i < a.length; i++) {
    const s = a[i];
    need(isObj(s), `${where}: step ${i + 1} is damaged.`);
    const step = s as Obj;
    need(isKnownActionType(step.type), `${where}: step ${i + 1} is a kind this planner doesn't know (${String(step.type).slice(0, 40)}).`);
    need(step.payload === undefined || isObj(step.payload), `${where}: step ${i + 1} (${String(step.type)}) is damaged.`);
    str(step.id, 100, `${where}: step ${i + 1} has a damaged id.`);
    for (const f of ['cost', 'totalTimeSeconds', 'timestamp', 'index'])
      num(step[f], -1e300, 1e300, `${where}: step ${i + 1} has a damaged ${f}.`);
    if (step.type === 'wait_for_te' && isObj(step.payload)) {
      const p = step.payload as Obj;
      num(p.targetTE, 0, 98, `${where}: step ${i + 1} waits for TE ${String(p.targetTE)}, above the 98 an egg can have.`);
    }
  }
}

/** The fields of a Manual plan file (`exportPlanData`) that are read. */
export function checkPlanData(d: unknown, where = 'This plan file'): void {
  need(isObj(d), `${where} isn't a plan.`);
  const p = d as Obj;
  need(!!p.version && Array.isArray(p.actions) && isObj(p.initialState), `${where} isn't a plan file (no version, steps or initial state).`);
  checkActions(p.actions, where);
  const s = p.initialState as Obj;
  num(s.soulEggs, 0, 1e300, `${where} has a damaged soul egg count.`);
  str(s.nickname, 200, `${where} has a damaged name.`);
  perEgg(s.initialTeEarned, 98, `${where} has TE above 98 on an egg.`);
  perEgg(s.initialEggsDelivered, 1e300, `${where} has damaged eggs-delivered numbers.`);
  if (isObj(p.truthEggsState)) {
    perEgg((p.truthEggsState as Obj).teEarned, 98, `${where} has TE above 98 on an egg.`);
    perEgg((p.truthEggsState as Obj).eggsDelivered, 1e300, `${where} has damaged eggs-delivered numbers.`);
  }
  if (isObj(p.virtueState)) {
    num((p.virtueState as Obj).initialTE, 0, MAX_TE_TOTAL, `${where} starts above 490 TE.`);
    num((p.virtueState as Obj).shiftCount, 0, 1e6, `${where} has a damaged shift count.`);
  }
  if (isObj(p.notesState) && list((p.notesState as Obj).notes, 1000, `${where} has more than 1,000 notes.`)) {
    for (const n of (p.notesState as Obj).notes as unknown[])
      need(isObj(n) && (typeof (n as Obj).text === 'string' ? ((n as Obj).text as string).length <= 10_000 : true), `${where} has a note longer than 10,000 characters.`);
  }
}

const VARIANT_KEYS = /^(continue|[123]-sale(-tier13)?)$/;

function checkVariant(v: unknown, where: string): void {
  need(isObj(v), `${where} is damaged.`);
  const r = v as Obj;
  need(isObj(r.summary), `${where} has no summary.`);
  const s = r.summary as Obj;
  num(s.startTE, 0, MAX_TE_TOTAL, `${where} starts outside 0-490 TE.`);
  num(s.endTE, 0, MAX_TE_TOTAL, `${where} ends outside 0-490 TE.`);
  num(s.startTime, 0, 1e11, `${where} has a damaged start time.`);
  num(s.endTime, 0, 1e11, `${where} has a damaged end time.`);
  checkActions(r.actions, where);
}

/** An Auto-Plan export (`ExportedPlan`, version 1 or 2). */
export function checkAutoPlan(d: unknown, where = 'This Auto-Plan file'): void {
  need(isObj(d), `${where} isn't an Auto-Plan.`);
  const p = d as Obj;
  need(p.version === 1 || p.version === 2, `${where} is from a planner version this one doesn't read.`);
  num(p.startTime, 0, 1e11, `${where} has a damaged start time.`, false);
  str(p.timezone, 64, `${where} has a damaged time zone.`, false);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: p.timezone as string });
  } catch {
    throw new UploadError(`${where} has a time zone this browser doesn't know (${String(p.timezone).slice(0, 40)}).`);
  }
  need(isObj(p.initialState), `${where} has no starting state.`);
  perEgg((p.initialState as Obj).initialTeEarned, 98, `${where} has TE above 98 on an egg.`);
  need(Array.isArray(p.ascensions) && (p.ascensions as unknown[]).length >= 1, `${where} has no ascensions.`);
  need((p.ascensions as unknown[]).length <= 100, `${where} has more than 100 ascensions.`);
  (p.ascensions as unknown[]).forEach((a, i) => {
    const at = `${where}, ascension ${i + 1},`;
    need(isObj(a), `${at} is damaged.`);
    const asc = a as Obj;
    num(asc.targetTE, 0, MAX_TE_TOTAL, `${at} aims outside 0-490 TE.`);
    need(isObj(asc.goal), `${at} has no goal.`);
    const g = asc.goal as Obj;
    need(g.type === 'te' || g.type === 'date', `${at} has a damaged goal.`);
    num(g.te, 0, MAX_TE_TOTAL, `${at} aims outside 0-490 TE.`);
    str(g.date, 10, `${at} has a damaged goal date.`);
    str(g.time, 8, `${at} has a damaged goal time.`);
    if (p.version === 1) {
      for (const k of ['result1', 'result2', 'result3']) if (asc[k] !== undefined || k !== 'result3') checkVariant(asc[k], `${at} ${k}`);
    } else {
      need(isObj(asc.variants) && Object.keys(asc.variants as Obj).length >= 1, `${at} has no results.`);
      for (const [k, v] of Object.entries(asc.variants as Obj)) {
        need(VARIANT_KEYS.test(k), `${at} has a result kind this planner doesn't know (${k.slice(0, 30)}).`);
        checkVariant(v, `${at} ${k}`);
      }
    }
  });
}

/** What the Plan Library's Import reads, by what the file says it is. */
export type LibraryFile =
  | { kind: 'library'; plans: { name: string; data: Obj }[] }
  | { kind: 'plan'; name: string | null; data: Obj }
  | { kind: 'auto'; plan: Obj }
  | { kind: 'raw'; data: Obj };

export function classifyLibraryFile(d: unknown): LibraryFile {
  need(isObj(d), "This file isn't a plan, a library or an Auto-Plan.");
  const f = d as Obj;
  if (f.type === 'library') {
    need(Array.isArray(f.plans), 'This library file has no plans in it.');
    const plans = f.plans as unknown[];
    need(plans.length <= 2_000, 'This library file has more than 2,000 plans.');
    const out = plans.map((p, i) => {
      need(isObj(p), `Plan ${i + 1} in this library file is damaged.`);
      str((p as Obj).name, 200, `Plan ${i + 1} in this library file has a name longer than 200 characters.`, false);
      checkPlanData((p as Obj).data, `Plan ${i + 1} ("${String((p as Obj).name).slice(0, 40)}")`);
      return { name: (p as Obj).name as string, data: (p as Obj).data as Obj };
    });
    return { kind: 'library', plans: out };
  }
  if (f.type === 'plan') {
    str(f.name, 200, "This plan's name is longer than 200 characters.");
    checkPlanData(f.data);
    return { kind: 'plan', name: (f.name as string) ?? null, data: f.data as Obj };
  }
  if (f.version && Array.isArray(f.ascensions) && f.initialState) {
    checkAutoPlan(f);
    return { kind: 'auto', plan: f };
  }
  if (f.version && f.actions && f.initialState) {
    checkPlanData(f);
    return { kind: 'raw', data: f };
  }
  throw new UploadError("This file isn't a plan, a library or an Auto-Plan the planner wrote.");
}

/** An Egg, Inc. save as JSON: a game object and a list of farms, within sane sizes. */
export function checkSave(d: unknown): void {
  need(isObj(d) && isObj((d as Obj).game) && Array.isArray((d as Obj).farms), "This file isn't an Egg, Inc. save (it has no game or farms).");
  const b = d as Obj;
  need((b.farms as unknown[]).length <= 64, 'This save has more farms than the game allows.');
  num(b.approxTime, 0, 1e11, 'This save has a damaged save time.');
  if (isObj(b.virtue)) {
    const v = b.virtue as Obj;
    if (list(v.eovEarned, 5, 'This save has damaged truth egg numbers.'))
      for (const n of v.eovEarned as unknown[]) num(n, 0, 98, 'This save has TE above 98 on an egg.');
  }
}

/** The Explorer's diagnostics JSON: the fields `checkUpload` compares, in range. */
export function checkDiagnostics(d: unknown): void {
  need(isObj(d), "That JSON isn't a search diagnostics file.");
  const g = d as Obj;
  if (isObj(g.te)) {
    num((g.te as Obj).searchStartsFrom, 0, MAX_TE_TOTAL, 'The diagnostics start outside 0-490 TE.');
    num((g.te as Obj).target, 0, MAX_TE_TOTAL, 'The diagnostics aim outside 0-490 TE.');
  }
  if (isObj(g.schedule)) num((g.schedule as Obj).planStart, 0, 1e11, 'The diagnostics have a damaged plan start.');
  if (isObj(g.result)) {
    const r = g.result as Obj;
    need(Array.isArray(r.chain) && (r.chain as unknown[]).length <= 40, "The diagnostics' result route is damaged.");
    for (const t of r.chain as unknown[]) num(t, 0, MAX_TE_TOTAL, "The diagnostics' result route has a stop outside 0-490 TE.", false);
    num(r.days, 0, 100_000, "The diagnostics' result has a damaged duration.", false);
  }
}

/**
 * A Plan Library file read and checked whole: strict JSON, a packed Auto-Plan export rebuilt, and the
 * plan, library or Auto-Plan in it checked (`classifyLibraryFile`). Returns the file's object.
 */
export function readLibraryFile(text: string): Obj {
  const value = parseJsonStrict(text, 'This file');
  let plan: unknown;
  try {
    plan = unpackExportedPlan(value as object);
  } catch (e) {
    throw new UploadError(e instanceof Error ? e.message : 'This Auto-Plan file is damaged.');
  }
  classifyLibraryFile(plan);
  return plan as Obj;
}
