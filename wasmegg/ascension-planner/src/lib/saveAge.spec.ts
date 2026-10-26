import { describe, expect, it } from 'vitest';
import { ageAgo, ageWords, catchUpSeconds, describeSaveAge, siloSeconds } from './saveAge';

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
    // No age: Setup's save card says it once (ux review 26 Oct, row 19: "Your save is 42m old" beside it).
    expect(note.text).not.toMatch(/\bold\b/);
    expect(note.text).toMatch(/caught up from your save to the plan start/);
  });

  it('warns in red when the save is older than the silos hold: the answers are off, so force a sync', () => {
    const note = describeSaveAge(SYNC, SYNC + 40 * H, 12 * H)!;
    expect(note.level).toBe('warning');
    expect(note.severe).toBe(true);
    expect(note.text).toMatch(/Your save is 40 h old, longer than your silos hold/);
    expect(note.text).toMatch(/won't be accurate/);
    expect(note.text).toMatch(/Force a sync/);
  });

  it('does not talk about silos for a save with no virtue farm, since nothing is caught up', () => {
    const note = describeSaveAge(SYNC, SYNC + 72 * H, 3 * H, false)!;
    expect(note.level).toBe('ok');
    expect(note.text).toMatch(/nothing to catch up/);
    expect(note.text).not.toMatch(/silos/);
    expect(note.text).not.toMatch(/\bold\b/);
  });

  it('a stale save in days, as everywhere else ("25 days old", never "25d old")', () => {
    expect(describeSaveAge(SYNC, SYNC + 25 * 24 * H, 12 * H)!.text).toMatch(/^Your save is 25 days old, longer/);
    expect(describeSaveAge(SYNC + 42 * 60, SYNC, 12 * H)!.text).toMatch(/^Starts 42 min before your last sync/);
  });

  it('says nothing without a save to compare with', () => {
    expect(describeSaveAge(null, SYNC, 12 * H)).toBeNull();
    expect(describeSaveAge(0, SYNC, 12 * H)).toBeNull();
  });
});

describe('one age style (ux review 26 Oct, row 19)', () => {
  it('14 min, 5 h, 25 days; "ago" with just now under a minute', () => {
    expect(ageWords(30)).toBe('under a minute');
    expect(ageWords(14 * 60)).toBe('14 min');
    expect(ageWords(59.7 * 60)).toBe('1 h');
    expect(ageWords(5 * H)).toBe('5 h');
    expect(ageWords(47 * H)).toBe('47 h');
    expect(ageWords(25 * 24 * H + 5 * H)).toBe('25 days');
    expect(ageWords(-3 * H)).toBe('3 h');
    expect(ageAgo(20)).toBe('just now');
    expect(ageAgo(14 * 60)).toBe('14 min ago');
    expect(ageAgo(3 * 24 * H)).toBe('3 days ago');
  });
});
