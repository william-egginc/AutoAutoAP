/**
 * A PLANNED UPDATE (Jordan, 7 Nov 2026). Before forcing open pages to reload (release.ts `reloadIfBuiltBefore`, or the
 * egg-beta timed reload), the owner can announce it: version.json carries `reloadPlanned: { at, note? }` (build env
 * AAP_RELOAD_PLANNED_AT and AAP_RELOAD_PLANNED_NOTE, lib/versionJson.ts). A page whose long search (2 hours or more,
 * lib/runBeacon.ts `longRun`) is still running then asks its player to message the maintainer, so the update waits
 * (components/auto/ReloadPlannedBanner.vue). Read by the update check that already runs (composables/useNewVersion.ts
 * `liveVersionJson`): no poller of its own.
 *
 * SAFE WITH ANYTHING. Whatever the file holds, a notice is used only when `at` is an ISO time string that reads, is
 * still ahead, and is at most RELOAD_PLANNED_MAX_AHEAD_MS away (a stale or mistyped one is ignored); `note` only when
 * it is a string, trimmed, with control characters made spaces and cut to RELOAD_PLANNED_NOTE_MAX. It is shown as text,
 * never as HTML.
 */
import { ref } from 'vue';
import { eventWhen } from './eventWhen';

/** A notice further ahead than this is taken for a mistake and ignored. */
export const RELOAD_PLANNED_MAX_AHEAD_MS = 7 * 24 * 3600_000;
/** The owner's note, at most this many characters (the build refuses longer: lib/versionJson.ts). */
export const RELOAD_PLANNED_NOTE_MAX = 200;

export interface ReloadPlanned {
  /** As written in version.json: the key a dismissal holds on to. */
  at: string;
  atMs: number;
  /** The owner's note, plain text; '' for none. */
  note: string;
}

/** Control characters (and the bidi overrides) become spaces; runs of spaces collapse. */
export function plainNote(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .slice(0, RELOAD_PLANNED_NOTE_MAX * 4)
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, RELOAD_PLANNED_NOTE_MAX)
    .trim();
}

/** The notice in a version.json body, or null when there is none, it is malformed, past, or too far ahead. */
export function parseReloadPlanned(versionJson: unknown, nowMs: number): ReloadPlanned | null {
  try {
    if (!versionJson || typeof versionJson !== 'object' || Array.isArray(versionJson)) return null;
    const r = (versionJson as { reloadPlanned?: unknown }).reloadPlanned;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const { at, note } = r as { at?: unknown; note?: unknown };
    if (typeof at !== 'string' || at.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) return null;
    const atMs = Date.parse(at);
    if (!Number.isFinite(atMs) || atMs <= nowMs || atMs - nowMs > RELOAD_PLANNED_MAX_AHEAD_MS) return null;
    return { at, atMs, note: plainNote(note) };
  } catch {
    return null;
  }
}

/** The banner's notice: one planned, a long search going, and not closed for that planned time. */
export function reloadBannerFor<R>(
  planned: ReloadPlanned | null,
  longRun: R | null,
  dismissedAt: string | null
): ReloadPlanned | null {
  if (!planned || !longRun) return null;
  return dismissedAt === planned.at ? null : planned;
}

/** The planned time for the words: "3:00 PM" today, else "tomorrow at 1:05 AM" or "Nov 9 at 1:05 AM", in the
 *  player's zone and clock (lib/eventWhen, lib/clock.ts). '' when it cannot be read. */
export function plannedAtWords(atMs: number, nowMs: number, zone: string): string {
  const w = eventWhen(atMs / 1000, nowMs / 1000, zone);
  if (!w || !w.clock) return '';
  return w.day === 'today' ? w.clock : `${w.day} at ${w.clock}`;
}

// The Close button's memory: per planned time, for this page (a new `at` shows the banner again).
const dismissed = ref<string | null>(null);
/** The planned time whose banner was closed, or null. */
export function reloadPlannedDismissed(): string | null {
  return dismissed.value;
}
/** Close the banner for the notice planned at `at`. */
export function dismissReloadPlanned(at: string): void {
  dismissed.value = at;
}
/** For specs. */
export function resetReloadPlannedDismissal(): void {
  dismissed.value = null;
}
