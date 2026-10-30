/**
 * spec-savescrub (29 Oct 2026), loading: a downloaded save has every player ID replaced by EI0000000000000000, so the
 * page takes the account from the screen, never from the file (lib/saveScrub.ts `idFromScreen`).
 *
 *   (1) "Download this save" writes no player ID.
 *   (2) Signed in: the scrubbed file loads as the original does, with the same instant answer (the same tables asked
 *       for, own one first, and the same pricing), the same Follow and settings keys and the same account. Before,
 *       it was refused as "another account's".
 *   (3) No account on screen: it loads, the instant answer is worked out, nothing is keyed by the stand-in, and the
 *       page says in one line what is off.
 *
 * Real stores and the real save loader on the synthetic save with a made-up ID (EI9876543210987654), a fixed clock,
 * and the synthetic instant-answer table of useInstantCompute.spec.ts. No player data.
 */
import '../../scripts/node-shims';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { NOW, syntheticSaveWithId } from '@/test/syntheticSave';
import { renderHtml } from '@/test/renderComponent';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { backupText, keepSave } from '@/search/keptSaves';
import { accountOf } from '@/search/runSaves';
import { ownTableNames } from '@/search/tableGear';
import { MAXED_TABLE_FILE } from '@/search/tableBracket';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from '@/search/precomputedLeg';
import { firstLegOptions, tailOptionsOf, type BuildLookup } from '@/search/routeFinder';
import type { TableHeader } from '@/search/precomputedTable';
import { getNextSaleEnd } from '@/lib/events';
import { followKey } from '@/lib/followCloud';
import { hashID } from '@/lib/storage/db';
import { computeInstantPricing, type InstantPool } from '@/composables/useInstantCompute';
import { NO_ACCOUNT_LINE, PLACEHOLDER_ID, scrubPlayerIds } from '@/lib/saveScrub';
import RunSaveNotice from '@/components/auto/RunSaveNotice.vue';
import { useInitialStateStore } from './initialState';
import { useUIStore } from './ui';
import { useChainSearchStore } from './chainSearch';
import { useFollowStore } from './follow';
import { usePrefsStore } from './prefs';

/** The kept saves in memory (no IndexedDB in node); the real ID hash. */
const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/lib/storage/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/storage/db')>()),
  ...(await import('@/test/memoryDb')).memoryDbModule(db),
  hashID: (await importOriginal<typeof import('@/lib/storage/db')>()).hashID,
}));

const ID = 'EI9876543210987654';
const leftovers = (text: string) => (text.match(/EI\d{16}/gi) ?? []).filter(m => m.toUpperCase() !== PLACEHOLDER_ID);

/** The save as a file holds it, taken an hour before the latest one. */
function file(scrub: boolean): string {
  const b = syntheticSaveWithId(ID);
  b.approxTime = NOW - 3600;
  b.settings = { lastBackupTime: NOW - 3600 };
  const text = backupText(b);
  return scrub ? scrubPlayerIds(text) : text;
}

/** Signed in: the account on screen and its latest save set up, as App.vue does on entering the Auto Planner. */
async function signedIn(): Promise<void> {
  setActivePinia(createPinia());
  useUIStore().screenPlayerId = ID;
  const latest = syntheticSaveWithId(ID);
  resolveColleggtibleContracts(latest);
  await initPlanFuture(ID, markRaw(latest), 'fresh');
}

// ------------------------------------------------- the instant answer on a synthetic table (useInstantCompute.spec.ts)
const FROM = 150;
const TO = 300;
const REF = Date.parse('2027-01-04T08:00:00Z') / 1000;
const table: BuildLookup = (te, hour) => {
  if (te < FROM || te > TO) return null;
  const cellStart = REF + ((hour - pacificHourOfWeek(REF) + 168) % 168) * 3600;
  const b: BuildParams = {
    sales: 1,
    tier13: false,
    waitStart: 3600 * (2 + (te % 7) + (hour % 5)),
    saleEnd: getNextSaleEnd(cellStart) - cellStart,
    peakELR: 2e12 * (1 + (te - FROM) / 5),
    delivered: canonicalDelivered(te),
  };
  return [b];
};
const HEADER = { version: 2, referenceWeek: REF, cteBonus: 0, deliveryScore: 1, from: FROM, to: TO, slots: 1, builtAt: '' } as TableHeader;
const BASE = `${import.meta.env.BASE_URL}precompute/`;

/** The instant answer as the page works it out, with every table it asked for (an own one is a 404 here). */
async function instantAnswer(): Promise<{ asked: string[]; pricing: string }> {
  const asked: string[] = [];
  const pool: InstantPool = {
    async header(url: string) {
      asked.push(url);
      if (url === `${BASE}${MAXED_TABLE_FILE}`) return HEADER;
      throw new Error('the instant answer could not be loaded (404)');
    },
    async firstLegs(m) {
      return JSON.parse(
        JSON.stringify(
          firstLegOptions({
            table,
            startTE: m.startTE,
            start: m.start,
            final: m.final,
            deliveryScale: m.deliveryScale,
            delivered: m.delivered,
            cont: m.cont,
            buildUp: m.buildUp ?? null,
            freshLive: m.freshLive ?? null,
            firstAscension: m.firstAscension,
            pinSeconds: m.pinSeconds,
            maxContinueSeconds: m.maxContinueSeconds,
            ...tailOptionsOf(m),
          })
        )
      );
    },
  };
  const req = { key: 'k|260', account: 'a', backupTime: 1, setup: 's', final: 260, useHours: false };
  const got = await computeInstantPricing(req, pool, () => true);
  return { asked, pricing: JSON.stringify(got?.pricing ?? null) };
}

