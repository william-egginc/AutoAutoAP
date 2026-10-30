/**
 * The one save-age banner (spec-saveage, 29 Oct 2026): one helper (`saveState`) for both clocks, Jordan's thresholds.
 *
 *   S = the virtue farm's silo time (3 h to 30 h; the smallest, 3 h, when the save doesn't say).
 *   Two clocks: the save's age (now - lastBackupTime) and the silo time used (now - the virtue farm's lastStepTime).
 *   GREEN under 50% of S on both; YELLOW from 50% (never before 1 h); RED with 10% of S or less left (90% used).
 *   No virtue farm: the save's age alone, against the same S. The tone is the worse of the two clocks.
 *   Past 24 h old, a "sync your game" line in any tone (not a tone of its own).
 *
 * Fixed clock (vi.setSystemTime), fixtures relative to it, placeholder data only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  RED_FRACTION,
  SMALLEST_SILO_SECONDS,
  SYNC_AFTER_SECONDS,
  TONE_FLOOR_SECONDS,
  YELLOW_FRACTION,
  backupSecondsOf,
  saveClockOf,
  saveState,
  type SaveStateInput,
} from './saveFreshness';
import { siloSeconds } from './saveAge';

const ZONE = 'America/Denver';
const FIXED = Date.UTC(2026, 9, 15, 23, 36); // Oct 15, 5:36 PM Denver
const H = 3600;
let NOW = 0;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED);
  NOW = Math.floor(Date.now() / 1000);
});
afterAll(() => vi.useRealTimers());

/** A save `saveAge` old whose virtue farm last ran `used` ago, with silos holding `silo`. */
function at(used: number, o: Partial<SaveStateInput> & { saveAge?: number; silo?: number | null } = {}) {
  const saveAge = o.saveAge ?? used;
  return saveState({
    backupSeconds: NOW - saveAge,
    farmStepSeconds: NOW - used,
    siloSeconds: o.silo === undefined ? 24 * H : o.silo,
    siloCount: 8,
    hasVirtueFarm: true,
    nowSeconds: NOW,
    zone: ZONE,
    ...o,
  })!;
}

describe('the thresholds', () => {
  it('are Jordan’s: 50%, 90%, a 1 h floor, sync past 24 h, the smallest silos 3 h', () => {
    expect(YELLOW_FRACTION).toBe(0.5);
    expect(RED_FRACTION).toBe(0.9);
    expect(TONE_FLOOR_SECONDS).toBe(H);
    expect(SYNC_AFTER_SECONDS).toBe(24 * H);
    expect(SMALLEST_SILO_SECONDS).toBe(3 * H);
    expect(siloSeconds(1, 20)).toBe(3 * H);
    expect(siloSeconds(10, 20)).toBe(30 * H);
  });

  // [silo time S, silo time used, tone]
  const table: [number, number, 'green' | 'yellow' | 'red'][] = [
    // S = 24 h: yellow at 12 h, red at 21.6 h used (2.4 h left).
    [24 * H, 0, 'green'],
    [24 * H, 11.9 * H, 'green'],
    [24 * H, 12 * H - 1, 'green'],
    [24 * H, 12 * H, 'yellow'],
    [24 * H, 21.6 * H - 1, 'yellow'],
    [24 * H, 21.6 * H, 'red'],
    [24 * H, 24 * H, 'red'],
    [24 * H, 40 * H, 'red'],
    // S = 3 h (one silo): yellow at 1.5 h (the 1 h floor doesn't bite), red at 2.7 h.
    [3 * H, 1.5 * H - 1, 'green'],
    [3 * H, 1.5 * H, 'yellow'],
    [3 * H, 2.7 * H - 1, 'yellow'],
    [3 * H, 2.7 * H, 'red'],
    // S = 30 h (ten silos): yellow at 15 h, red at 27 h.
    [30 * H, 15 * H - 1, 'green'],
    [30 * H, 15 * H, 'yellow'],
    [30 * H, 27 * H - 1, 'yellow'],
    [30 * H, 27 * H, 'red'],
    // A small S (one silo, little research): the floor holds yellow (and red) back to 1 h.
    [1.5 * H, 0.75 * H, 'green'],
    [1.5 * H, H - 1, 'green'],
    [1.5 * H, H, 'yellow'],
    [1.5 * H, 1.35 * H, 'red'],
    [H, H - 1, 'green'],
    [H, H, 'red'],
  ];
  it.each(table)('S = %ss, %ss used: %s', (silo, used, tone) => {
    expect(at(used, { silo }).tone).toBe(tone);
  });

  it('unknown silos: the smallest, 3 h', () => {
    expect(at(1.5 * H - 1, { silo: null }).tone).toBe('green');
    expect(at(1.5 * H, { silo: null }).tone).toBe('yellow');
    expect(at(2.7 * H, { silo: null }).tone).toBe('red');
    expect(at(H, { silo: null }).siloSeconds).toBe(3 * H);
  });

  it('the numbers: save age, silo time used and left, the fraction used', () => {
    const s = at(13 * H, { saveAge: 12 * H });
    expect(s.saveAgeSeconds).toBe(12 * H);
    expect(s.siloUsedSeconds).toBe(13 * H);
    expect(s.siloLeftSeconds).toBe(11 * H);
    expect(s.fractionUsed).toBeCloseTo(13 / 24);
    expect(at(30 * H).siloLeftSeconds).toBe(0);
  });

  it('the tone is the worse of the two clocks', () => {
    // The farm ran recently but the backup is old (a newer step in an older save can't happen, but a later backup
    // of an older farm can): the save's age decides when it is the worse.
    expect(at(H, { saveAge: 13 * H }).tone).toBe('yellow');
    expect(at(H, { saveAge: 13 * H }).driver).toBe('save');
    // A check-in that didn't sync: the backup is fresh, the farm last ran long ago.
    expect(at(22 * H, { saveAge: 10 * 60 }).tone).toBe('red');
    expect(at(22 * H, { saveAge: 10 * 60 }).driver).toBe('silo');
    expect(at(13 * H, { saveAge: 22 * H }).tone).toBe('red');
  });

  it('no virtue ascension under way: the save’s age alone, against the same S', () => {
    const none = (saveAge: number, silo: number | null = null) =>
      saveState({ backupSeconds: NOW - saveAge, farmStepSeconds: null, siloSeconds: silo, hasVirtueFarm: false, nowSeconds: NOW, zone: ZONE })!;
    expect(none(1.5 * H - 1).tone).toBe('green');
    expect(none(1.5 * H).tone).toBe('yellow');
    expect(none(2.7 * H).tone).toBe('red');
    expect(none(12 * H, 24 * H).tone).toBe('yellow');
    const s = none(2 * H);
    expect(s.siloUsedSeconds).toBeNull();
    expect(s.siloLeftSeconds).toBeNull();
    expect(s.driver).toBe('save');
    expect(s.namesFarm).toBe(false);
    // A farm time from another farm (a contract) is ignored without a virtue farm.
    expect(saveState({ backupSeconds: NOW - H, farmStepSeconds: NOW - 30 * H, siloSeconds: null, hasVirtueFarm: false, nowSeconds: NOW, zone: ZONE })!.tone).toBe('green');
  });

  it('a virtue farm with no step time of its own runs from the backup', () => {
    const s = saveState({ backupSeconds: NOW - 13 * H, farmStepSeconds: 0, siloSeconds: 24 * H, hasVirtueFarm: true, nowSeconds: NOW, zone: ZONE })!;
    expect(s.siloUsedSeconds).toBe(13 * H);
    expect(s.namesFarm).toBe(false);
  });

  it('nothing without a save time', () => {
    for (const b of [0, null, undefined, 5000])
      expect(saveState({ backupSeconds: b, hasVirtueFarm: true, nowSeconds: NOW, zone: ZONE })).toBeNull();
  });
});

