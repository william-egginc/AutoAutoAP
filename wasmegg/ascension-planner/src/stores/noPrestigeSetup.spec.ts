/**
 * No prestige on these days, in Your setup (search/noPrestige.ts; lib/setupMemory.ts): stored per account like time
 * off, whole local dates, none by default, ended stretches dropped on read, and the three kinds of "not now" each
 * named in their own words in the Setup panel and the explanations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChainSearchStore } from './chainSearch';
import { hashID } from '@/lib/storage/db';
import { isDefaultSetup, mergeSetup, parseSetup, sameSetup, setupDefaults, setupKey } from '@/lib/setupMemory';

const A = 'EI1234567890123456';
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

describe('the no-prestige days, stored', () => {
  it('none by default', () => {
    expect(setupDefaults().noPrestige).toEqual([]);
    expect(useChainSearchStore().noPrestige).toEqual([]);
  });

  it('a blob from before (no field) reads as none, and is still the defaults', () => {
    const old = JSON.stringify({ v: 1, ...setupDefaults(), noPrestige: undefined, at: 1 });
    const p = parseSetup(old, '2026-10-15')!;
    expect(p.noPrestige).toEqual([]);
    expect(isDefaultSetup(p)).toBe(true);
  });

  it('parsed like time off: bad rows dropped, ended stretches dropped', () => {
    const raw = JSON.stringify({
      v: 1,
      ...setupDefaults(),
      noPrestige: [
        { from: '2026-10-01', to: '2026-10-02' },
        { from: '2026-10-20', to: '2026-10-21' },
        { from: 'soon', to: '2026-10-21' },
        null,
      ],
      at: 1,
    });
    expect(parseSetup(raw, '2026-10-15')!.noPrestige).toEqual([{ from: '2026-10-20', to: '2026-10-21' }]);
  });

  it('a group of its own: merging it leaves time off alone, and it makes the setup differ', () => {
    const base = { ...setupDefaults(), timeOff: [{ from: '2027-07-14', to: '2027-07-14' }] };
    const m = mergeSetup(base, { noPrestige: [{ from: '2026-10-20', to: '2026-10-20' }] }, 5);
    expect(m.timeOff).toEqual(base.timeOff);
    expect(m.noPrestige).toEqual([{ from: '2026-10-20', to: '2026-10-20' }]);
    expect(sameSetup(m, base)).toBe(false);
    expect(isDefaultSetup(m)).toBe(false);
  });

  it("the player's edit is remembered under the account's hash, and comes back on load", async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    store.noPrestige.push({ from: '2026-10-20', to: '2026-10-21' });
    vi.advanceTimersByTime(1000);
    const raw = mem.get(setupKey(await hashID(A)));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain(A);
    expect(JSON.parse(raw!).noPrestige).toEqual([{ from: '2026-10-20', to: '2026-10-21' }]);
    expect(JSON.parse(raw!).timeOff).toEqual([]);

    setActivePinia(createPinia());
    const again = useChainSearchStore();
    await again.loadSetupFor(A);
    expect(again.noPrestige).toEqual([{ from: '2026-10-20', to: '2026-10-21' }]);
    again.resetSetupToDefaults();
    expect(again.noPrestige).toEqual([]);
  });
});

describe('the three kinds of "not now", in the player\'s words', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

  it('Your setup names all three, each its own thing', () => {
    const setup = read('components/auto/YourSetup.vue');
    expect(setup).toContain('Awake hours:</span> no shifts outside them');
    expect(setup).toContain('No prestige on these days:</span> stay on virtue; a prestige waits for the');
    expect(setup).toContain('Away from virtue (time off):</span> go to the home farm, and rebuild when');
    expect(setup).toContain('<TimeOffEditor kind="noPrestige" />');
  });

  it('the day picker has a title and an explanation for each kind', () => {
    const editor = read('components/auto/TimeOffEditor.vue');
    expect(editor).toContain("title: 'Away from virtue (time off)'");
    expect(editor).toContain("title: 'No prestige on these days'");
    expect(editor).toContain('Egg shifts still happen on these days.');
    expect(editor).toContain('Going to the home farm is a prestige');
  });

  it('How it works no longer calls time off a wait, and the About page names away from virtue', () => {
    const how = read('components/science/HowItWorks.vue');
    expect(how).not.toContain('Time off is\n          planned the same way');
    expect(how).toContain('<b>Away from virtue (time off)</b> is different');
    expect(how).toContain('<b>No prestige on these days</b>');
    const about = fs.readFileSync(path.resolve(__dirname, '../../public/about.html'), 'utf8');
    expect(about).toContain('away from virtue (time off)');
  });
});
