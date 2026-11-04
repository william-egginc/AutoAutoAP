/**
 * A plain copy for a worker (not search/saveStart.ts `plainCopy`, which keeps a Long by reference) or a fresh-object read (spec-mainfreeze, 31 Oct 2026). The same copy as lib/artifacts/utils.ts
 * `sanitizeLongs` (arrays and plain objects rebuilt, protobuf Long-like {low, high, unsigned} read as numbers), but every
 * node is unwrapped with Vue's `toRaw` first, so a value read out of a Pinia store (the 2.8 MB save in
 * initialState.rawBackup, the context's research maps) is walked as the plain object under the proxy, never through the
 * proxy's get / ownKeys traps (each read of a reactive object goes through them and makes a proxy of every child: on the
 * real save, the gear stamp's two copies of the whole save took about a second of the main thread on a fast Mac).
 * The result never holds a reactive proxy, so `postMessage` and `structuredClone` of it are safe.
 */
import { toRaw } from 'vue';

type Obj = Record<string, unknown>;

function isLongLike(v: Obj, keys: string[]): boolean {
  return keys.length === 3 && typeof v.low === 'number' && typeof v.high === 'number' && typeof v.unsigned === 'boolean';
}

function longToNumber(v: { low: number; high: number; unsigned: boolean }): number {
  const TWO_PWR_32 = 4294967296;
  return v.unsigned ? (v.high >>> 0) * TWO_PWR_32 + (v.low >>> 0) : v.high * TWO_PWR_32 + (v.low >>> 0);
}

export function workerCopy<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  const v = toRaw(value) as unknown;
  if (Array.isArray(v)) return v.map(item => workerCopy(item)) as unknown as T;
  const o = v as Obj;
  const keys = Object.keys(o);
  if (isLongLike(o, keys)) return longToNumber(o as unknown as { low: number; high: number; unsigned: boolean }) as unknown as T;
  const out: Obj = {};
  for (const key of keys) out[key] = workerCopy(o[key]);
  return out as T;
}
