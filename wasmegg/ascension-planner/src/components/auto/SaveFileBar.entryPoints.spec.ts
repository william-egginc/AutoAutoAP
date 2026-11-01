/**
 * spec-r7redteam-a (1 Nov 2026), QA's R7 red team finding 2: every way a save file comes in goes through the one
 * loader that applies the stand-in rule before the account check (chainSearch `loadSaveFile`, lib/saveScrub.ts
 * `idFromScreen`). Source checks: there is no other save-file input, no drag and drop, and each "Load a save file"
 * passes the account on screen ('' under the player ID box, where there is none). The loading itself is specced in
 * stores/chainSearch.saveScrubR7.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../..');

function vueAndTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...vueAndTs(p));
    else if (/\.(vue|ts)$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = vueAndTs(SRC).map(f => ({ f: path.relative(SRC, f), text: fs.readFileSync(f, 'utf8') }));

describe('every "Load a save file" goes through loadSaveFile', () => {
  it('the only file inputs are SaveFileBar (saves) and the Manual Planner / Explorer imports (not saves)', () => {
    const withInput = files.filter(x => /type="file"/.test(x.text)).map(x => x.f).sort();
    expect(withInput).toEqual(
      ['components/PlanFinalSummary.vue', 'components/PlanLibrary.vue', 'components/auto/SaveFileBar.vue', 'explorer/SweepUpload.vue'].sort()
    );
    // Called from SaveFileBar only; defined in the store (the loader) and search/keptSaves.ts (the parser).
    const home = ['components/auto/SaveFileBar.vue', 'stores/chainSearch.ts', 'search/keptSaves.ts'];
    for (const x of files.filter(f => !home.includes(f.f))) {
      expect(x.text, x.f).not.toMatch(/parseSaveFile\(|loadSaveFile\(/);
    }
  });

  it('no drag and drop of files and no other file pickers', () => {
    for (const x of files) {
      expect(x.text, x.f).not.toMatch(/dataTransfer\.files|showOpenFilePicker|webkitdirectory/);
    }
  });

  it('SaveFileBar hands the file to the store with the account it was given', () => {
    const bar = files.find(x => x.f === 'components/auto/SaveFileBar.vue')!.text;
    expect(bar).toContain('store.loadSaveFile(props.playerId, text)');
  });

  it('each place it shows passes the account on screen, or none under the ID box', () => {
    const uses = files.flatMap(x => (x.text.match(/<SaveFileBar\b[^>]*>/g) ?? []).map(tag => ({ f: x.f, tag })));
    expect(uses.map(u => u.f).sort()).toEqual(
      ['App.vue', 'components/auto/SavedAnswers.vue', 'components/auto/SavedRuns.vue', 'components/auto/YourSetup.vue'].sort()
    );
    for (const u of uses) {
      if (u.f === 'App.vue') expect(u.tag).toContain('player-id=""');
      else expect(u.tag, u.f).toMatch(/:player-id="(playerId|initialState\.playerId)"/);
    }
  });
});
