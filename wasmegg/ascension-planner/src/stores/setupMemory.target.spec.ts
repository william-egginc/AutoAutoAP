/**
 * The Target TE remembered per account in this browser with the rest of Your setup (spec-targetmemory, 13 Nov 2026;
 * lib/setupMemory.ts group 'target', stores/chainSearch.ts). QA saw it go back to 490 after a reload with the network
 * blocked (Chrome and WebKit): it was only kept in the online Setup. Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChainSearchStore } from './chainSearch';
import { hashID } from '@/lib/storage/db';
import { isDefaultSetup, mergeSetup, parseSetup, sameSetup, setupDefaults, setupKey } from '@/lib/setupMemory';

const A = 'EI1234567890123456';
const B = 'EI9876543210987654';
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
  vi.setSystemTime(new Date('2026-11-13T18:00:00Z'));
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = () => vi.advanceTimersByTime(1000);
const blobOf = async (id: string) => {
  const raw = mem.get(setupKey(await hashID(id)));
  return raw ? JSON.parse(raw) : null;
};
/** A reload: a new page (new stores) on the same localStorage. */
const reload = () => {
  setActivePinia(createPinia());
  return useChainSearchStore();
};
/** A record written before the target was remembered (13 Nov 2026). */
const oldRecord = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    hours: { on: true, from: 9, to: 23, days: [0, 1, 2, 3, 4, 5, 6] },
    holdShifts: false,
    siloTrick: false,
    timeOff: [],
    noPrestige: [],
    firstAscension: 'auto',
    at: 5,
    ...extra,
  });

describe('lib/setupMemory: the target group', () => {
  it('defaults to 490, and a record written before it reads as 490 with everything else kept', () => {
    expect(setupDefaults().target).toBe(490);
    const s = parseSetup(oldRecord(), '2026-11-13')!;
    expect(s).not.toBeNull();
    expect(s.target).toBe(490);
    expect(s.hours).toEqual({ on: true, from: 9, to: 23, days: [0, 1, 2, 3, 4, 5, 6] });
    expect(s.holdShifts).toBe(false);
  });

  it('keeps a whole number 1 to 490; anything else falls back to 490', () => {
    for (const ok of [1, 300, 490]) expect(parseSetup(oldRecord({ target: ok }), '2026-11-13')!.target).toBe(ok);
    for (const bad of [0, -5, 491, 999, 250.5, '300', null, true, Number.NaN])
      expect(parseSetup(oldRecord({ target: bad }), '2026-11-13')!.target).toBe(490);
  });

  it('merge writes it as its own group and keeps it otherwise; a base without it (old) gets 490', () => {
    const m = mergeSetup(setupDefaults(), { target: 300 }, 7);
    expect(m.target).toBe(300);
    expect(mergeSetup(m, { holdShifts: false }, 8).target).toBe(300);
    const { target: _drop, ...old } = setupDefaults();
    expect(mergeSetup(old as never, { holdShifts: false }, 9).target).toBe(490);
  });

  it('a target other than 490 is a non-default setup', () => {
    const m = mergeSetup(setupDefaults(), { target: 300 }, 7);
    expect(sameSetup(m, setupDefaults())).toBe(false);
    expect(isDefaultSetup(m)).toBe(false);
    expect(isDefaultSetup(mergeSetup(setupDefaults(), { target: 490 }, 7))).toBe(true);
  });
});

describe('the store remembers the target per account', () => {
  it('commit 300, reload (same browser, no network): the target is 300', async () => {
    let store = useChainSearchStore();
    await store.loadSetupFor(A);
    expect(store.commitFinalTE(300)).toBe('');
    settle();
    expect((await blobOf(A)).target).toBe(300);
    store = reload();
    expect(store.finalTE).toBe(490);
    await store.loadSetupFor(A);
    expect(store.finalTE).toBe(300);
    expect(store.setupIsRemembered).toBe(true);
  });

  it("another account keeps its own: B starts at 490, and B's target doesn't touch A's", async () => {
    let store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.commitFinalTE(300);
    settle();
    store = reload();
    await store.loadSetupFor(B);
    expect(store.finalTE).toBe(490);
    store.commitFinalTE(350);
    settle();
    await store.loadSetupFor(A);
    expect(store.finalTE).toBe(300);
    await store.loadSetupFor(B);
    expect(store.finalTE).toBe(350);
    // A switch in the same page also goes back to the defaults for an account with nothing remembered.
    store = reload();
    await store.loadSetupFor(A);
    await store.loadSetupFor('EI1111111111111111');
    expect(store.finalTE).toBe(490);
  });

  it('a refused value is never stored, and nothing is written for the default on load', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    settle();
    expect(await blobOf(A)).toBeNull();
    for (const bad of [600, 491, 0, 250.5]) expect(store.commitFinalTE(bad)).not.toBe('');
    settle();
    expect(await blobOf(A)).toBeNull();
    expect(store.finalTE).toBe(490);
    store.commitFinalTE(300);
    store.commitFinalTE(600);
    settle();
    expect((await blobOf(A)).target).toBe(300);
  });

  it('an invalid stored target is ignored (490), the rest of the record still loads', async () => {
    mem.set(setupKey(await hashID(A)), oldRecord({ target: 999 }));
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    expect(store.finalTE).toBe(490);
    expect(store.availableFrom).toBe(9);
    expect(store.deferShifts).toBe(false);
  });

  it('an old record without the target loads as before (490)', async () => {
    mem.set(setupKey(await hashID(A)), oldRecord());
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    expect(store.finalTE).toBe(490);
    expect(store.scheduleEnabled).toBe(true);
    expect(store.availableFrom).toBe(9);
  });

  it("a run's or saved answer's target (muted) is not remembered as the player's", async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.muteSetupMemory(() => (store.finalTE = 250));
    settle();
    expect(await blobOf(A)).toBeNull();
  });

  it('a target restored from online is remembered here too, with its group', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    expect(store.applyOnlineSetup({ finalTE: 320 })).toBe(true);
    expect(store.finalTE).toBe(320);
    settle();
    expect((await blobOf(A)).target).toBe(320);
    const again = reload();
    await again.loadSetupFor(A);
    expect(again.finalTE).toBe(320);
  });

  it('Reset to defaults puts 490 back and forgets it', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.commitFinalTE(300);
    settle();
    store.resetSetupToDefaults();
    settle();
    expect(store.finalTE).toBe(490);
    expect(await blobOf(A)).toBeNull();
  });
});