/** The Follow and settings stores' keys once worked out for the loaded save. */
async function cloudKeys(): Promise<{ follow: string; followPartition: string; prefs: string }> {
  const follow = useFollowStore();
  const prefs = usePrefsStore();
  for (let i = 0; i < 50; i++) await new Promise(r => setTimeout(r, 0));
  return { follow: follow.cloudKey, followPartition: follow.partition, prefs: prefs.cloudKey };
}

/** Everything (2) compares, after loading `text` for the account on screen ('' for none). */
async function load(text: string, screen: string) {
  const store = useChainSearchStore();
  const ok = await store.loadSaveFile(screen, text);
  const raw = useInitialStateStore().rawBackup as { eiUserId?: string } | null;
  return {
    ok,
    error: store.olderSaveError,
    id: raw?.eiUserId ?? null,
    account: accountOf(raw),
    te: store.currentTE,
    planStart: store.planStart,
    startWait: store.startWait,
    instant: await instantAnswer(),
    keys: await cloudKeys(),
  };
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

describe('(1) "Download this save" writes no player ID', () => {
  it('the kept save comes back as a file with every ID replaced, the rest as it was', async () => {
    setActivePinia(createPinia());
    const raw = syntheticSaveWithId(ID);
    const kept = await keepSave(await hashID(ID), raw, 190);
    const out = await useChainSearchStore().entrySaveFile(ID, kept);
    expect(out).not.toBeNull();
    expect(leftovers(out!.text)).toEqual([]);
    expect(out!.text).toBe(backupText(raw).replaceAll(ID, PLACEHOLDER_ID));
    expect(out!.name).not.toMatch(/EI\d/i);
  });
});

describe('(2) a scrubbed file, signed in: the same as the original file for the same account', () => {
  it('loads (it was refused as another account’s), with the same instant answer, own table, Follow and settings keys', async () => {
    await signedIn();
    const original = await load(file(false), ID);
    await signedIn();
    const scrubbed = await load(file(true), ID);

    expect(original.ok).toBe(true);
    expect(scrubbed.ok).toBe(true);
    expect(scrubbed.error).toBeNull();
    // The account is the one on screen, in full.
    expect(scrubbed.id).toBe(ID);
    expect(scrubbed.account).toBe(accountOf({ eiUserId: ID }));
    expect(scrubbed.te).toBe(original.te);
    expect(scrubbed.planStart).toBe(original.planStart);
    expect(scrubbed.startWait).toBe('');
    // The instant answer: own table looked for first, by the account's name, then the shared one; the same pricing.
    const own = (await ownTableNames(ID)).map(n => `${BASE}${n}`);
    expect(scrubbed.instant.asked.slice(0, own.length)).toEqual(own);
    expect(scrubbed.instant).toEqual(original.instant);
    expect(JSON.parse(scrubbed.instant.pricing)).not.toBeNull();
    // Follow and settings online: the account's own key, not the stand-in's.
    expect(scrubbed.keys.follow).toBe(await followKey(ID));
    expect(scrubbed.keys).toEqual(original.keys);
    expect(scrubbed.keys.follow).not.toBe(await followKey(PLACEHOLDER_ID));
  });

  it('another account’s save is still refused', async () => {
    await signedIn();
    const other = backupText(syntheticSaveWithId('EI1234567890123456'));
    expect(await useChainSearchStore().loadSaveFile(ID, other)).toBe(false);
    expect(useChainSearchStore().olderSaveError).toMatch(/another account/);
  });
});

describe('(3) a scrubbed file with no account on screen', () => {
  it('loads and works the instant answer out, keys nothing by the stand-in, and says what is off', async () => {
    await signedIn();
    const withAccount = await load(file(true), ID);

    setActivePinia(createPinia());
    const none = await load(file(true), '');
    expect(none.ok).toBe(true);
    expect(none.error).toBeNull();
    // No account: not the stand-in, not anything from the file.
    expect(none.id).toBe('');
    expect(none.account).toBe('');
    expect(none.startWait).toBe('');
    // The instant answer is worked out, the same one; no own table is looked for.
    expect(JSON.parse(none.instant.pricing)).not.toBeNull();
    expect(none.instant.pricing).toBe(withAccount.instant.pricing);
    expect(none.instant.asked).toEqual([`${BASE}${MAXED_TABLE_FILE}`]);
    // Nothing online.
    expect(none.keys).toEqual({ follow: '', followPartition: '', prefs: '' });
    // The page says it, in one line, and offers no "Load my latest save" (there is no account to load it for).
    expect(useUIStore().runSaveLoaded).toMatchObject({ from: 'file', noAccount: true });
    const html = await renderHtml(RunSaveNotice);
    expect(html).toContain(NO_ACCOUNT_LINE);
    expect(html).not.toContain('Load my latest save');
  });

  it('the original (unscrubbed) file with no account: its ID is not taken either', async () => {
    setActivePinia(createPinia());
    const none = await load(file(false), '');
    expect(none.ok).toBe(true);
    expect(none.id).toBe('');
    expect(none.keys.follow).toBe('');
  });
});
