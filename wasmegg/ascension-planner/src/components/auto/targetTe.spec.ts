/**
 * The target box on Chain Finder > Target TE, "Reach [490] TE as soon as possible" (spec-targette, Jordan 12 Nov 2026):
 * your TE + 1 up to 490, whole numbers, and the store's target changes only on Enter or when the box loses focus, never
 * per keystroke (typing 300 must not start three instant answers or three online Setup saves).
 */
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { checkTargetTE, targetRange, useTargetDraft, TARGET_TE_MAX } from './targetTe';
import { TARGET_TE_WORDS } from '@/lib/targetTeWords';

describe('targetRange', () => {
  it('your TE + 1 up to 490; a part TE counts as the TE below it', () => {
    expect(TARGET_TE_MAX).toBe(490);
    expect(targetRange(197)).toEqual({ min: 198, max: 490 });
    expect(targetRange(197.9)).toEqual({ min: 198, max: 490 });
  });
  it('no save yet (TE 0, or not a number): from 1', () => {
    expect(targetRange(0)).toEqual({ min: 1, max: 490 });
    expect(targetRange(Number.NaN)).toEqual({ min: 1, max: 490 });
  });
});

describe('checkTargetTE', () => {
  const r = targetRange(197);
  it('takes whole numbers in the range, with spaces around', () => {
    expect(checkTargetTE('300', r)).toBe(300);
    expect(checkTargetTE(' 198 ', r)).toBe(198);
    expect(checkTargetTE('490', r)).toBe(490);
  });
  it('turns down anything else', () => {
    for (const t of ['', ' ', '0', '197', '491', '600', '2000', '3.5', '300.0', '-300', '+300', '3e2', 'abc', '30 0'])
      expect(checkTargetTE(t, r), JSON.stringify(t)).toBeNull();
  });
  it('nothing fits once your TE is 490', () => {
    expect(checkTargetTE('490', targetRange(490))).toBeNull();
  });
});

function setup(start = 490, te = 197) {
  const target = ref(start);
  const running = ref(false);
  const sets: number[] = [];
  const d = useTargetDraft({
    current: () => target.value,
    range: () => targetRange(te),
    running: () => running.value,
    set: n => {
      sets.push(n);
      target.value = n;
    },
  });
  return { target, running, sets, d };
}

describe('useTargetDraft: commit on Enter or leaving the box, not per keystroke', () => {
  it('typing 3, 30, 300 sets nothing; the commit sets 300 once', () => {
    const { sets, d, target } = setup();
    for (const t of ['3', '30', '300']) d.onInput(t);
    expect(sets).toEqual([]);
    expect(target.value).toBe(490);
    expect(d.commit()).toBe(true);
    expect(sets).toEqual([300]);
    // Enter, then the box losing focus: the second commit changes nothing.
    expect(d.commit()).toBe(false);
    expect(sets).toEqual([300]);
    expect(d.draft.value).toBe('300');
    expect(d.error.value).toBe(false);
  });
  it('an out-of-range or broken value: no change, the last good value back in the box, the message on', () => {
    for (const bad of ['600', '0', '', 'abc', '12.5']) {
      const { sets, d } = setup(300);
      d.onInput(bad);
      expect(d.commit()).toBe(false);
      expect(sets).toEqual([]);
      expect(d.draft.value).toBe('300');
      expect(d.error.value).toBe(true);
      // Leaving the box after Enter keeps the message (the box holds the last good value again).
      d.commit();
      expect(d.error.value).toBe(true);
      // Typing again clears it.
      d.onInput('4');
      expect(d.error.value).toBe(false);
    }
  });
  it('a good value after a bad one clears the message', () => {
    const { sets, d } = setup();
    d.onInput('600');
    d.commit();
    d.onInput('450');
    d.commit();
    expect(sets).toEqual([450]);
    expect(d.error.value).toBe(false);
  });
  it('0300 is 300', () => {
    const { sets, d } = setup();
    d.onInput('0300');
    d.commit();
    expect(sets).toEqual([300]);
    expect(d.draft.value).toBe('300');
  });
  it('Escape puts the target back', () => {
    const { sets, d } = setup();
    d.onInput('3');
    d.revert();
    expect(d.draft.value).toBe('490');
    expect(sets).toEqual([]);
  });
  it('never changes the target while a search runs (the box going disabled loses focus)', () => {
    const { sets, d, running } = setup();
    d.onInput('300');
    running.value = true;
    expect(d.commit()).toBe(false);
    expect(sets).toEqual([]);
    expect(d.draft.value).toBe('490');
  });
  it('follows a change made elsewhere (More, My runs Open, online Setup)', async () => {
    const { d, target } = setup();
    target.value = 350;
    await nextTick();
    expect(d.draft.value).toBe('350');
  });
});

describe('the words (DRAFT, Words)', () => {
  it('the message names the range and the value kept', () => {
    expect(TARGET_TE_WORDS.invalid({ min: 198, max: 490 }, 490)).toBe('Type a whole number from 198 to 490. Kept 490.');
    expect(TARGET_TE_WORDS.invalid({ min: 491, max: 490 }, 490)).toBe('Your TE is already 490, so there is no higher target. Kept 490.');
  });
});
