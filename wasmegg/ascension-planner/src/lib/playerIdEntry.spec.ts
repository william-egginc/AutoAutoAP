/**
 * spec-r7redteam-a (1 Nov 2026), QA's R7 red team finding 4: the player ID box.
 *
 *   (a) After the stand-in (EI0000000000000000) was refused, the box stayed read-only with the stand-in in it until a
 *       reload: the shared form (ui/components/PlayerIdForm.vue) commits the ID before the page refuses it, and the
 *       still-focused box never gets the focus that unlocks it. App.vue now puts a fresh form back (its :key) and
 *       focuses it, so the box is editable with the refusal line, and a valid ID then loads.
 *   (b) A lower-case "ei…" left Load disabled with no message (the shared check is upper case only). The page now
 *       upper-cases the "EI" as it is typed or pasted, before the shared form sees it, and `submitPlayerId` does
 *       the same for any ID that reaches it.
 *
 * No DOM library here: the form's state machine (ui/composables/eid_input.ts) is driven directly, the box's input
 * and paste events are plain objects, and App.vue's wiring is checked in its source. Made-up IDs only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerIdSchema } from 'lib/schema';
import { useEidInput } from 'ui/composables/eid_input';
import { PLACEHOLDER_ID } from '@/lib/saveScrub';
import { idInputUpperCase, idPasteUpperCase, upperCaseIdPrefix } from './playerIdEntry';

const ID = 'EI1234567890123456';
const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');
const template = app.slice(0, app.indexOf('<script'));
const submitFn = app.slice(app.indexOf('async function submitPlayerId('), app.indexOf('loadingSaveFor = id;', app.indexOf('async function submitPlayerId(')));

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: k => m.get(k) ?? null,
    key: i => [...m.keys()][i] ?? null,
    removeItem: k => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

/** The box as the shared form drives it: focus, type, press Load (which commits before the page answers). */
function typeAndLoad(box: ReturnType<typeof useEidInput>, text: string): string {
  box.onFocus({ target: null } as unknown as FocusEvent);
  box.displayValue.value = text;
  const id = box.resolveSubmit();
  if (PlayerIdSchema.safeParse(id).success) box.commit(id);
  return id;
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  setActivePinia(createPinia());
});

describe('(a) the box after the stand-in is refused', () => {
  it('the shared form alone: committed and read-only with the stand-in (what QA saw)', () => {
    const box = useEidInput('');
    expect(typeAndLoad(box, PLACEHOLDER_ID)).toBe(PLACEHOLDER_ID);
    expect(box.editing.value).toBe(false); // readonly="!editing"
    expect(box.resolveSubmit()).toBe(PLACEHOLDER_ID); // Load sends the stand-in again
  });

  it('App.vue puts a fresh form back on a refusal and focuses it: editable, then a valid ID loads', () => {
    // The refusal branch resets the box; the form is keyed so the reset is a fresh one.
    expect(template).toMatch(/<the-player-id-form[^>]*:key="idFormKey"/);
    const refusal = submitFn.slice(submitFn.indexOf('if (isPlaceholderId(id))'));
    expect(refusal).toMatch(/error\.value = PLACEHOLDER_ID_ENTERED;[\s\S]*resetIdBox\(\)/);
    expect(app).toMatch(/function resetIdBox\([^)]*\)[^{]*\{[\s\S]*idFormKey\.value\+\+[\s\S]*focus\(\)/);
    // The fresh form is the shared one for the account on screen (none here): focused, it is editable and empty.
    const fresh = useEidInput('');
    fresh.onFocus({ target: null } as unknown as FocusEvent);
    expect(fresh.editing.value).toBe(true);
    expect(fresh.displayValue.value).toBe('');
    expect(typeAndLoad(fresh, ID)).toBe(ID);
  });

  it('a failed load gives the box back the same way (the account on screen stays)', () => {
    expect(app).toMatch(/function failLoad\([^)]*\)[^{]*\{[\s\S]*?resetIdBox\(/);
  });
});

describe('(b) a lower-case ID', () => {
  it('the shared check refuses it as typed (Load disabled, no message)', () => {
    expect(PlayerIdSchema.safeParse(ID.toLowerCase()).success).toBe(false);
  });

  it('the "EI" is upper-cased as it is typed, the rest left as it is', () => {
    expect(upperCaseIdPrefix(ID.toLowerCase())).toBe(ID);
    expect(upperCaseIdPrefix('ei')).toBe('EI');
    expect(upperCaseIdPrefix('eI12')).toBe('EI12');
    expect(upperCaseIdPrefix(` ${ID.toLowerCase()} `)).toBe(` ${ID} `);
    expect(upperCaseIdPrefix(`mk2!${ID.toLowerCase()}`)).toBe(`mk2!${ID}`);
    expect(upperCaseIdPrefix('e')).toBe('e');
    expect(upperCaseIdPrefix('eileen')).toBe('eileen');
    expect(upperCaseIdPrefix(ID)).toBe(ID);
    expect(PlayerIdSchema.safeParse(upperCaseIdPrefix(ID.toLowerCase())).success).toBe(true);
  });

  it('the input event: the box value is upper-cased before the form reads it, the caret kept', () => {
    const box = {
      id: 'playerId',
      value: 'ei12',
      selectionStart: 2,
      setSelectionRange(a: number, b: number) {
        this.selectionStart = a;
        void b;
      },
    };
    idInputUpperCase({ target: box });
    expect(box.value).toBe('EI12');
    expect(box.selectionStart).toBe(2);
    // Another input is left alone.
    const other = { ...box, id: 'note', value: 'ei12' };
    idInputUpperCase({ target: other });
    expect(other.value).toBe('ei12');
  });

  it('a whole lower-case ID pasted: loaded as upper case, the paste itself stopped', () => {
    let prevented = 0;
    let stopped = 0;
    const paste = (text: string, id = 'playerId') => ({
      target: { id },
      clipboardData: { getData: () => text },
      preventDefault: () => void prevented++,
      stopPropagation: () => void stopped++,
    });
    expect(idPasteUpperCase(paste(` ${ID.toLowerCase()}\n`))).toBe(ID);
    expect([prevented, stopped]).toEqual([1, 1]);
    // An upper-case ID is the shared form's own paste; anything else pastes as usual.
    expect(idPasteUpperCase(paste(ID))).toBeNull();
    expect(idPasteUpperCase(paste('ei123'))).toBeNull();
    expect(idPasteUpperCase(paste(ID.toLowerCase(), 'note'))).toBeNull();
    expect([prevented, stopped]).toEqual([1, 1]);
  });

  it('App.vue wires both around the shared form, and submitPlayerId upper-cases any ID that reaches it', () => {
    expect(template).toMatch(/<the-player-id-form[^>]*@input\.capture="idInputUpperCase"[^>]*@paste\.capture="onIdPaste"/);
    expect(submitFn).toMatch(/id = upperCaseIdPrefix\(id\)\.trim\(\);[\s\S]*if \(isPlaceholderId\(id\)\)/);
  });
});
