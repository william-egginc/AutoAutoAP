import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from './actionTypes';
import { knownActionTypes } from './executor';

describe('ACTION_TYPES', () => {
  it('is exactly the executor registry', () => {
    expect([...ACTION_TYPES].sort()).toEqual(knownActionTypes().sort());
  });
});
