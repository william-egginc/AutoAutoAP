/**
 * spec-r7redteam-a (1 Nov 2026), QA's R7 red team (notes/redteam-r7.md):
 *
 *   (1) Finding 1: "Download this save" kept the save's other persistent identifiers (deviceId, gameServicesId,
 *       gameServicesIdScoped, pushUserId). They are blanked now; the page reads none of them. `userName` stays
 *       (pending Jordan), `checksum` stays (nothing checks it on load; the file is plain JSON, no container).
 *       The blanked file still loads back, with the account on screen and without.
 *
 * Real stores and the real save loader on the synthetic save with made-up IDs (EI9876543210987654), made-up device
 * identifiers, and a fixed clock. No player data.
 */
import '../../scripts/node-shims';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { NOW, syntheticSaveWithId } from '@/test/syntheticSave';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { keepSave, loadKeptSave } from '@/search/keptSaves';
import { accountOf } from '@/search/runSaves';
import { hashID } from '@/lib/storage/db';
import { PLACEHOLDER_ID } from '@/lib/saveScrub';
import { useInitialStateStore } from './initialState';
import { useUIStore } from './ui';
import { useChainSearchStore } from './chainSearch';

const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/lib/storage/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/storage/db')>()),
  ...(await import('@/test/memoryDb')).memoryDbModule(db),
  hashID: (await importOriginal<typeof import('@/lib/storage/db')>()).hashID,
}));

const ID = 'EI9876543210987654';
/** Made-up device identifiers, shaped as a real save carries them. */
const DEVICE = {
  deviceId: '0a1b2c3d-0000-4000-8000-123456789abc',
  gameServicesId: 'G:1234567890',
  gameServicesIdScoped: 'A:_0123456789abcdef0123456789abcdef',
  pushUserId: 'fedcba98-7654-4321-8000-0123456789ab',
};
const DEVICE_FIELDS = Object.keys(DEVICE) as (keyof typeof DEVICE)[];
const leftovers = (text: string) => (text.match(/EI\d{16}/gi) ?? []).filter(m => m.toUpperCase() !== PLACEHOLDER_ID);

/** The account's save as kept: its ID, the device identifiers, a name and a checksum; an hour old. */
function keptBackup() {
  const b = syntheticSaveWithId(ID);
  Object.assign(b, DEVICE, { userName: 'SyntheticFixture', checksum: 123456789 });
  b.approxTime = NOW - 3600;
  b.settings = { lastBackupTime: NOW - 3600 };
  return b;
}

/** "Download this save" on a kept save of the account. */
async function download(): Promise<string> {
  const kept = await keepSave(await hashID(ID), keptBackup(), 190);
  const out = await useChainSearchStore().entrySaveFile(ID, kept);
  expect(out).not.toBeNull();
  return out!.text;
}

async function signedIn(): Promise<void> {
  setActivePinia(createPinia());
  useUIStore().screenPlayerId = ID;
  const latest = syntheticSaveWithId(ID);
  resolveColleggtibleContracts(latest);
  await initPlanFuture(ID, markRaw(latest), 'fresh');
}

let mem: Map<string, string>;
beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
beforeEach(() => {
  db.clear();
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW * 1000);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('(1) a downloaded save carries no device identifiers', () => {
  it('deviceId, gameServicesId, gameServicesIdScoped and pushUserId are blank, and no player ID but the stand-in', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text) as Record<string, unknown>;
    for (const f of DEVICE_FIELDS) {
      expect(file[f] ?? '', f).toBe('');
      expect(text, f).not.toContain(DEVICE[f]);
    }
    expect(leftovers(text)).toEqual([]);
    expect(file.eiUserId).toBe(PLACEHOLDER_ID);
    // Kept as they were: the name (pending Jordan) and the game's checksum (nothing reads it).
    expect(file.userName).toBe('SyntheticFixture');
    expect(file.checksum).toBe(123456789);
  });

  it('the kept save itself is left as it was (only the file is blanked)', async () => {
    setActivePinia(createPinia());
    const hash = await hashID(ID);
    const kept = await keepSave(hash, keptBackup(), 190);
    await useChainSearchStore().entrySaveFile(ID, kept);
    const stored = (await loadKeptSave(hash, kept.key)) as Record<string, unknown> | null;
    expect(stored?.deviceId).toBe(DEVICE.deviceId);
    expect(stored?.eiUserId).toBe(ID);
  });

  it('round trip, account on screen: the downloaded file loads back for that account', async () => {
    setActivePinia(createPinia());
    const text = await download();
    await signedIn();
    const store = useChainSearchStore();
    expect(await store.loadSaveFile(ID, text)).toBe(true);
    expect(store.olderSaveError).toBeNull();
    const raw = useInitialStateStore().rawBackup as Record<string, unknown>;
    expect(raw.eiUserId).toBe(ID);
    expect(accountOf(raw)).toBe(accountOf({ eiUserId: ID }));
    expect(useUIStore().runSaveLoaded).toMatchObject({ from: 'file' });
    expect(useUIStore().runSaveLoaded?.noAccount).toBeFalsy();
  });

  it('round trip, no account on screen: the downloaded file loads with none', async () => {
    setActivePinia(createPinia());
    const text = await download();
    setActivePinia(createPinia());
    const store = useChainSearchStore();
    expect(await store.loadSaveFile('', text)).toBe(true);
    expect(store.olderSaveError).toBeNull();
    expect((useInitialStateStore().rawBackup as Record<string, unknown>).eiUserId).toBe('');
    expect(useUIStore().runSaveLoaded).toMatchObject({ from: 'file', noAccount: true });
  });
});