describe('naming the virtue farm', () => {
  it('only when its time is more than 15 minutes from the backup’s', () => {
    expect(at(13 * H, { saveAge: 13 * H - 15 * 60 }).namesFarm).toBe(false);
    expect(at(13 * H, { saveAge: 13 * H - 15 * 60 - 1 }).namesFarm).toBe(true);
    expect(at(13 * H, { saveAge: 13 * H }).reason).toMatch(/^Your save is 13h old/);
    expect(at(13 * H, { saveAge: 2 * H }).reason).toMatch(/^Your virtue farm last ran 13h ago/);
  });
});

describe('the sync suggestion past 24 h, in any tone', () => {
  it('not at 24 h, from just past it, whatever the tone', () => {
    expect(at(24 * H).suggestSync).toBe(false);
    expect(at(24 * H).syncLine).toBeNull();
    expect(at(24 * H + 60).suggestSync).toBe(true);
    // Red (the silo clock), yellow and green can each carry it: the silos are big and the farm ran lately.
    const red = at(30 * H, { silo: 30 * H, saveAge: 30 * H });
    expect([red.tone, red.suggestSync]).toEqual(['red', true]);
    const yellow = at(16 * H, { silo: 60 * H, saveAge: 31 * H });
    expect([yellow.tone, yellow.suggestSync]).toEqual(['yellow', true]);
    const green = at(H, { silo: 80 * H, saveAge: 25 * H });
    expect([green.tone, green.suggestSync]).toEqual(['green', true]);
    expect(green.syncLine).toBe('Your save is over a day old: open Egg, Inc. and let it sync so the save here is up to date.');
  });
});

