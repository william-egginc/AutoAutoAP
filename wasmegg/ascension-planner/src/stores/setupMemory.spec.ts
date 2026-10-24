/**
 * Your setup, remembered per account (batch 16, item 8; lib/setupMemory.ts and stores/chainSearch.ts
 * `loadSetupFor`): one hashed key per account, the player's own edits only, restores muted, the gate,
 * reset, ended time off dropped, and never the plan start.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChainSearchStore } from './chainSearch';
import { hashID } from '@/lib/storage/db';
import { isDefaultSetup, mergeSetup, parseSetup, setupDefaults, setupKey } from '@/lib/setupMemory';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
let mem: Map<string, string>;

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-15T18:00:00Z'));
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Let the debounced write happen. */
const settle = () => vi.advanceTimersByTime(1000);
const blobOf = async (id: string) => {
  const raw = mem.get(setupKey(await hashID(id)));
  return raw ? JSON.parse(raw) : null;
};

describe('remembered per account, under a hash of the ID', () => {
  it("the player's edit is written under aap-setup:<sha-256>, and no key holds the ID", async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.scheduleEnabled = true;
    store.availableFrom = 9;
    store.availableTo = 1;
    settle();
    const key = setupKey(await hashID(A));
    expect(key).toMatch(/^aap-setup:[0-9a-f]{64}$/);
    expect([...mem.keys()].filter(k => k.startsWith('aap-setup'))).toEqual([key]);
    for (const [k, v] of mem) {
      expect(k).not.toContain(A);
      expect(v).not.toContain(A);
    }
    expect((await blobOf(A)).hours).toEqual({ on: true, from: 9, to: 1, days: [0, 1, 2, 3, 4, 5, 6] });
    expect(store.setupIsRemembered).toBe(true);
  });

  it("each account gets its own; switching never carries the last one's hours or time off", async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.scheduleEnabled = true;
    store.availableFrom = 9;
    store.timeOff = [{ from: '2026-12-20', to: '2026-12-27' }];
    settle();
    await store.loadSetupFor(B);
    expect(store.scheduleEnabled).toBe(false);
    expect(store.availableFrom).toBe(7);
    expect(store.timeOff).toEqual([]);
    expect(store.setupIsRemembered).toBe(false);
    store.deferShifts = false;
    settle();
    await store.loadSetupFor(A);
    expect(store.scheduleEnabled).toBe(true);
    expect(store.availableFrom).toBe(9);
    expect(store.timeOff).toEqual([{ from: '2026-12-20', to: '2026-12-27' }]);
    expect(store.deferShifts).toBe(true);
    expect((await blobOf(B)).holdShifts).toBe(false);
  });

  it('an edit waiting when the account changes is written to the account it was made on', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.availableFrom = 10;
    await store.loadSetupFor(B);
    settle();
    expect((await blobOf(A)).hours.from).toBe(10);
    expect(await blobOf(B)).toBeNull();
  });

  it('first ascension goes straight into Your setup, not through Single run (Classic) on read', async () => {
    mem.set(
      setupKey(await hashID(A)),
      JSON.stringify(mergeSetup(setupDefaults(), { firstAscension: 'continue' }, Date.now()))
    );
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    expect(store.firstAscensionChoice).toBe('continue');
    expect(store.classicFirstPickChanged).toBe(false);
    const { useAutoPlannerStore } = await import('./autoPlanner');
    expect(useAutoPlannerStore().planVariantOverrides[0]).toBeUndefined();
  });
});

