/**
 * Right now's "Save it online" for a followed route while Save online is OFF in Setup (Jordan, 7 Nov 2026, via the
 * orchestrator: off DISABLES the action with a note, it does not turn the switch on). The store says so
 * (stores/follow.ts `offByChoice`, saveOnline.off.spec.ts); here the note (Words: lib/syncWords.ts
 * SAVE_ONLINE_FOLLOW_OFF) and the disabled button, and the wiring through useNowPage and MyRunsView.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAVE_ONLINE_FOLLOW_OFF } from '@/lib/syncWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('Save online off: the route action is disabled with a note', () => {
  it("the card: Words' note and the Save it online button, disabled (never calls the store)", () => {
    const card = read('./RightNowCard.vue');
    const block = card.slice(card.indexOf('data-testid="now-follow-save-off"') - 200, card.indexOf('data-testid="now-follow-save-off"') + 900);
    expect(block).toContain('v-if="follow && followSaveOff"');
    expect(block).toContain('{{ SAVE_ONLINE_FOLLOW_OFF }}');
    expect(block).toMatch(/<button[^>]*\bdisabled\b[^>]*data-testid="now-follow-save-off-button"/);
    expect(block).not.toContain("emit('saveOnline')");
    expect(card).toMatch(/import \{[^}]*SAVE_ONLINE_FOLLOW_OFF[^}]*\} from '@\/lib\/syncWords'/);
    expect(card).toContain('followSaveOff?: boolean;');
    expect(SAVE_ONLINE_FOLLOW_OFF).toMatch(/^Save online is off in Setup/);
  });
  it('the page and the view pass it on from the store', () => {
    const page = read('../../composables/useNowPage.ts');
    expect(page).toMatch(/const followSaveOff = computed\(\(\) => !!followState\.value && follows\.offByChoice\)/);
    expect(read('../MyRunsView.vue')).toContain(':follow-save-off="page.followSaveOff.value"');
  });
});
