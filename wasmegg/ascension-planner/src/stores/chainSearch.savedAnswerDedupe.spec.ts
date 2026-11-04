/**
 * Saved answers keep one entry per answer (Jordan, 29 Oct 2026: "249 TE by Jul 14, 2027" listed twice after
 * pressing the card's Save answer and Save this answer below it). Saving the same answer again (same date, same
 * route, same save) refreshes the entry already there instead of adding one; duplicates already stored collapse
 * when the list is read; and both buttons say the answer on screen is saved. Fixed clock, placeholder data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const { useChainSearchStore } = await import('./chainSearch');
const { saveAnswer, listSavedAnswers } = await import('@/search/deadlineStore');
const { hashID } = await import('@/lib/storage/db');
const { screenGoalKey } = await import('@/lib/follow');
const { renderHtml, textOf } = await import('@/test/renderComponent');
const SavedAnswers = (await import('@/components/auto/SavedAnswers.vue')).default;
const ByDateRouteCard = (await import('@/components/auto/ByDateRouteCard.vue')).default;

/** See chainSearch.seed.spec.ts: the actions store reads localStorage the moment it exists. */
function installStorageStub(): void {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, String(value)),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  });
}

const PLAYER = 'EI1234567890123456';
const T0 = Date.UTC(2026, 9, 29, 22, 51); // Oct 29, 2026, 10:51 PM UTC
const BACKUP = Math.floor(T0 / 1000) - 3 * 3600;
const DEADLINE = 1_815_660_000; // Jul 14, 2027, 10:00 AM UTC

function answer(over: { chain?: number[]; deadline?: number; backupAt?: number } = {}) {
  const chain = over.chain ?? [166, 198, 222, 249];
  return {
    routes: [{ chain, reachAt: DEADLINE - 3600, ascendAt: DEADLINE - 3600, spare: 3600, legs: [] }],
    byStops: [],
    deadline: over.deadline ?? DEADLINE,
    planStart: BACKUP,
    te: 150,
    step: 1,
    shapes: 1,
    priced: 1,
    stoppedEarly: false,
    ascendNeeded: false,
    lastHi: 260,
    at: T0,
    backupAt: over.backupAt ?? BACKUP,
  } as never;
}

function at(ms: number): void {
  vi.setSystemTime(ms);
}

describe('Saved answers: one entry per answer', () => {
  beforeEach(() => {
    db.clear();
    installStorageStub();
    vi.useFakeTimers({ toFake: ['Date'] });
    at(T0);
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Following is per goal and route (stores/follow.ts `isFollowed(goalKey, chain)`, FollowButton.vue), not per entry: the
  // entry left must name the same goal and route, so its Following ✓ reads the same as before.
  it('the card’s Save answer then Save this answer: one entry, its time refreshed, still followed', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer();
    // The card's quick save (DeadlinePanel `quickSave`): the default name.
    await store.saveCurrentAnswer(PLAYER, '249 TE by Jul 14, 2027, 10:00 AM');
    expect(store.savedAnswers).toHaveLength(1);
    const followKeyOf = (a: (typeof store.savedAnswers)[number]) =>
      `${screenGoalKey(a.result.deadline, a.result.te, T0)}|${a.result.routes[0].chain.join(' ')}`;
    const followedBefore = followKeyOf(store.savedAnswers[0]);

    at(T0 + 60_000);
    // Save this answer below, with the name box left empty.
    await store.saveCurrentAnswer(PLAYER, '249 TE by Jul 14, 2027, 10:00 AM');
    expect(store.savedAnswers).toHaveLength(1);
    expect(store.savedAnswers[0].savedAt).toBe(T0 + 60_000);
    expect(await listSavedAnswers(await hashID(PLAYER))).toHaveLength(1);
    expect(followKeyOf(store.savedAnswers[0])).toBe(followedBefore);
  });

  it('a re-save keeps the name it has unless a new one is typed', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer();
    await store.saveCurrentAnswer(PLAYER, 'Placeholder plan', true);
    at(T0 + 60_000);
    expect(await store.saveCurrentAnswer(PLAYER, '249 TE by Jul 14, 2027, 10:00 AM')).toBe('Placeholder plan');
    expect(store.savedAnswers.map(a => a.label)).toEqual(['Placeholder plan']);
    at(T0 + 120_000);
    await store.saveCurrentAnswer(PLAYER, 'Renamed plan', true);
    expect(store.savedAnswers.map(a => a.label)).toEqual(['Renamed plan']);
  });

  it('a different route, date or save stays a separate entry', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer();
    await store.saveCurrentAnswer(PLAYER, 'a');
    store.deadlineResult = answer({ chain: [166, 199, 222, 249] });
    await store.saveCurrentAnswer(PLAYER, 'b');
    store.deadlineResult = answer({ deadline: DEADLINE + 86400 });
    await store.saveCurrentAnswer(PLAYER, 'c');
    store.deadlineResult = answer({ backupAt: BACKUP + 3600 });
    await store.saveCurrentAnswer(PLAYER, 'd');
    expect(store.savedAnswers).toHaveLength(4);
  });

  it('duplicates already stored collapse when the list is read, keeping the first saved', async () => {
    const hash = await hashID(PLAYER);
    await saveAnswer(hash, answer(), 'first', T0);
    await saveAnswer(hash, answer({ chain: [166, 199, 222, 249] }), 'other', T0 + 1000);
    await saveAnswer(hash, answer(), 'again', T0 + 2000);
    expect(await listSavedAnswers(hash)).toHaveLength(3);

    const store = useChainSearchStore();
    await store.refreshSavedAnswers(PLAYER);
    expect(store.savedAnswers.map(a => a.label).sort()).toEqual(['first', 'other']);
    expect(await listSavedAnswers(hash)).toHaveLength(2);
  });

  it('a save collapses stored duplicates of the same answer too', async () => {
    const hash = await hashID(PLAYER);
    await saveAnswer(hash, answer(), 'first', T0);
    await saveAnswer(hash, answer(), 'again', T0 + 1000);
    const store = useChainSearchStore();
    store.deadlineResult = answer();
    at(T0 + 5000);
    await store.saveCurrentAnswer(PLAYER, '249 TE by Jul 14, 2027, 10:00 AM');
    expect(store.savedAnswers).toHaveLength(1);
    expect(store.savedAnswers[0]).toMatchObject({ label: 'first', savedAt: T0 + 5000 });
  });

  it('both save buttons say Saved once the answer on screen is saved, and not for a new one', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer();
    expect(store.currentAnswerSaved).toBe(false);
    await store.saveCurrentAnswer(PLAYER, '249 TE by Jul 14, 2027, 10:00 AM');
    expect(store.currentAnswerSaved).toBe(true);

    const pinia = (await import('pinia')).getActivePinia()!;
    const below = textOf(
      await renderHtml(SavedAnswers, { playerId: PLAYER, defaultLabel: '249 TE by Jul 14, 2027, 10:00 AM', zone: 'UTC' }, {}, [
        pinia,
      ])
    );
    expect(below).toContain('Saved ✓');
    expect(below).not.toContain('Save this answer');
    const card = textOf(
      await renderHtml(ByDateRouteCard, {
        route: (answer() as { routes: unknown[] }).routes[0],
        deadline: DEADLINE,
        zone: 'UTC',
        canSave: true,
        saved: store.currentAnswerSaved,
      })
    );
    expect(card).toContain('Saved ✓');
    expect(card).not.toContain('Save answer');

    store.deadlineResult = answer({ chain: [166, 199, 222, 249] });
    expect(store.currentAnswerSaved).toBe(false);
  });
});
