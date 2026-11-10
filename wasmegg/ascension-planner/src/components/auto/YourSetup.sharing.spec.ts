/**
 * Setup's "Sharing and privacy" fold and "Show everything" (the simpler default page, Jordan 9 Nov 2026, Q3 and Q7).
 * Sharing and privacy: one real button over a region hidden until found, closed by default and remembered
 * (lib/panelFold.ts setupSharing), its line naming every setting that sends and its state, the consent and privacy
 * words inside unchanged. Show everything: a tick in More options › How the site shows things (nothing on the default
 * view), remembered in this browser, named in More options' line when on. Read from the source, plus the words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharingSummaryWords } from '@/lib/layoutWords';

const src = fs.readFileSync(path.resolve(__dirname, 'YourSetup.vue'), 'utf8');
const tpl = src.slice(src.indexOf('<template>'), src.indexOf('<script setup'));

describe('Sharing and privacy', () => {
  it('one fold over Help improve the planner, Sharing and Save online, after Time off and before More options', () => {
    const fold = tpl.indexOf('data-testid="setup-sharing"');
    const body = tpl.indexOf('id="setup-sharing-body"');
    expect(fold).toBeGreaterThan(0);
    expect(body).toBeGreaterThan(fold);
    for (const inside of ['<StudySetup', 'data-testid="share-instant"', '<SaveOnlineSetup']) {
      expect(tpl.indexOf(inside), inside).toBeGreaterThan(body);
      expect(tpl.indexOf(inside), inside).toBeLessThan(tpl.indexOf('data-testid="setup-more"'));
    }
    expect(tpl).toContain(`:hidden.attr="sharingOpen || !store.submitUrl ? undefined : 'until-found'"`);
    expect(tpl).toContain('aria-controls="setup-sharing-body"');
    expect(tpl).toContain(':aria-expanded="sharingOpen"');
  });
  it('closed by default, the player\'s toggle remembered', () => {
    expect(src).toContain("const sharingOpen = ref(foldOpen('setupSharing', { remembered: readFoldToggle('setupSharing') }));");
    expect(src).toContain("rememberFoldToggle('setupSharing', sharingOpen.value);");
  });
  it('its line names every setting that sends, and its state', () => {
    expect(tpl).toContain('{{ sharingLine }}');
    const line = src.slice(src.indexOf('const sharingLine'), src.indexOf('\n});', src.indexOf('const sharingLine')));
    for (const s of ['runBeaconOn', 'saveOnlineState', 'shareInstantOn', 'shareBaselineOn', 'studyState.rec']) expect(line, s).toContain(s);
    expect(sharingSummaryWords({ help: 'no', longSearches: true, saveOnline: true })).toBe(
      'Help improve: no thanks · Long searches: on · Save online: on'
    );
  });
});

describe('Show everything', () => {
  it('a tick inside More options (How the site shows things), named in its line when on', () => {
    const tick = tpl.indexOf('data-testid="setup-show-everything"');
    expect(tick).toBeGreaterThan(tpl.indexOf('id="setup-more-body"'));
    expect(tick).toBeGreaterThan(tpl.indexOf('How the site shows things'));
    expect(src).toContain('const { on: showEverything, set: setShowEverything } = useShowEverything();');
    expect(src).toContain("(showEverything.value ? ` · ${SHOW_EVERYTHING_LABEL}` : '')");
  });
});
