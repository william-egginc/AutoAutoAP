/**
 * My runs only with something to show (Jordan, 24 Oct 2026; lib/myRunsShown.ts, composables/useMyRunsShown.ts, App.vue):
 * hidden for an empty account, shown from its first answer (which becomes the follow, lib/followPolicy.ts), from a saved
 * answer or snapshot, a kept result, a saved run, or a board run seen there; never hidden while a search runs, and a
 * player on it when it goes is taken to the Auto Planner. Ids: placeholders only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createPinia, defineStore, setActivePinia } from 'pinia';

const library = { runs: 0, answers: 0 };
vi.mock('@/search/runLibrary', () => ({ listRuns: async () => Array.from({ length: library.runs }, () => ({})) }));
vi.mock('@/search/deadlineStore', () => ({ listSavedAnswers: async () => Array.from({ length: library.answers }, () => ({})) }));

import { markMyRunsSeen, useMyRunsShown } from './useMyRunsShown';
import { MY_RUNS_SEEN_PREFIX, myRunsTab, noteMyRuns } from '@/lib/myRunsShown';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { instantAutoFollowOf } from '@/lib/followPolicy';
import { writeSnapshot } from '@/search/instantSnapshot';
import { recordKeptSearch } from '@/lib/searchPlan';
import { accountOf } from '@/search/runSaves';
import { accountHash } from '@/lib/accountHash';

const ID = 'EI0000000000000000';
const OTHER = 'EI1234567890123456';
let mem: Map<string, string>;

beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.stubGlobal('fetch', async () => {
    throw new Error('nothing is fetched to decide the tab');
  });
  library.runs = 0;
  library.answers = 0;
  setActivePinia(createPinia());
});

function shown(id = ID) {
  const playerId = ref(id);
  const raw = ref<unknown>({ eiUserId: id });
  const scope = effectScope();
  const { content } = scope.run(() => useMyRunsShown({ playerId: () => playerId.value, rawBackup: () => raw.value }))!;
  return { content, playerId, scope };
}
const settled = async (c: { value: string }) => vi.waitFor(() => expect(c.value).not.toBe('unknown'));

describe('the tab rule (myRunsTab)', () => {
  it('empty account: hidden, and a player on it is taken away; something there: shown', () => {
    expect(myRunsTab({ content: 'none', running: false, onIt: false })).toEqual({ shown: false, leave: false });
    expect(myRunsTab({ content: 'none', running: false, onIt: true })).toEqual({ shown: false, leave: true });
    expect(myRunsTab({ content: 'some', running: false, onIt: false })).toEqual({ shown: true, leave: false });
  });
  it('running: shown, empty or not, and never left', () => {
    expect(myRunsTab({ content: 'none', running: true, onIt: false })).toEqual({ shown: true, leave: false });
    expect(myRunsTab({ content: 'none', running: true, onIt: true })).toEqual({ shown: true, leave: false });
  });
  it('still being worked out: kept for a player already on it (a reload of #/myruns), not offered otherwise', () => {
    expect(myRunsTab({ content: 'unknown', running: false, onIt: true })).toEqual({ shown: true, leave: false });
    expect(myRunsTab({ content: 'unknown', running: false, onIt: false })).toEqual({ shown: false, leave: false });
  });
});

describe('what the account has', () => {
  it('empty account: none, and nothing is fetched', async () => {
    const { content, scope } = shown();
    await settled(content);
    expect(content.value).toBe('none');
    scope.stop();
  });

  it('no account: unknown (nothing to decide)', async () => {
    const { content, scope } = shown('');
    await new Promise(r => setTimeout(r, 10));
    expect(content.value).toBe('unknown');
    scope.stop();
  });

  it('the first answer (followed on its own) shows it, and it stays shown once the follow is gone', async () => {
    defineStore('chainSearch', () => ({ submitUrl: '', availability: null }))();
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    const { content, scope } = shown();
    await settled(content);
    expect(content.value).toBe('none');
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    const now = Math.floor(Date.now() / 1000);
    const a = instantAutoFollowOf({ route: { chain: [222, 490], end: now + 86400, endTE: 490 }, at: Date.now(), planStart: now, deadline: null, inTime: true, followed: false, goneAt: 0 })!;
    expect(await follows.autoFollow('fastest-490', a)).toBe(true);
    await vi.waitFor(() => expect(content.value).toBe('some'));
    expect(mem.get(MY_RUNS_SEEN_PREFIX + (await accountHash(ID)))).toBe('1');
    // Remembered: un-following doesn't take the tab away.
    await follows.unfollow('fastest-490');
    noteMyRuns();
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    expect(content.value).toBe('some');
    scope.stop();
  });

  it('an instant answer snapshot of this account shows it; another account\'s doesn\'t', async () => {
    const { content, scope } = shown();
    await settled(content);
    writeSnapshot('k-other', { at: Date.now(), meta: { account: accountOf({ eiUserId: OTHER }), goal: 'target 490', backupTime: 1 } } as never);
    noteMyRuns();
    await new Promise(r => setTimeout(r, 10));
    expect(content.value).toBe('none');
    writeSnapshot('k-mine', { at: Date.now(), meta: { account: accountOf({ eiUserId: ID }), goal: 'target 490', backupTime: 1 } } as never);
    noteMyRuns();
    await vi.waitFor(() => expect(content.value).toBe('some'));
    scope.stop();
  });

  it('a kept Fast result shows it', async () => {
    const { content, scope } = shown();
    await settled(content);
    recordKeptSearch({
      account: accountOf({ eiUserId: ID }),
      goal: 'target 490',
      backupTime: 1_800_000_000,
      search: { level: 'Fast', chain: [222, 490], end: 1_800_100_000, endTE: 490, legs: [], at: Date.now(), planStart: 1_800_000_000 },
    });
    noteMyRuns();
    await vi.waitFor(() => expect(content.value).toBe('some'));
    scope.stop();
  });

  it('a saved run or By a date answer shows it', async () => {
    library.answers = 1;
    const { content, scope } = shown();
    await settled(content);
    expect(content.value).toBe('some');
    scope.stop();
  });

  it('a board run seen on My runs is remembered for the next visit', async () => {
    await markMyRunsSeen(ID);
    const { content, scope } = shown();
    await settled(content);
    expect(content.value).toBe('some');
    scope.stop();
  });

  it('another account loaded: worked out again for it', async () => {
    library.runs = 1;
    const { content, playerId, scope } = shown();
    await settled(content);
    expect(content.value).toBe('some');
    library.runs = 0;
    playerId.value = OTHER;
    await vi.waitFor(() => expect(content.value).toBe('none'));
    scope.stop();
  });
});

describe('App.vue wiring', () => {
  it('both tabs follow myRunsTabShown, which counts a running search', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');
    expect(app).toContain('const myRunsRunning = computed(() => searchActive.value || chainSearchStore.isRunning || chainSearchStore.deadlineRunning);');
    expect(app).toContain("myRunsTab({ content: myRunsContent.value, running: myRunsRunning.value, onIt: plannerTab.value === 'myruns' }).shown");
    expect(app).toContain('...(myRunsTabShown.value');
    expect(app).toContain('v-if="myRunsTabShown"');
  });
});
