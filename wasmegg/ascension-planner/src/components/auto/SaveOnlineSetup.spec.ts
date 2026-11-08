/**
 * Setup › Sharing's "Save online" switch and "Delete everything saved online for this account" (client brief section
 * 4; Jordan, 7 Nov 2026): SaveOnlineSetup.vue, its flow in composables/useForgetEverything.ts.
 *
 *  - The switch: Words' label and line (on / off / off after Delete), this browser's own, live (on by default).
 *  - Delete: only with SYNC_RECORDS on, a collector and an account key. A confirm that names what goes and what stays;
 *    DELETE /forget?k=<key>&all=1; the button disabled while it runs; 200: the counts, then Save online turned OFF on
 *    this device, said so; 404/405 "cannot delete yet", 429 "Try again in <wait>", offline: Try again; nothing local
 *    changes on a failure, and on success only the switch does (cloud empty never clears local data).
 * Server-rendered for the text (no DOM here); the flow through the composable against the fake collector.
 * Placeholder ID only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveOnlineSetup from './SaveOnlineSetup.vue';
import { resetForgetEverything, useForgetEverything } from '@/composables/useForgetEverything';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { SYNC_RECORDS } from '@/lib/syncedRecords';
import { SAVE_ONLINE_KEY, resetSaveOnline, saveOnlineOn, setSaveOnline } from '@/lib/saveOnline';
import { fakeSyncCollector, type FakeSyncCollector } from '@/test/fakeSyncCollector';
import {
  SAVE_ONLINE_LABEL,
  saveOnlineLineOff,
  SAVE_ONLINE_LINE_ON,
  saveOnlineOffAfterDelete,
  syncDeleted,
  SYNC_DELETE_CONFIRM,
  SYNC_DELETE_LABEL,
} from '@/lib/syncWords';
import { SAVE_ONLINE_LINE_ON_NO_SYNC, SYNC_DELETE_STAYS, forgetFailWords, forgetCountsWords } from '@/lib/saveOnlineWords';

const ID = 'EI0000000000000000';
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
let mem: Map<string, string>;
let c: FakeSyncCollector;
let pinia: Pinia;

async function page() {
  pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: c.submitUrl, availability: null, isRunning: false }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.cloudKey).toBe(KEY));
}

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  c = fakeSyncCollector();
  vi.stubGlobal('fetch', c.f);
  resetSaveOnline();
  resetForgetEverything();
  SYNC_RECORDS.enabled = true;
});
afterEach(() => {
  SYNC_RECORDS.enabled = false;
  vi.unstubAllGlobals();
  resetSaveOnline();
});

describe('the switch', () => {
  it("on (the default): Words' label and on line; with the sync off, the line without the sync's records", async () => {
    await page();
    let t = textOf(await renderHtml(SaveOnlineSetup, {}, {}, [pinia]));
    expect(t).toContain(SAVE_ONLINE_LABEL);
    expect(t).toContain(SAVE_ONLINE_LINE_ON);
    SYNC_RECORDS.enabled = false;
    t = textOf(await renderHtml(SaveOnlineSetup, {}, {}, [pinia]));
    expect(t).toContain(SAVE_ONLINE_LINE_ON_NO_SYNC);
    expect(t).not.toContain(SAVE_ONLINE_LINE_ON);
  });
  it('off: the off line; a real checkbox bound to the switch', async () => {
    setSaveOnline(false);
    await page();
    const html = await renderHtml(SaveOnlineSetup, {}, {}, [pinia]);
    expect(textOf(html)).toContain(saveOnlineLineOff());
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*data-testid="save-online-switch"/);
  });
});

describe('Delete everything: who sees it', () => {
  it('only with SYNC_RECORDS on, a collector and an account', async () => {
    await page();
    expect(await renderHtml(SaveOnlineSetup, {}, {}, [pinia])).toContain('data-testid="sync-delete"');
    expect(textOf(await renderHtml(SaveOnlineSetup, {}, {}, [pinia]))).toContain(SYNC_DELETE_LABEL);
    SYNC_RECORDS.enabled = false;
    expect(await renderHtml(SaveOnlineSetup, {}, {}, [pinia])).not.toContain('data-testid="sync-delete"');
  });
});

describe('Delete everything: the flow', () => {
  it('ask: the confirm names what goes and what stays (the Leaderboard, other devices); Keep it: nothing sent', async () => {
    await page();
    const d = useForgetEverything();
    d.ask();
    expect(d.phase.value).toBe('confirm');
    expect(d.confirmLines.value).toEqual([SYNC_DELETE_CONFIRM, SYNC_DELETE_STAYS]);
    expect(SYNC_DELETE_STAYS).toMatch(/Leaderboard/);
    expect(SYNC_DELETE_STAYS).toMatch(/[Oo]ther devices keep their own copy and may save it online again; turn Save online off on them to stop that/);
    d.cancel();
    expect(d.phase.value).toBe('idle');
    // (The follow store's own read of /follow is the only call.)
    expect(c.calls.filter(x => x.url.includes('/forget'))).toEqual([]);
  });

  it('200: one DELETE, disabled while it runs, the counts, then Save online OFF here and said so; local data untouched', async () => {
    await page();
    c.other.set(KEY, { follows: 3, prefs: 2, answers: 2 });
    c.put(KEY, 'override', '0', Date.now(), { removed: true });
    mem.set('aap-follow:somehash', '{"fastest-490":{"chain":[200,490]}}');
    mem.set('auto_planner_te_inputs_v2:x', '{"teEarned":{}}');
    const before = new Map(mem);
    const d = useForgetEverything();
    d.ask();
    const done = d.confirm();
    expect(d.phase.value).toBe('running');
    // Decision b: off before the DELETE goes, so nothing is written back while it is out.
    expect(saveOnlineOn()).toBe(false);
    expect(d.busy.value).toBe(true);
    // A second press while it runs sends nothing more.
    void d.confirm();
    await done;
    expect(c.calls.filter(x => x.method === 'DELETE')).toEqual([{ method: 'DELETE', url: `https://collector.example/forget?k=${KEY}&all=1` }]);
    expect(d.phase.value).toBe('done');
    expect(d.lines.value).toEqual([forgetCountsWords({ follows: 3, prefs: 2, answers: 2, synced: 1 }), syncDeleted()]);
    expect(saveOnlineOn()).toBe(false);
    expect(mem.get(SAVE_ONLINE_KEY)).toBe('0');
    for (const [k, v] of before) expect(mem.get(k), k).toBe(v);
    expect([...mem.keys()].filter(k => !before.has(k))).toEqual([SAVE_ONLINE_KEY]);
    // The switch line then says what Delete did.
    expect(textOf(await renderHtml(SaveOnlineSetup, {}, {}, [pinia]))).toContain(saveOnlineOffAfterDelete());
  });

  it('works with Save online already off (it is not gated by the switch)', async () => {
    setSaveOnline(false);
    await page();
    const d = useForgetEverything();
    d.ask();
    await d.confirm();
    expect(d.phase.value).toBe('done');
    expect(c.calls.filter(x => x.method === 'DELETE')).toHaveLength(1);
  });

  for (const [mode, why, words] of [
    ['old', 'cannot', 'Deleting is not available yet. Nothing was deleted.'],
    ['405', 'cannot', 'Deleting is not available yet. Nothing was deleted.'],
    ['limit', 'limit', 'Too many deletions this hour. Try again in 2 minutes.'],
    ['offline', 'offline', "Couldn't reach the planner's server. Nothing was deleted."],
  ] as const)
    it(`${mode}: says so, Save online off (turned off before the call) and said, nothing else here changes${mode === 'offline' ? ', Try again offered' : ''}`, async () => {
      await page();
      mem.set('aap-follow:somehash', 'x');
      const before = new Map(mem);
      c.state.forgetMode = mode;
      const d = useForgetEverything();
      d.ask();
      await d.confirm();
      expect(d.phase.value).toBe('failed');
      // Decision b (8 Nov 2026): Save online went off before the call and stays off; said so.
      expect(d.lines.value).toEqual([forgetFailWords(why, 120), saveOnlineOffAfterDelete()]);
      expect(forgetFailWords(why, 120)).toBe(words);
      expect(d.canRetry.value).toBe(why === 'offline');
      expect(saveOnlineOn()).toBe(false);
      // Nothing else here changed: only the switch.
      for (const [k, v] of before) expect(mem.get(k), k).toBe(v);
      expect([...mem.keys()].filter(k => !before.has(k))).toEqual([SAVE_ONLINE_KEY]);
    });
});

describe('in Setup', () => {
  it('under Sharing, after the "saved online" notices (YourSetup.vue)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'YourSetup.vue'), 'utf8');
    const sharing = src.indexOf('<h3 class="text-slate-500 label">Sharing</h3>');
    const at = src.indexOf('<SaveOnlineSetup');
    expect(sharing).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(src.indexOf('data-testid="follow-online-unreachable"'));
    expect(at).toBeLessThan(src.indexOf('<!-- More options'));
    expect(src).toContain("import SaveOnlineSetup from './SaveOnlineSetup.vue';");
  });
});
