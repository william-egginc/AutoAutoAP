/**
 * The target box's draft on Chain Finder > Target TE, "Reach [490] TE as soon as possible" (spec-targette, Jordan 12 Nov
 * 2026): the store's target changes only on Enter or when the box loses focus, never per keystroke (typing 300 must not
 * start three instant answers or three online Setup saves), and always through the store's guard (`commitFinalTE`,
 * chainSearch.finalTE.spec.ts), here with the real store.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { parseTargetTE, useTargetDraft } from './targetTe';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';

beforeEach(() => setActivePinia(createPinia()));

describe('parseTargetTE', () => {
  it('plain digits, spaces around allowed; anything else is NaN (the store refuses it)', () => {
    expect(parseTargetTE('300')).toBe(300);
    expect(parseTargetTE(' 198 ')).toBe(198);
    expect(parseTargetTE('0300')).toBe(300);
    for (const t of ['', ' ', '3.5', '300.0', '-300', '+300', '3e2', 'abc', '30 0', '1234567'])
      expect(parseTargetTE(t), JSON.stringify(t)).toBeNaN();
  });
});

function setup(start = 490, te = 197) {
  const iss = useInitialStateStore();
  iss.initialTeEarned = { ...iss.initialTeEarned, curiosity: te } as typeof iss.initialTeEarned;
  const store = useChainSearchStore();
  store.finalTE = start;
  const commit = vi.fn((n: number) => store.commitFinalTE(n));
  const d = useTargetDraft({ current: () => store.finalTE, commit });
  return { store, commit, d };
}

describe('useTargetDraft: commit on Enter or leaving the box, not per keystroke', () => {
  it('typing 3, 30, 300 commits nothing; the commit sets 300 once', () => {
    const { store, commit, d } = setup();
    for (const t of ['3', '30', '300']) d.onInput(t);
    expect(commit).not.toHaveBeenCalled();
    expect(store.finalTE).toBe(490);
    expect(d.commit()).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(store.finalTE).toBe(300);
    // Enter, then the box losing focus: the second commit does nothing.
    expect(d.commit()).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(d.draft.value).toBe('300');
    expect(d.error.value).toBe('');
  });
  it("an out-of-range or broken value: no change, the last good value back in the box, the store's words shown", () => {
    for (const bad of ['600', '0', '197', '', 'abc', '12.5']) {
      setActivePinia(createPinia());
      const { store, d } = setup(300);
      d.onInput(bad);
      expect(d.commit()).toBe(false);
      expect(store.finalTE).toBe(300);
      expect(d.draft.value).toBe('300');
      expect(d.error.value).toBe('Pick a target TE above 197, up to 490. Kept 300.');
      // Leaving the box after Enter keeps the words (the box holds the last good value again).
      d.commit();
      expect(d.error.value).not.toBe('');
      // Typing again clears them.
      d.onInput('4');
      expect(d.error.value).toBe('');
    }
  });
  it('a good value after a bad one clears the words', () => {
    const { store, d } = setup();
    d.onInput('600');
    d.commit();
    d.onInput('450');
    d.commit();
    expect(store.finalTE).toBe(450);
    expect(d.error.value).toBe('');
  });
  it('Escape puts the target back', () => {
    const { commit, d } = setup();
    d.onInput('3');
    d.revert();
    expect(d.draft.value).toBe('490');
    expect(commit).not.toHaveBeenCalled();
  });
  it('never changes the target while a search runs (the box going disabled loses focus)', () => {
    const { store, d } = setup();
    d.onInput('300');
    store.isRunning = true;
    expect(d.commit()).toBe(false);
    expect(store.finalTE).toBe(490);
    expect(d.draft.value).toBe('490');
  });
  it('follows a change made elsewhere (More, My runs Open, online Setup)', async () => {
    const { store, d } = setup();
    store.finalTE = 350;
    await nextTick();
    expect(d.draft.value).toBe('350');
  });
});