describe('the words (DRAFT: Words reviews)', () => {
  it('green: one quiet line, the save’s time and age', () => {
    const s = at(3 * H);
    expect(s.tone).toBe('green');
    expect(s.headline).toBe('Your save is from Oct 15 at 2:36 PM, 3h ago');
    expect(s.reason).toBeNull();
    expect(s.runNote).toBeNull();
    expect(s.link).toBe('Load a fresh one');
  });

  it('yellow: what to do first, then what is at stake', () => {
    const s = at(13 * H);
    expect(s.headline).toBe('Open Egg, Inc. so it syncs, then load a fresh save');
    expect(s.reason).toBe('Your save is 13h old, and your silos run out in 11h: after that the farm earns nothing until the game syncs.');
    expect(s.link).toBe('Load a fresh save');
    const farm = at(13 * H, { saveAge: 2 * H });
    expect(farm.reason).toBe('Your virtue farm last ran 13h ago, and your silos run out in 11h: after that the farm earns nothing until the game syncs.');
    const save = saveState({ backupSeconds: NOW - 2 * H, hasVirtueFarm: false, nowSeconds: NOW, zone: ZONE })!;
    expect(save.reason).toBe('Your save is 2h old (from Oct 15 at 3:36 PM), so the times here may have drifted.');
  });

  it('red: what to do first, then what is at stake', () => {
    const s = at(22 * H);
    expect(s.headline).toBe('Open Egg, Inc. so it syncs, then load a fresh save before you rely on these answers');
    expect(s.reason).toBe('Your save is 22h old, and your silos run out in 2h: after that the farm earns nothing, so the answers here stop being right.');
    expect(at(27 * H).reason).toBe('Your save is 27h old, and your silos ran out 3h ago: the farm has earned nothing since, so the answers here are probably wrong.');
    expect(at(27 * H).runNote).toBe(`${at(27 * H).reason} ${at(27 * H).headline}.`);
    const save = saveState({ backupSeconds: NOW - 3 * H, hasVirtueFarm: false, nowSeconds: NOW, zone: ZONE })!;
    expect(save.reason).toBe('Your save is 3h old (from Oct 15 at 2:36 PM), so the times here are probably wrong now and some may have passed.');
  });

  it('never colour alone: each tone has a word and an icon', () => {
    expect([at(H).word, at(H).icon]).toEqual(['Up to date', 'clock']);
    expect([at(13 * H).word, at(13 * H).icon]).toEqual(['Getting old', 'alert']);
    expect([at(22 * H).word, at(22 * H).icon]).toEqual(['Out of date', 'stop']);
  });

  it('the details: both clocks, the silos, the thresholds and what catch-up does', () => {
    const d = at(13 * H, { saveAge: 2 * H }).details;
    expect(d).toEqual([
      'Save: from Oct 15 at 3:36 PM (2h ago).',
      'Virtue farm last ran: Oct 15 at 4:36 AM (13h ago).',
      'Silos: 8, holding 24h; 11h left.',
      "Getting old after 12h, out of date after 21h 36m: for both the save's age and the silo time used.",
      'Catch-up: from the farm\'s last run to the plan start, the planner runs your farm at its current rate, for as long as your silos hold, the way the game credits time away. Anything you did in the game since is not in it.',
    ]);
    expect(at(13 * H, { silo: null, siloCount: null }).details[2]).toBe('Silos: not in the save, so the smallest is assumed (3h); ran out 10h ago.');
    const none = saveState({ backupSeconds: NOW - 2 * H, hasVirtueFarm: false, nowSeconds: NOW, zone: ZONE })!;
    expect(none.details).toContain("No virtue ascension under way, so silo time doesn't apply: this follows your save's age alone, against 3h.");
    expect(none.details.join(' ')).not.toMatch(/Virtue farm last ran|Catch-up/);
  });
});

describe('the save’s own times (read from the save, never a Manual plan’s state)', () => {
  const save = (o: Record<string, unknown> = {}) => ({
    approxTime: NOW - 2 * H,
    settings: { lastBackupTime: NOW - 2 * H },
    game: { epicResearch: [{ id: 'silo_capacity', level: 20 }] },
    farms: [
      { eggType: 1, lastStepTime: NOW - 40 * H, silosOwned: 10 }, // the home farm: ignored
      { eggType: 51, lastStepTime: NOW - 5 * H, silosOwned: 8 },
    ],
    ...o,
  });

  it('the backup, the virtue farm’s step and silos, Silo Capacity', () => {
    expect(saveClockOf(save())).toEqual({ backupSeconds: NOW - 2 * H, farmStepSeconds: NOW - 5 * H, siloSeconds: 24 * H, siloCount: 8, hasVirtueFarm: true });
    expect(backupSecondsOf(save())).toBe(NOW - 2 * H);
  });

  it('no virtue farm: no farm time and the smallest silos', () => {
    expect(saveClockOf(save({ farms: [{ eggType: 1, lastStepTime: NOW - 40 * H, silosOwned: 10 }] }))).toEqual({
      backupSeconds: NOW - 2 * H,
      farmStepSeconds: null,
      siloSeconds: null,
      siloCount: null,
      hasVirtueFarm: false,
    });
  });

  it('silos not in the save: unknown (the helper assumes 3 h)', () => {
    const c = saveClockOf(save({ farms: [{ eggType: 50, lastStepTime: NOW - 5 * H }] }))!;
    expect([c.siloSeconds, c.siloCount]).toEqual([null, null]);
  });

  it('a Manual plan’s redacted save (no time): nothing', () => {
    expect(saveClockOf({ farms: [] })).toBeNull();
    expect(saveClockOf(null)).toBeNull();
  });
});
