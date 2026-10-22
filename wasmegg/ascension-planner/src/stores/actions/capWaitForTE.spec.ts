/**
 * The 98 cap on every plan read in (prelive, 21 Oct 2026; red team LOW 7): an imported, restored or reconciled
 * plan's Wait for TE is held to the bounds the Wait for TE box keeps. All of them go through
 * `importPlanLogic` (stores/actions/io.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { capWaitForTE, importPlanLogic } from './io';

const wait = (payload: Record<string, unknown>) => ({ type: 'wait_for_te', payload: { egg: 'integrity', ...payload } });

describe('capWaitForTE', () => {
  it('a target of 9999 becomes 98, and the gain at most target minus start', () => {
    const a = wait({ targetTE: 9999, startTE: 10, teGained: 9989 });
    capWaitForTE(a);
    expect(a.payload).toMatchObject({ targetTE: 98, startTE: 10, teGained: 88 });
  });

  it('huge, negative, decimal and non-number values land in range', () => {
    const a = wait({ targetTE: 1e308, startTE: -5, teGained: 3.48e45 });
    capWaitForTE(a);
    expect(a.payload).toMatchObject({ targetTE: 98, startTE: 0, teGained: 98 });
    const b = wait({ targetTE: '40.7', startTE: 'x', teGained: null });
    capWaitForTE(b);
    expect(b.payload).toMatchObject({ targetTE: 40, startTE: 0, teGained: 0 });
  });

  it('leaves a valid one as it is, and other actions alone', () => {
    const a = wait({ targetTE: 30, startTE: 25, teGained: 5 });
    capWaitForTE(a);
    expect(a.payload).toMatchObject({ targetTE: 30, startTE: 25, teGained: 5 });
    const other = { type: 'wait_for_time', payload: { targetTE: 9999 } };
    capWaitForTE(other);
    expect(other.payload.targetTE).toBe(9999);
    expect(() => capWaitForTE({ type: 'wait_for_te' })).not.toThrow();
    expect(() => capWaitForTE(null)).not.toThrow();
  });
});

describe('importPlanLogic', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('an imported Wait for TE #9999 is read in as #98', () => {
    const data = importPlanLogic(
      JSON.stringify({
        version: 1,
        initialState: {},
        actions: [
          { type: 'start_ascension', payload: { initialEgg: 'curiosity' } },
          wait({ targetTE: 9999, startTE: 0, teGained: 9999 }),
        ],
      })
    );
    expect(data.actions[1].payload).toMatchObject({ targetTE: 98, teGained: 98 });
  });

  it('import, Plan Library load and restore, reconcile and the saved draft all go through importPlanLogic', () => {
    const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
    expect(src('stores/actions/index.ts')).toContain('const data = importPlanLogic(jsonString);');
    expect(src('stores/actions/index.ts')).toContain('await this.importPlan(JSON.stringify(plan.data));');
    expect(src('lib/modes/reconcile.ts')).toContain('await actionsStore.loadPlanFromLibrary(plan);');
    expect(src('lib/modes/loadPlan.ts')).toContain('await actionsStore.importPlan(');
    expect(src('composables/usePersistence.ts')).toContain('await actionsStore.importPlan(');
  });
});
