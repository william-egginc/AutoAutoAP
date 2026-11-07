/**
 * MIN_BUILD_STAMP: refuse writes from a page built before a cutoff (6 Nov 2026). The var is an ISO time, the build
 * stamp of the oldest build still welcome (e.g. Release 5's live build, 2026-10-23T00:13:48Z); unset or unreadable = off.
 *
 * A build stamp is the page's `__BUILD_TIME__` (an ISO time), sent as `build` in /submit, /instant and /follow bodies.
 * It is the sender's word: this turns away an honest old tab, it does not stop a forger. A stamp that is not an ISO
 * time (a build named by its commit) cannot be ordered and is not judged; a missing or empty one counts as old where
 * `required` (schema 6 and below never sent one: an old page) and passes where it is optional: /submit at schema 7 and up (the Insights upload page leaves build out on purpose, its files were priced by another build), /instant and /follow. R5 and later current pages always send an ISO stamp from /submit with a run priced in the tab.
 */
export const OLD_BUILD_MESSAGE = 'This page is an old version: reload to send.';
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** True when the write must be refused. */
export function oldBuild(env, stamp, required) {
  const min = Date.parse(String(env?.MIN_BUILD_STAMP ?? ''));
  if (!Number.isFinite(min)) return false;
  if (typeof stamp !== 'string' || stamp === '') return !!required;
  if (!ISO_TIME.test(stamp)) return false;
  const t = Date.parse(stamp);
  return Number.isFinite(t) && t < min;
}

/** The 426 body, the same for every endpoint (an old client shows `problems` as it is). */
export const OLD_BUILD_BODY = { error: 'old build', problems: [OLD_BUILD_MESSAGE], reload: true };
