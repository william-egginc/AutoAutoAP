/**
 * spec-savescrub (29 Oct 2026), the page: a save file can be loaded with no account (under the player ID box), the
 * Auto Planner then shows its instant answer with one line saying what is off, and the stand-in ID a downloaded save
 * carries (EI0000000000000000) never becomes the account on screen: not from the box, a link or the saved ID.
 * The store side is chainSearch.saveScrub.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPlaceholderId } from '@/lib/saveScrub';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const template = app.slice(0, app.indexOf('<script setup'));
const bodyOf = (head: string) => {
  const start = app.indexOf(head);
  expect(start, head).toBeGreaterThan(-1);
  return app.slice(start, app.indexOf('\n}\n', start));
};

describe('a save file with no account on screen', () => {
  it('is offered under the player ID box while no account is entered, and opens Fastest when it loads', () => {
    expect(template).toContain('<div v-if="!playerId" class="mx-4 mt-3 flex justify-center" data-testid="no-account-save-file">');
    expect(template).toContain('<SaveFileBar player-id="" @loaded="onNoAccountSave" />');
    expect(template.indexOf('data-testid="no-account-save-file"')).toBeGreaterThan(template.indexOf('<the-player-id-form'));
    expect(bodyOf('function onNoAccountSave(): void {')).toContain("goAuto('fastest', 'smart')");
    expect(app).toContain('const fileOnlySave = computed(() => !playerId.value && !!uiStore.runSaveLoaded?.noAccount);');
  });

  it('shows the Auto Planner with the one line over it', () => {
    const auto = template.indexOf(`<div v-if="plannerTab === 'automatic' && (playerId || fileOnlySave) && !loading" class="mt-4 space-y-4">`);
    expect(auto).toBeGreaterThan(-1);
    const line = template.indexOf('{{ NO_ACCOUNT_LINE }}');
    expect(line).toBeGreaterThan(auto);
    expect(line).toBeLessThan(template.indexOf('<FastestRoute', auto));
    expect(template.slice(auto, line)).toContain('v-if="fileOnlySave"');
  });

  it('gives way to an account entered afterwards', () => {
    const submit = bodyOf('async function submitPlayerId(id: string) {');
    expect(submit).toContain('if (uiStore.runSaveLoaded?.noAccount) uiStore.runSaveLoaded = null;');
  });
});

describe('the stand-in ID is no account', () => {
  it('is recognised in any case and with spaces, and nothing else is', () => {
    expect(isPlaceholderId('EI0000000000000000')).toBe(true);
    expect(isPlaceholderId(' ei0000000000000000 ')).toBe(true);
    expect(isPlaceholderId('EI0000000000000001')).toBe(false);
    expect(isPlaceholderId('')).toBe(false);
  });

  it('typed in the box: refused before any fetch, so it is never saved or shown', () => {
    const submit = bodyOf('async function submitPlayerId(id: string) {');
    const refuse = submit.indexOf('if (isPlaceholderId(id)) {');
    expect(refuse).toBeGreaterThan(-1);
    expect(refuse).toBeLessThan(submit.indexOf('requestSave(id)'));
    expect(refuse).toBeLessThan(submit.indexOf('savePlayerID(id)'));
  });

  it('from a link or the saved ID: not taken as the account on screen', () => {
    expect(app).toContain(
      "const playerId = ref(linkPlayerId() || getSavedPlayerID() || '');\n// Never the stand-in ID a downloaded save carries (lib/saveScrub.ts): that is no account.\nif (isPlaceholderId(playerId.value)) playerId.value = [getSavedPlayerID()].find(id => id && !isPlaceholderId(id)) || '';"
    );
  });
});