/** Signed in as `screen` with a latest save whose own ID is `saveId`, as App.vue sets it up. */
async function signedInWith(screen: string, saveId: string): Promise<void> {
  setActivePinia(createPinia());
  useUIStore().screenPlayerId = screen;
  const latest = syntheticSaveWithId(saveId);
  resolveColleggtibleContracts(latest);
  await initPlanFuture(screen, markRaw(latest), 'fresh');
}

describe('(2) a downloaded save loads back into the account it came from', () => {
  // QA's run (finding 2): the account on screen, its loaded save carrying the stand-in, refused as "another account's".
  it('the account on screen, its loaded save holding the stand-in: the scrubbed file loads for that account', async () => {
    setActivePinia(createPinia());
    const text = await download();
    await signedInWith(ID, PLACEHOLDER_ID);
    const store = useChainSearchStore();
    expect(await store.loadSaveFile(ID, text)).toBe(true);
    expect(store.olderSaveError).toBeNull();
    const raw = useInitialStateStore().rawBackup as Record<string, unknown>;
    expect(raw.eiUserId).toBe(ID);
    expect(useUIStore().runSaveLoaded?.noAccount).toBeFalsy();
  });

  // The super-user form of an ID (lib/schema PlayerIdSchema: "mk2!EI…"): the loaded save names the plain ID.
  it('an mk2! form of the ID on screen: the scrubbed file takes the loaded save’s own ID, not refused', async () => {
    setActivePinia(createPinia());
    const text = await download();
    await signedInWith(`mk2!${ID}`, ID);
    const store = useChainSearchStore();
    expect(await store.loadSaveFile(`mk2!${ID}`, text)).toBe(true);
    expect(store.olderSaveError).toBeNull();
    const raw = useInitialStateStore().rawBackup as Record<string, unknown>;
    expect(raw.eiUserId).toBe(ID);
    expect(accountOf(raw)).toBe(accountOf({ eiUserId: ID }));
  });

  it('a save naming a different real ID is still refused, whatever the loaded save holds', async () => {
    const other = (await download()).replaceAll(PLACEHOLDER_ID, 'EI1234567890123456');
    for (const [screen, saveId] of [
      [ID, ID],
      [ID, PLACEHOLDER_ID],
      [`mk2!${ID}`, ID],
    ]) {
      await signedInWith(screen, saveId);
      const store = useChainSearchStore();
      expect(await store.loadSaveFile(screen, other), `${screen} / ${saveId}`).toBe(false);
      expect(store.olderSaveError).toMatch(/another account/);
      expect((useInitialStateStore().rawBackup as Record<string, unknown>).eiUserId).toBe(saveId);
    }
  });

  it('a lower-case form of the account’s own ID in the file is this account', async () => {
    const own = (await download()).replaceAll(PLACEHOLDER_ID, ID.toLowerCase());
    await signedInWith(ID, ID);
    const store = useChainSearchStore();
    expect(await store.loadSaveFile(ID, own)).toBe(true);
    expect((useInitialStateStore().rawBackup as Record<string, unknown>).eiUserId).toBe(ID);
  });
});
