/**
 * A guard for Joo's Auto Planner artifact/stone inputs (`AutoLoadoutInputs`, src/auto/loadout/types.ts) read
 * from outside this page: the `auto_planner_loadout_inputs_v1:<id>` cache (lib/autoPlannerFormCache.ts) and
 * an Auto-Plan file restored from the Plan Library (stores/autoPlanner.ts `setPlan`).
 *
 * Prelive fix, 21 Oct 2026 (Jordan OK'd a minimal fix in Joo's area): a stored `{}` or a file with
 * `"loadoutInputs": {}` reached VirtueProgressSection.vue unchecked, and its `earnings.slice`/`.map` threw, so
 * Virtue Progress and Artifacts & Stones vanished from Single run. Here every part the UI and C1/C3/H1 read is
 * checked: a valid part is kept, a broken one is taken from `base` (the inventory default, or what the form
 * already holds). It lives in lib/, not src/auto/, so the simulator's source hash does not move.
 */
import { getArtifact, getStone, type EquippedArtifact } from '@/lib/artifacts';
import {
  STONE_FAMILIES,
  STONE_TIERS,
  type AutoLoadoutInputs,
  type DeliveryCandidate,
  type DeliveryInputs,
  type StonePool,
} from '@/auto/loadout/types';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A known artifact or stone id, else null (an unknown id would show as an empty slot anyway). */
const artifactIdOf = (v: unknown): string | null => (typeof v === 'string' && getArtifact(v) ? v : null);
const stoneIdOf = (v: unknown): string | null => (typeof v === 'string' && getStone(v) ? v : null);

/** Four slots, each `{ artifactId, stones[] }`; anything else is not an earnings set. */
function earningsOf(v: unknown): EquippedArtifact[] | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const out: EquippedArtifact[] = [];
  for (const s of v) {
    if (!isObj(s) || !Array.isArray(s.stones)) return null;
    if (s.artifactId !== null && typeof s.artifactId !== 'string') return null;
    out.push({ artifactId: artifactIdOf(s.artifactId), stones: s.stones.slice(0, 3).map(stoneIdOf) });
  }
  return out;
}

function deliveryOf(v: unknown): DeliveryInputs | null {
  if (!isObj(v)) return null;
  if (v.mode === 'fixed') {
    if (!Array.isArray(v.artifactIds) || v.artifactIds.length > 4) return null;
    return { mode: 'fixed', artifactIds: v.artifactIds.map(artifactIdOf) };
  }
  if (v.mode === 'auto') {
    if (!Array.isArray(v.candidates)) return null;
    const candidates: DeliveryCandidate[] = [];
    for (const c of v.candidates) {
      if (!isObj(c) || !artifactIdOf(c.artifactId)) continue; // one bad candidate is dropped, not the list
      const slots = Number(c.slots);
      candidates.push({
        artifactId: c.artifactId as string,
        slots: Number.isFinite(slots) ? Math.max(0, Math.min(3, Math.floor(slots))) : 0,
        isTarget: c.isTarget === true,
      });
    }
    return { mode: 'auto', candidates };
  }
  return null;
}

/** Every family and tier a whole count (0 up); a missing or broken count is taken from `base`. */
function stonesOf(v: unknown, base: StonePool | null): StonePool | null {
  if (!isObj(v) && !base) return null;
  const src = isObj(v) ? v : {};
  const out = {} as StonePool;
  for (const f of STONE_FAMILIES) {
    const fam = isObj(src[f]) ? (src[f] as Record<string, unknown>) : {};
    out[f] = { 2: 0, 3: 0, 4: 0 };
    for (const t of STONE_TIERS) {
      const n = fam[t];
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[f][t] = Math.floor(n);
      else if (base) out[f][t] = base[f][t];
      else return null;
    }
  }
  return out;
}

/**
 * `raw` made safe: the valid parts of it over `base`. Null when `raw` is not an object at all, or when a part is
 * broken and there is no `base` to take it from (the caller then keeps what it has, or seeds from the
 * inventory).
 */
export function sanitizeLoadoutInputs(raw: unknown, base: AutoLoadoutInputs | null): AutoLoadoutInputs | null {
  if (!isObj(raw)) return null;
  const earnings = earningsOf(raw.earnings) ?? (base ? clone(base.earnings) : null);
  const delivery = deliveryOf(raw.delivery) ?? (base ? clone(base.delivery) : null);
  const stones = stonesOf(raw.stones, base?.stones ?? null);
  if (!earnings || !delivery || !stones) return null;
  return { earnings, delivery, stones };
}

/** True when `raw` passes as it is (nothing had to be taken from a default). */
export function isValidLoadoutInputs(raw: unknown): raw is AutoLoadoutInputs {
  return isObj(raw) && !!earningsOf(raw.earnings) && !!deliveryOf(raw.delivery) && !!stonesOf(raw.stones, null);
}

/** A file's per-ascension overrides: numeric keys only, each made safe over `base`; broken ones dropped. */
export function sanitizeLoadoutOverrides(
  raw: unknown,
  base: AutoLoadoutInputs | null
): Record<number, AutoLoadoutInputs> {
  const out: Record<number, AutoLoadoutInputs> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d+$/.test(k)) continue;
    const s = sanitizeLoadoutInputs(v, base);
    if (s) out[Number(k)] = s;
  }
  return out;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
