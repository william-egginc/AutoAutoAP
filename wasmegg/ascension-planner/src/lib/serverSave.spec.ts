/**
 * The save on the server versus the save loaded here (lib/serverSave.ts): a quiet check once per page load per
 * account, with a fake request (no network). Placeholder IDs only; none may reach a stored or logged string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ei } from 'lib';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import { useInitialStateStore } from '@/stores/initialState';
import { saveStrip } from './saveFreshness';
import {
  NEWER_ON_SERVER,
  QUIET_CHECK_MIN_AGE_S,
  WHY_OUT_OF_DATE,
  checkServerQuietly,
  newestOnServerLine,
  noteServerSave,
  resetServerSaveChecks,
  serverSaveFor,
  serverSaveState,
} from './serverSave';

const ID = 'EI0000000000000001';
const ID2 = 'EI0000000000000002';
const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 25, 4, 9) / 1000; // Oct 24, 10:09 PM Denver
const H = 3600;
const LOADED = NOW - 12 * H;

/** A fake hash: never the ID itself. */
const hash = async (id: string) => `hash-${id.slice(-1)}`;
const reply = (t: number): ei.IEggIncFirstContactResponse => ({ backup: { approxTime: t, settings: { lastBackupTime: t }, game: {} } }) as never;
function fakeRequest(t: number | Error) {
  return vi.fn(async (_id: string) => {
    if (t instanceof Error) throw t;
    return reply(t);
  });
}
const check = (request: ReturnType<typeof fakeRequest>, o: { loaded?: number; online?: boolean; id?: string } = {}) =>
  checkServerQuietly(o.id ?? ID, o.loaded ?? LOADED, { nowSeconds: NOW, online: o.online ?? true, request, hash });

beforeEach(() => {
  resetServerSaveChecks();
  setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('the quiet server check', () => {
  it('a newer save on the server: offered, never loaded', async () => {
    const request = fakeRequest(NOW - 5 * 60);
    expect(await check(request)).toBe('checked');
    expect(request).toHaveBeenCalledTimes(1);
    const known = serverSaveFor(await hash(ID));
    expect(known).toEqual({ checkedAt: NOW, serverBackupTime: NOW - 5 * 60 });
    expect(serverSaveState(LOADED, known)).toEqual({ kind: 'newer', serverSeconds: NOW - 5 * 60 });
  });

  it('the same save on the server: the loaded one is the newest', async () => {
    await check(fakeRequest(LOADED));
    expect(serverSaveState(LOADED, serverSaveFor(await hash(ID)))).toEqual({ kind: 'newest', serverSeconds: LOADED });
  });

  it('an older save on the server (a run’s own save loaded): still the newest, nothing offered', async () => {
    await check(fakeRequest(LOADED - 2 * H));
    expect(serverSaveState(LOADED, serverSaveFor(await hash(ID))).kind).toBe('newest');
  });

  it('a failed check says nothing new and never throws', async () => {
    const err = vi.spyOn(console, 'error');
    expect(await check(fakeRequest(new Error('HTTP 503')))).toBe('failed');
    const known = serverSaveFor(await hash(ID));
    expect(known).toEqual({ checkedAt: NOW, serverBackupTime: 0 });
    expect(serverSaveState(LOADED, known)).toEqual({ kind: 'unknown' });
    expect(err).not.toHaveBeenCalled();
  });

  it('once per page load per account', async () => {
    const request = fakeRequest(LOADED);
    await check(request);
    await check(request);
    await check(request, { loaded: LOADED - H });
    expect(request).toHaveBeenCalledTimes(1);
    // Another account is asked about once too.
    await check(request, { id: ID2 });
    await check(request, { id: ID2 });
    expect(request).toHaveBeenCalledTimes(2);
    // A reload (here: the reset) asks again.
    resetServerSaveChecks();
    await check(request);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('a save this page loaded counts: no request', async () => {
    noteServerSave(await hash(ID), reply(LOADED).backup, NOW);
    const request = fakeRequest(NOW);
    expect(await check(request)).toBe('skipped');
    expect(request).not.toHaveBeenCalled();
    expect(serverSaveState(LOADED, serverSaveFor(await hash(ID))).kind).toBe('newest');
  });

  it('never replaces the loaded save', async () => {
    const store = useInitialStateStore();
    const mine = reply(LOADED).backup!;
    store.rawBackup = mine;
    await check(fakeRequest(NOW - 60));
    expect(store.rawBackup).toEqual(reply(LOADED).backup);
    expect(store.rawBackup?.settings?.lastBackupTime).toBe(LOADED);
  });

  it('skipped under 10 minutes old, offline, or without a player ID or a save', async () => {
    expect(QUIET_CHECK_MIN_AGE_S).toBe(600);
    const request = fakeRequest(NOW);
    expect(await check(request, { loaded: NOW - 9 * 60 })).toBe('skipped');
    expect(await check(request, { online: false })).toBe('skipped');
    expect(await check(request, { id: '' })).toBe('skipped');
    expect(await check(request, { loaded: 0 })).toBe('skipped');
    expect(request).not.toHaveBeenCalled();
    // A skip doesn't use up the one check.
    expect(await check(request)).toBe('checked');
  });

  it('no player ID in anything stored or logged', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(k => vi.spyOn(console, k));
    await check(fakeRequest(NOW - 60));
    await check(fakeRequest(new Error(`HTTP 500 for ${ID2}`)), { id: ID2 });
    noteServerSave(await hash(ID), reply(NOW).backup, NOW);
    const stored = JSON.stringify([serverSaveFor(await hash(ID)), serverSaveFor(await hash(ID2))]);
    expect(stored).not.toMatch(/EI\d{16}/);
    expect(Object.keys(serverSaveFor(await hash(ID))!).sort()).toEqual(['checkedAt', 'serverBackupTime']);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe('the save strip with the server’s answer', () => {
  const strip = saveStrip(LOADED, NOW, ZONE);

  it('newer on the server: a Load it button', async () => {
    const html = await renderHtml(SaveAgeStrip, { strip, loading: false, server: { kind: 'newer', serverSeconds: NOW - 300 }, now: NOW });
    expect(textOf(html)).toBe(`Your save is from Oct 24 at 10:09 AM (12 h ago). Times below may have drifted. ${NEWER_ON_SERVER} ›`);
    expect(html).toContain('data-testid="now-save-fresh"');
  });

  it('the newest on the server: no reload, the reason, and the tip', async () => {
    const html = await renderHtml(SaveAgeStrip, { strip, loading: false, server: { kind: 'newest', serverSeconds: LOADED }, now: NOW });
    const t = textOf(html);
    expect(t).toContain('This is the newest save on the server (synced 12 h ago). Open the game to update it.');
    expect(t).toContain(WHY_OUT_OF_DATE.summary);
    expect(t).toContain('Force close the game and open it again so it syncs');
    expect(t).not.toContain('Load a fresh save');
    expect(html).not.toContain('data-testid="now-save-fresh"');
    expect(html).toMatch(/<details[^>]*data-testid="now-save-why"/);
    expect(newestOnServerLine(NOW - 30, NOW)).toContain('(synced just now)');
  });

  it('not known (or failed): as before', async () => {
    const html = await renderHtml(SaveAgeStrip, { strip, loading: false, server: { kind: 'unknown' }, now: NOW });
    expect(textOf(html)).toContain('Load a fresh save ›');
  });
});