describe('only the player’s own edits', () => {
  it('nothing set while muted (a carry-on, a saved answer, a sweep) is remembered, sync or async', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.muteSetupMemory(() => {
      store.scheduleEnabled = true;
      store.timeOff = [{ from: '2026-11-01', to: '2026-11-02' }];
    });
    await store.muteSetupMemory(async () => {
      await Promise.resolve();
      store.deferShifts = false;
    });
    settle();
    expect(await blobOf(A)).toBeNull();
    // Putting back what a sweep borrowed is muted too.
    store.restoreFirstAscension({ choice: 'fresh', pick: undefined });
    settle();
    expect(await blobOf(A)).toBeNull();
  });

  it("an edit after a restore writes only its own group, not the run's other settings", async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.muteSetupMemory(() => (store.timeOff = [{ from: '2026-11-01', to: '2026-11-02' }]));
    store.deferShifts = false;
    settle();
    const blob = await blobOf(A);
    expect(blob.holdShifts).toBe(false);
    expect(blob.timeOff).toEqual([]);
  });

  it('source: every programmatic restore runs muted', () => {
    const src = fs.readFileSync(path.join(__dirname, 'chainSearch.ts'), 'utf8');
    expect(src).toMatch(
      /function applyRunSettings\(fp: string\): void \{[\s\S]{0,200}muteSetupMemory\(\(\) => applyRunSettingsNow\(fp\)\)/
    );
    expect(src).toMatch(/return muteSetupMemory\(\(\) => prepareToCarryOnNow\(playerId, record\)\)/);
    expect(src).toMatch(/muteSetupMemory\(\(\) => applyStoredSettingsNow\(st\)\)/);
    const sweep = fs.readFileSync(path.join(__dirname, '../components/science/SweepRunner.vue'), 'utf8');
    expect(sweep).toContain('store.muteSetupMemory(() => store.setFirstAscension(request.firstAscension!))');
    const insane = fs.readFileSync(path.join(__dirname, '../components/auto/InsanePanel.vue'), 'utf8');
    expect(insane).toContain('store.muteSetupMemory(() => store.setFirstAscension(sweepRequest.firstAscension!))');
    // The read: one watcher in App, immediate, on the player ID.
    const app = fs.readFileSync(path.join(__dirname, '../App.vue'), 'utf8');
    expect(app).toContain('watch(playerId, id => void chainSearchStore.loadSetupFor(id), { immediate: true });');
  });
});

describe('the gate', () => {
  it('setupLoaded is false while an account loads and true after (also with nothing remembered)', async () => {
    const store = useChainSearchStore();
    expect(store.setupLoaded).toBe(true);
    const p = store.loadSetupFor(A);
    expect(store.setupLoaded).toBe(false);
    await p;
    expect(store.setupLoaded).toBe(true);
  });

  it('the instant answer waits for it before working anything out (source)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
    expect(src).toMatch(
      /store\.setupLoaded,\n[\s\S]*?store\.startWait,\n {4}\]\),\n {2}\(\) => \{\n {4}if \(timer\) clearTimeout\(timer\);\n {4}if \(store\.startWait\) \{\n {6}waitForSave\(\);\n {6}return;\n {4}\}\n {4}if \(!store\.setupLoaded\) return;/
    );
  });
});

describe('reset and what is kept', () => {
  it('Reset to defaults puts the defaults back and removes the key', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.scheduleEnabled = true;
    store.timeOff = [{ from: '2026-12-20', to: '2026-12-27' }];
    store.setFirstAscension('continue');
    settle();
    expect(await blobOf(A)).not.toBeNull();
    store.resetSetupToDefaults();
    settle();
    expect(await blobOf(A)).toBeNull();
    expect(store.scheduleEnabled).toBe(false);
    expect(store.timeOff).toEqual([]);
    expect(store.firstAscension).toBe('auto');
    expect(store.setupIsRemembered).toBe(false);
  });

  it('time off already over is dropped on read', async () => {
    const blob = mergeSetup(
      setupDefaults(),
      {
        timeOff: [
          { from: '2026-09-01', to: '2026-09-05' },
          { from: '2026-10-14', to: '2026-10-16' },
          { from: '2026-12-20', to: '2026-12-27' },
        ],
      },
      0
    );
    mem.set(setupKey(await hashID(A)), JSON.stringify(blob));
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    expect(store.timeOff).toEqual([
      { from: '2026-10-14', to: '2026-10-16' },
      { from: '2026-12-20', to: '2026-12-27' },
    ]);
  });

  it('never the plan start, time zone, Target TE, milestones, workers or level', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.pinPlanStart(Date.parse('2026-11-01T12:00:00Z') / 1000);
    store.finalTE = 300;
    store.scheduleEnabled = true;
    settle();
    const blob = await blobOf(A);
    expect(Object.keys(blob).sort()).toEqual(['at', 'firstAscension', 'holdShifts', 'hours', 'timeOff', 'v']);
    expect(JSON.stringify(blob)).not.toMatch(/planStart|timezone|final|milestone|worker|level/i);
  });
});

describe('lib/setupMemory parse', () => {
  it('bad fields fall back to the defaults; junk is nothing', () => {
    expect(parseSetup('not json', '2026-10-15')).toBeNull();
    expect(parseSetup(JSON.stringify({ v: 2 }), '2026-10-15')).toBeNull();
    const s = parseSetup(
      JSON.stringify({ v: 1, hours: { on: 'yes', from: 30, to: 22, days: [9, 1, 1] }, firstAscension: 'x' }),
      '2026-10-15'
    )!;
    expect(s.hours).toEqual({ on: false, from: 7, to: 22, days: [1] });
    expect(s.firstAscension).toBe('auto');
    expect(isDefaultSetup(setupDefaults())).toBe(true);
  });
});
