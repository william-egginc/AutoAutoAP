/**
 * exactInputs.ts: the check starts from the state Joo's generate() starts from (his Auto-tab load of
 * the save, pending TE rolled up ONCE), whatever the page's stores hold, and writes none of them.
 * Synthetic save: mid-ascension on Integrity with pending TE on every egg (a double count shows).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import type { ei } from 'lib';
import { useInitialStateStore } from '@/stores/initialState';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { useVirtueStore } from '@/stores/virtue';
import { countTEThresholdsPassed, getThresholdForTE } from '@/lib/truthEggs';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes/utils';
import { saveStart } from './instantAnswer';
import { eggsDeliveredFromBackup } from './saveFarm';
import { exactInputsFromStores, generateStart } from './exactInputs';
import { startMismatch } from './exactCheck';

const SYNC = 1_800_000_000;
const CLAIMED = [31, 30, 35, 31, 32]; // 159
const PENDING = [4, 9, 4, 8, 8]; // 33
const EGGS = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const;

function backup(): ei.IBackup {
  return {
    userName: 'test',
    settings: { lastBackupTime: SYNC + 60 },
    game: { soulEggsD: 1e30, epicResearch: [{ id: 'silo_capacity', level: 20 }] },
    virtue: {
      shiftCount: 12,
      // Just past each egg's (claimed + pending)th threshold: the save holds the pending TE unclaimed.
      eggsDelivered: CLAIMED.map((c, i) => getThresholdForTE(c + PENDING[i]) * 1.001),
      eovEarned: [...CLAIMED],
    },
    farms: [
      { eggType: 1, eggsLaid: 1 },
      {
        eggType: 51,
        eggsLaid: 3e12,
        lastStepTime: SYNC,
        numChickens: 1,
        habPopulation: [2e9, 2e9, 1e9, 1e9],
        habs: [18, 18, 18, 19],
        vehicles: [11, 11],
        trainLength: [10],
        silosOwned: 10,
        cashEarned: 1e30,
        cashSpent: 1e29,
        commonResearch: [{ id: 'comfy_nests', level: 50 }],
      },
    ],
  } as unknown as ei.IBackup;
}

/** Reference: generate()'s starting TE per egg is his rollUpPendingTE: min(98, claimed + pending). */
const REF_TE = Object.fromEntries(EGGS.map((e, i) => [e, Math.min(98, CLAIMED[i] + PENDING[i])]));
const REF_TOTAL = 192;

beforeEach(() => setActivePinia(createPinia()));

describe('the check’s start state is generate()’s (pending TE counted once)', () => {
  it('the synthetic save has 159 claimed + 33 pending, and the instant answer uses 192', () => {
    const b = backup();
    const delivered = b.virtue!.eggsDelivered!;
    expect(delivered.map(d => countTEThresholdsPassed(d))).toEqual(CLAIMED.map((c, i) => c + PENDING[i]));
    expect(saveStart(eggsDeliveredFromBackup(b)).te).toBe(REF_TOTAL);
  });

  it('page stores with the pending TE already rolled into the TE maps AND still pending: still 192', () => {
    const b = backup();
    const page = getActivePinia();
    const s = useInitialStateStore();
    loadAndSyncBackup('EI0000000000000000', b, 'default');
    // A mixed state (the double count the old reading of the stores fell into): TE maps rolled up,
    // the pending map still set.
    for (const [i, e] of EGGS.entries()) {
      s.setInitialTeEarned(e, CLAIMED[i] + PENDING[i]);
      useTruthEggsStore().setTEEarned(e, CLAIMED[i] + PENDING[i]);
      s.setInitialTePending(e, PENDING[i]);
    }
    const before = JSON.stringify({ i: s.$state, t: useTruthEggsStore().$state, v: useVirtueStore().$state });

    const inp = exactInputsFromStores({ chain: [195, 197], a1: 'continue', start: SYNC + 3600 });
    expect(inp.backupBase.te).toBe(REF_TOTAL);
    expect(inp.backupBase.teEarned).toEqual(REF_TE);
    expect(inp.continueState?.te).toBe(REF_TOTAL);
    expect(inp.continueState?.teEarned).toEqual(REF_TE);
    expect(inp.continueState?.currentEgg).toBe('integrity');
    // His currentTE (tier-13 skip below 190) is the rolled-up TE too, not the claimed 159.
    expect(inp.currentTE).toBe(REF_TOTAL);
    // The eggs delivered are the save's (no catch-up, no pending added to them).
    expect(EGGS.map(e => inp.backupBase.eggsDelivered[e])).toEqual(b.virtue!.eggsDelivered);
    // The same TE the instant answer used: no mismatch.
    expect(startMismatch(inp.backupBase.te, saveStart(eggsDeliveredFromBackup(b)).te)).toBeNull();

    // Nothing of the page's was written, and its Pinia is the active one again.
    expect(JSON.stringify({ i: s.$state, t: useTruthEggsStore().$state, v: useVirtueStore().$state })).toBe(before);
    expect(getActivePinia()).toBe(page);
  });

  it('equals his own Auto-tab load (plan_next + rollUpPendingTE) on fresh stores, field for field', () => {
    const b = backup();
    const g = generateStart(b);
    // Reference run of his code on its own Pinia.
    setActivePinia(createPinia());
    loadAndSyncBackup('', b, 'plan_next');
    rollUpPendingTE();
    const s = useInitialStateStore();
    expect(g.base.teEarned).toEqual(s.initialTeEarned);
    expect(g.base.eggsDelivered).toEqual(s.initialEggsDelivered);
    expect(g.base.te).toBe(useVirtueStore().initialTE);
    expect(g.base.artifactSets).toEqual(JSON.parse(JSON.stringify(s.artifactSets)));
    expect(g.base.activeArtifactSet).toBe('earnings');
    expect(g.base.currentEgg).toBe('curiosity');
    expect(g.base.bankValue).toBe(0);
    // Continue Current: the save's farm as the save holds it (not a caught-up copy).
    expect(g.continueState?.lastStepTime).toBe(SYNC);
    expect(g.continueState?.population).toBe(6e9);
  });

  it('no save loaded: says so', () => {
    expect(() => exactInputsFromStores({ chain: [200], a1: '', start: SYNC })).toThrow(/no save is loaded/);
  });
});

describe('the check refuses to start from another TE than the instant answer', () => {
  it('within 0.01: fine; otherwise the plain sentence, nothing shown as exact', () => {
    expect(startMismatch(192, 192)).toBeNull();
    expect(startMismatch(192.004, 192)).toBeNull();
    expect(startMismatch(192, undefined)).toBeNull();
    expect(startMismatch(225, 192)).toBe(
      'The check starts from TE 225 but the instant answer used TE 192: nothing was shown as exact.'
    );
  });
});
