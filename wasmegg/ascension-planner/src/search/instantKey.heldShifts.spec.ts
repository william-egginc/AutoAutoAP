/**
 * The instant answer's key and held shifts (code review 22 Nov 2026, math-fast-3): an answer worked out inside the
 * hours without held shifts ("Make them wait too" off) is not the answer with them. Keyed only when the hours are used
 * and held shifts are off, so every answer saved with them (the default) keeps its key. Both callers pass it, and the
 * instant answer works the answer out again when held shifts, no-prestige days or the silo trick change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { instantKey, type InstantKeyInput } from './instantSnapshot';

const base: InstantKeyInput = {
  playerId: 'p',
  deadline: null,
  finalTE: 313,
  currentTE: 197,
  eggsDelivered: {},
  artifacts: [],
  stones: [],
  epic: {},
  availability: null,
  timeOff: [],
  milestones: [],
  firstAscension: 'auto',
  useHours: true,
  maxAscensions: null,
};

describe('instantKey and held shifts', () => {
  it('held (or not said) leaves every key as it was', () => {
    expect(instantKey({ ...base, holdShifts: true })).toBe(instantKey(base));
  });
  it('not held, with the hours used, is a different key', () => {
    expect(instantKey({ ...base, holdShifts: false })).not.toBe(instantKey(base));
  });
  it('not held without the hours used changes nothing (the hours hold nothing then)', () => {
    const off = { ...base, useHours: false };
    expect(instantKey({ ...off, holdShifts: false })).toBe(instantKey(off));
  });
});

describe('the callers', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  it('the instant answer and My Runs pass held shifts', () => {
    for (const src of [read('../components/auto/InstantRoute.vue'), read('../composables/useNowPage.ts')]) {
      const at = src.indexOf('instantKey({');
      expect(src.slice(at, at + 1200)).toMatch(/holdShifts: !!store\.deferShifts/);
    }
  });
  it('the instant answer works it out again when held shifts, no-prestige days or the silo trick change', () => {
    const src = read('../components/auto/InstantRoute.vue');
    const at = src.indexOf('answerInputsKey([');
    const body = src.slice(at, at + 1600);
    expect(body).toMatch(/useHours\.value \? !!store\.deferShifts : ''/);
    expect(body).toMatch(/JSON\.stringify\(usableTimeOff\(store\.noPrestige\)\.map\(w => \[w\.from, w\.to\]\)\)/);
    expect(body).toMatch(/!!store\.siloTrick/);
  });
});
