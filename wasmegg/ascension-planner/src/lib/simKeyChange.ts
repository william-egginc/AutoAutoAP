/**
 * Which part of My runs' simulation request changed (spec-stuck3, 7 Nov 2026), for the build-up breadcrumbs: useCurrentSim
 * starts a run only once its request has been unchanged for 3 s, so a key that keeps changing never starts one. The
 * line says which part moved, to find what churns. Never an ID: the account is named, not shown.
 */
import { SIM_SETUP_PARTS } from './simKeyParts';

export interface SimKeyParts {
  account: string;
  backupTime: number;
  route: readonly number[];
  setup: string;
}

function setupParts(setup: string): unknown[] | null {
  try {
    const v: unknown = JSON.parse(setup);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** "route 221,246 -> 246,280; setup: first ascension", or "nothing" when the two are the same request. */
export function simKeyChange(was: SimKeyParts, now: SimKeyParts): string {
  const out: string[] = [];
  if (was.account !== now.account) out.push('account');
  if (was.backupTime !== now.backupTime) out.push(`save time ${was.backupTime} -> ${now.backupTime}`);
  if (was.route.join(',') !== now.route.join(',')) out.push(`route ${was.route.join(',')} -> ${now.route.join(',')}`);
  if (was.setup !== now.setup) {
    const a = setupParts(was.setup);
    const b = setupParts(now.setup);
    const which =
      a && b
        ? SIM_SETUP_PARTS.filter((_, n) => JSON.stringify(a[n] ?? null) !== JSON.stringify(b[n] ?? null))
        : ['(unreadable)'];
    out.push(`setup: ${which.length ? which.join(', ') : 'the same parts in another form'}`);
  }
  return out.length ? out.join('; ') : 'nothing';
}
