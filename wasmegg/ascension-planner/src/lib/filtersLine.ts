/**
 * The Filters fold's one-line summary (R11, 21 Nov 2026): what is set inside the closed fold, so folding hides nothing. PLACEHOLDER
 * words for Words. Parts in a fixed order, joined with " · ": awake hours, the ascensions range, Prefer fewer.
 */
import type { AscBounds } from '@/search/instantFilters';
import type { PreferMargin } from '@/search/preferFewer';

export const NO_FILTERS = 'No filters set';

const plural = (n: number): string => `${n} ${n === 1 ? 'ascension' : 'ascensions'}`;

function boundsPart(b: AscBounds): string {
  if (b.min !== null && b.max !== null) return b.min === b.max ? `exactly ${plural(b.min)}` : `${b.min} to ${plural(b.max)}`;
  if (b.min !== null) return `at least ${plural(b.min)}`;
  if (b.max !== null) return `at most ${plural(b.max)}`;
  return '';
}

function preferPart(m: PreferMargin): string {
  if (m.kind === 'te') return `Prefer fewer: ${m.te === 0 ? 'same TE' : `within ${m.te} TE`}`;
  if (m.kind === 'time') {
    const h = m.seconds / 3600;
    if (h >= 24 && Number.isInteger(h / 24)) return `Prefer fewer: within ${h / 24} ${h / 24 === 1 ? 'day' : 'days'}`;
    return `Prefer fewer: within ${Number.isInteger(h) ? h : Math.round(h * 10) / 10} h`;
  }
  return '';
}

/** `inHours`: null when awake hours are not set (nothing to say), else whether "Works inside my awake hours" is on. */
export function filtersLine(f: { inHours: boolean | null; bounds: AscBounds; prefer: PreferMargin }): string {
  const parts = [f.inHours ? 'Inside awake hours' : '', boundsPart(f.bounds), preferPart(f.prefer)].filter(Boolean);
  return parts.length ? parts.join(' · ') : NO_FILTERS;
}
