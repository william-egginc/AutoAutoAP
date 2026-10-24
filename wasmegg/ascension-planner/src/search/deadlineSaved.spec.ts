import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Saved By a date answers, on an in-memory stand-in for `lib/storage/db` (as runLibrary.spec does). */
const store = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: async (partition: string, key: string, value: unknown) => {
    if (value === null) store.delete(`${partition}_${key}`);
    else store.set(`${partition}_${key}`, JSON.parse(JSON.stringify(value)));
  },
  loadMetadata: async (partition: string, key: string) => store.get(`${partition}_${key}`) ?? null,
}));

const { listSavedAnswers, saveAnswer, deleteSavedAnswer, MAX_SAVED_ANSWERS } = await import('./deadlineStore');

const P = 'partition';
const result = (te: number) =>
  ({
    routes: [{ chain: [164, 199, 223, te], reachAt: 0, ascendAt: 0, spare: 3600, legs: [] }],
    byStops: [],
    deadline: 1_800_000_000,
    planStart: 1_790_000_000,
    te: 146,
    step: 1,
    shapes: 1,
    priced: 1,
    stoppedEarly: false,
    ascendNeeded: false,
    lastHi: 276,
    at: 0,
  }) as never;

describe('saved By a date answers', () => {
  beforeEach(() => store.clear());

  it('keeps answers newest first, with a default name when none is given', async () => {
    await saveAnswer(P, result(255), 'first', 1000);
    await saveAnswer(P, result(256), '   ', 2000);
    const list = await listSavedAnswers(P);
    expect(list.map(a => a.label)).toEqual(['Untitled answer', 'first']);
    expect(list[0].result.routes[0].chain.at(-1)).toBe(256);
  });

  it('drops the oldest past the cap, and deletes one by id', async () => {
    for (let i = 0; i < MAX_SAVED_ANSWERS + 3; i++) await saveAnswer(P, result(250), `a${i}`, 1000 + i);
    const list = await listSavedAnswers(P);
    expect(list).toHaveLength(MAX_SAVED_ANSWERS);
    expect(list.at(-1)!.label).toBe('a3');
    await deleteSavedAnswer(P, list[0].id);
    expect((await listSavedAnswers(P)).map(a => a.label)).not.toContain(list[0].label);
  });
});
