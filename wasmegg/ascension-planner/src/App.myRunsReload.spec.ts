/**
 * spec-webkit-tracker (7 Nov 2026): the same account's save loaded again from the player ID box (Load Player Data, a
 * paste) while on My runs. That load is the account-switch kind (`submitPlayerId`: the pending Truth Eggs NOT rolled
 * up), and My runs sets the stores up the Auto Planner's way only "once per account per page visit" (`myRunsLoadFor`),
 * reset only when the ID CHANGES. The same ID does not change it, so a save with a TE not claimed yet (Jordan's: 197
 * claimed, 198 read from the save) kept the stores at 197 for good: useNowPage `storeReady` false, no instant answer
 * worked out ("No timeline for your route yet"), no simulation asked, and the Build-up tracker "working it out…".
 * A save loaded from the box counts as a new visit for My runs: it is set up again (once, as before).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

function body(head: string): string {
  const start = app.indexOf(head);
  expect(start, head).toBeGreaterThan(0);
  return app.slice(start, app.indexOf('\n}\n', start));
}

describe('My runs sets up again a save loaded from the player ID box', () => {
  it('submitPlayerId forgets that My runs set this account up, once the save is in', () => {
    const submit = body('async function submitPlayerId(id: string) {');
    const loaded = submit.indexOf('playerId.value = id;');
    const reset = submit.indexOf("myRunsLoadFor = '';");
    expect(loaded).toBeGreaterThan(0);
    // After the fetch succeeded (a failed one changes nothing), never before it.
    expect(reset).toBeGreaterThan(submit.indexOf('({ backup } = await requestSave(id));'));
    expect(reset).toBeGreaterThan(0);
  });

  it('My runs still sets an account up at most once per save (no loop when the set-up cannot match)', () => {
    const load = body('function loadSaveForMyRuns(): void {');
    expect(load).toContain('if (myRunsLoadFor === forSave');
    expect(load).toContain('myRunsLoadFor = forSave;');
  });

  // spec-overridestart (7 Nov 2026): Jordan's tracker stayed stuck after opening Fastest and coming back. Once per
  // account per VISIT left nothing to set a newer save up again, nor to retry a set-up that a running search or a
  // picked save had put off. Now: once per account and save time, and looked at again when either of those ends.
  it('keys the set-up on the account AND the save time', () => {
    const load = body('function loadSaveForMyRuns(): void {');
    expect(load).toMatch(
      /const forSave = `\$\{playerId\.value\}\|\$\{backupSecondsOf\(initialStateStore\.rawBackup\)\}`;/
    );
  });

  it('looks again when a running search ends or a picked save is cleared', () => {
    const w = app.split('\n').find(l => l.startsWith('watch(') && l.includes('loadSaveForMyRuns);'));
    expect(w).toContain('searchActive');
    expect(w).toContain('() => uiStore.runSaveLoaded');
  });
});
