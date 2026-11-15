/**
 * Red team 6 Nov 2026, R1: App.vue's onMounted awaited initPersistence, which rethrew a draft that would not
 * import (a newer beta wrote it, then a rollback) or a database read that failed. The rest of onMounted never
 * ran, myRunsReady stayed false, and My runs and the Auto Planner setup never came, on every reload.
 */
import '../../scripts/node-shims';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { memoryDbModule } from '@/test/memoryDb';

const db = new Map<string, unknown>();
const failRead = { on: false };
const failHash = { on: false };
vi.mock('@/lib/storage/db', () => {
  const mem = memoryDbModule(db);
  return {
    ...mem,
    hashID: async (id: string) => {
      // As crypto.subtle.digest does where there is no crypto.subtle (a plain-http LAN address).
      if (failHash.on) throw new TypeError("Cannot read properties of undefined (reading 'digest')");
      return id;
    },
    loadMetadata: async (hash: string, key: string) => {
      if (failRead.on) throw new Error('IndexedDB did not open within 5 s');
      return mem.loadMetadata(hash, key);
    },
  };
});

const { usePersistence } = await import('lib/planners/composables/usePersistence');
const { useActionsStore } = await import('@/stores/actions');

const ID = 'EI1234567890123456';
/** A draft from a build with an action type this one doesn't know. */
const newerBuildDraft = { version: 1, actions: [{ type: 'teleport', payload: {} }], initialState: {} };

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  db.clear();
  failRead.on = false;
  failHash.on = false;
  setActivePinia(createPinia());
  // usePersistence registers onMounted outside a component here, and Vue says so; the warnings are checked below.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('restoring the draft never stops the page (R1)', () => {
  it('a draft this build cannot open: startup goes on, the draft is kept aside, the plan is as it was', async () => {
    const p = usePersistence();
    db.set(`${ID}/active_draft_${p.sessionId}`, newerBuildDraft);
    const before = JSON.stringify(useActionsStore().actions);

    await expect(p.initPersistence(ID)).resolves.toBeUndefined();

    expect(JSON.stringify(useActionsStore().actions)).toBe(before);
    expect(db.has(`${ID}/active_draft_${p.sessionId}`)).toBe(false);
    expect(db.get(`${ID}/unreadable_draft_${p.sessionId}`)).toEqual(newerBuildDraft);
    expect(warn.mock.calls.some(c => String(c[0]).includes('could not be opened'))).toBe(true);
  });

  it('a database that fails or times out: startup goes on, and an autosave does not write over the draft it never read', async () => {
    const p = usePersistence();
    const stored = { version: 1, actions: [], initialState: {}, mine: true };
    db.set(`${ID}/active_draft_${p.sessionId}`, stored);
    failRead.on = true;

    await expect(p.initPersistence(ID)).resolves.toBeUndefined();
    expect(warn.mock.calls.some(c => String(c[0]).includes('Could not read the saved draft'))).toBe(true);

    // The database comes back (it was only slow): the draft it holds is still not written over.
    failRead.on = false;
    await p.saveActiveDraft();
    expect(db.get(`${ID}/active_draft_${p.sessionId}`)).toEqual(stored);
  });

  it('no way to hash the ID (no crypto.subtle on a plain-http address): startup goes on with no draft', async () => {
    const p = usePersistence();
    await p.initPersistence('EI0000000000000000');
    expect(p.partitionHash.value).toBe('EI0000000000000000');
    failHash.on = true;
    await expect(p.initPersistence(ID)).resolves.toBeUndefined();
    // Not left on the last account's partition, where an autosave would put this account's plan.
    expect(p.partitionHash.value).toBe('');
  });
});

describe('App.vue onMounted', () => {
  it('catches a failed draft restore, so myRunsReady is always set', () => {
    const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
    const mount = app.slice(app.indexOf('onMounted(async () => {'));
    const body = mount.slice(0, mount.indexOf('\n});'));
    const call = body.indexOf('await initPersistence(playerId.value);');
    expect(call).toBeGreaterThan(0);
    expect(body.slice(0, call).trimEnd().endsWith('try {')).toBe(true);
    expect(body.indexOf('myRunsReady = true;')).toBeGreaterThan(call);
  });
});
