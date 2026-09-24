/**
 * The pool-size rules. Small, and worth pinning: `clampPoolSize` is the only thing standing between
 * a typed number and how many workers a machine is asked to run.
 */
import { describe, expect, it } from 'vitest';
import { clampPoolSize, maxPoolSize, targetWorkerCount } from './batch';

describe('clampPoolSize', () => {
  const withCores = (cores: number | undefined, run: () => void) => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'hardwareConcurrency');
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { value: cores, configurable: true });
    try {
      run();
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', original);
    }
  };

  it('allows every core, not cores minus one', () => {
    // Leaving one for the main thread is the default, not a ceiling: someone giving a machine over
    // to an overnight run should be able to spend the last core.
    withCores(20, () => {
      expect(maxPoolSize()).toBe(19);
      expect(clampPoolSize(20)).toBe(20);
    });
  });

  it('refuses to exceed the core count, where there is nothing left to buy', () => {
    withCores(8, () => expect(clampPoolSize(64)).toBe(8));
  });

  it('never returns less than one worker', () => {
    withCores(8, () => {
      expect(clampPoolSize(0)).toBe(1);
      expect(clampPoolSize(-5)).toBe(1);
    });
  });

  it('falls back to the default rather than NaN', () => {
    withCores(8, () => expect(clampPoolSize(Number.NaN)).toBe(7));
  });

  it('floors a fractional request instead of spawning a fraction of a worker', () => {
    withCores(8, () => expect(clampPoolSize(3.9)).toBe(3));
  });
});

describe('targetWorkerCount', () => {
  it('uses the full budget in front, and when no background count is set', () => {
    expect(targetWorkerCount(9, 2, false)).toBe(9);
    expect(targetWorkerCount(9, 0, true)).toBe(9);
  });
  it('drops to the background count while hidden', () => {
    expect(targetWorkerCount(9, 2, true)).toBe(2);
  });
  it('never goes above the budget, even if the remembered background count is larger', () => {
    expect(targetWorkerCount(3, 4, true)).toBe(3);
  });
});
