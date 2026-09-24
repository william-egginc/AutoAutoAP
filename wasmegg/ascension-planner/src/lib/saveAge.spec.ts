import { describe, expect, it } from 'vitest';
import { catchUpSeconds, describeSaveAge, siloSeconds } from './saveAge';

const SYNC = 1_790_000_000;
const H = 3600;

describe('catching a save up to the plan start', () => {
  it('credits the whole gap while the silos hold it', () => {
    expect(catchUpSeconds(SYNC, SYNC + 5 * H, 12 * H)).toBe(5 * H);
  });

  it('stops at what the silos hold, as the game does', () => {
    expect(catchUpSeconds(SYNC, SYNC + 30 * H, 12 * H)).toBe(12 * H);
  });

  it('credits nothing for a start before the sync, or for a simulation offset instead of a timestamp', () => {
    expect(catchUpSeconds(SYNC, SYNC - H, 12 * H)).toBe(0);
    expect(catchUpSeconds(5000, 9000, 12 * H)).toBe(0);
  });

  it('reads silo time from silos and Silo Capacity research', () => {
    expect(siloSeconds(10, 20)).toBeGreaterThan(siloSeconds(10, 0));
    expect(siloSeconds(0, 0)).toBe(siloSeconds(1, 0)); // a farm always has one silo
  });
});

describe('what the player is told', () => {
  it('is quiet-good at the sync, and plain about a caught-up gap inside the silos', () => {
    expect(describeSaveAge(SYNC, SYNC + 60, 12 * H)?.level).toBe('ok');
    const note = describeSaveAge(SYNC, SYNC + 5 * H, 12 * H)!;
    expect(note.level).toBe('ok');
    expect(note.text).toMatch(/5h old/);
    expect(note.text).toMatch(/caught up/);
  });

  it('warns when the save is older than the silos hold: the sync is old or something was missed', () => {
    const note = describeSaveAge(SYNC, SYNC + 40 * H, 12 * H)!;
    expect(note.level).toBe('warning');
    expect(note.text).toMatch(/40h old, longer than your silos hold/);
    expect(note.text).toMatch(/something was missed/);
  });

  it('does not talk about silos for a save with no virtue farm, since nothing is caught up', () => {
    const note = describeSaveAge(SYNC, SYNC + 72 * H, 3 * H, false)!;
    expect(note.level).toBe('ok');
    expect(note.text).toMatch(/nothing to catch up/);
    expect(note.text).not.toMatch(/silos/);
  });

  it('says nothing without a save to compare with', () => {
    expect(describeSaveAge(null, SYNC, 12 * H)).toBeNull();
    expect(describeSaveAge(0, SYNC, 12 * H)).toBeNull();
  });
});
