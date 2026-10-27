/**
 * stores/answers.ts: the client gets the account's follow key and the collector beside /follow, and does nothing without
 * them. My runs prices a followed route meanwhile with a pricing record read back from online when this browser keeps
 * none of the account's (composables/useNowPage.ts `staleSources`). Placeholder IDs only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { setAnswersFetch, useAnswersStore } from './answers';
import { useFollowStore } from './follow';
import { useChainSearchStore } from './chainSearch';
import type { AnswersFetch } from '@/lib/answersCloud';

let calls: string[];
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
  calls = [];
  const f: AnswersFetch = async url => {
    calls.push(url);
    return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  setAnswersFetch(f);
});
afterEach(() => setAnswersFetch(null));

describe('the answers store', () => {
  it('no key (no account yet): no call', async () => {
    const a = useAnswersStore();
    expect(await a.fallbackFor('target 490')).toBeNull();
    expect(calls).toEqual([]);
  });

  it("the follow key and the collector's /answers; a 404 is quiet and the last call of the page load", async () => {
    const s = useChainSearchStore();
    s.submitUrl = 'https://collector.example/submit';
    const follows = useFollowStore();
    follows.cloudKey = 'b'.repeat(64);
    const a = useAnswersStore();
    expect(await a.fallbackFor('target 490')).toBeNull();
    expect(calls).toEqual([`https://collector.example/answers?k=${'b'.repeat(64)}`]);
    expect(await a.newestAny()).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('My runs reads the records read back as stale pricing only when the account has none here', () => {
    const page = fs.readFileSync(path.resolve(__dirname, '../composables/useNowPage.ts'), 'utf8');
    const stale = page.slice(page.indexOf('function staleSources('), page.indexOf('\n  }\n', page.indexOf('function staleSources(')));
    expect(stale).toContain('cloudPricingRecords(answers.read())');
    expect(stale).toMatch(/const local = readPricingRecords\(\);/);
    expect(stale).toMatch(/local\.some\(r => r\.account === account\.value\) \? local : \[\.\.\.local, \.\.\.cloudPricingRecords\(answers\.read\(\)\)\]/);
    expect(page).toContain('void answers.newestAny();');
  });
});
