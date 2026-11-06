/**
 * InstantRoute's setup read `initialState` before its `const` (spec-fluff2-bugs, 5 Nov 2026, found while checking By a
 * date's frame): on a second visit to By a date with a Custom result kept, the searchFound computed ran
 * ownerMatches() during setup, which read `initialState` (declared ~70 lines further down): "ReferenceError: Cannot
 * access 'initialState' before initialization". The card's error boundary caught it ("card could not be drawn"), but
 * the half-made component broke the next patch, and switching to Single run left By a date on screen. The store is
 * now taken beside the others at the top of the script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
const script = src.slice(src.indexOf('<script setup'));

describe('InstantRoute: initialState is declared before anything reads it', () => {
  it('once, before its first use', () => {
    const decl = 'const initialState = useInitialStateStore();';
    expect(script.split(decl)).toHaveLength(2);
    const at = script.indexOf(decl);
    const firstUse = script.search(/\binitialState\./);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(firstUse);
  });
});
