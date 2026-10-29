/**
 * The silos estimated to now (lib/farmNow.ts): silo time only, from the save's farm and the time since, on the same
 * silo model as the catch-up (lib/saveAge.ts `siloSeconds`).
 */
import { describe, expect, it } from 'vitest';
import { siloNow, siloNowWords } from './farmNow';
import { siloSeconds } from './saveAge';
import { farmFacts } from './farmFacts';

const ZONE = 'America/Denver';
const SAVE = Date.UTC(2026, 9, 25, 16, 9) / 1000; // Oct 25, 10:09 AM Denver
const H = 3600;

describe('the silos now', () => {
  it('time left: full at the save, down one second per second since', () => {
    const s = siloNow({ siloSeconds: 24 * H, saveSeconds: SAVE, nowSeconds: SAVE + 10 * H })!;
    expect(s).toEqual({ capacitySeconds: 24 * H, leftSeconds: 14 * H, emptyAt: SAVE + 24 * H, empty: false });
    const w = siloNowWords(s, SAVE, SAVE + 10 * H, ZONE);
    expect(w.line).toBe('Silos: about 14h left (estimated from your save of Oct 25 at 10:09 AM)');
    expect(w.value).toBe('about 14h left');
    expect(w.note).toBe('of 24h · estimated from your save of Oct 25 at 10:09 AM');
  });

  it('empty since a time once the silos have run out', () => {
    const now = SAVE + 30 * H;
    const s = siloNow({ siloSeconds: 15 * H - 9 * 60, saveSeconds: SAVE, nowSeconds: now })!;
    expect(s.empty).toBe(true);
    expect(s.leftSeconds).toBe(0);
    const w = siloNowWords(s, SAVE, now, ZONE);
    expect(w.line).toBe('Silos: empty since Oct 26 at 1:00 AM (estimated from your save of Oct 25 at 10:09 AM)');
    expect(w.value).toBe('empty');
  });

  it('from the farm’s own last step when it is before the save (the farm wasn’t running since)', () => {
    const s = siloNow({ siloSeconds: 24 * H, saveSeconds: SAVE, stepSeconds: SAVE - 4 * H, nowSeconds: SAVE + 10 * H })!;
    expect(s.leftSeconds).toBe(10 * H);
    // A step after the save (or none) means the save's time.
    expect(siloNow({ siloSeconds: 24 * H, saveSeconds: SAVE, stepSeconds: SAVE + H, nowSeconds: SAVE + 10 * H })!.leftSeconds).toBe(14 * H);
    expect(siloNow({ siloSeconds: 24 * H, saveSeconds: SAVE, stepSeconds: 0, nowSeconds: SAVE + 10 * H })!.leftSeconds).toBe(14 * H);
  });

  it('full right after the save; a clock before the save counts nothing', () => {
    expect(siloNow({ siloSeconds: 2 * H, saveSeconds: SAVE, nowSeconds: SAVE - 600 })!.leftSeconds).toBe(2 * H);
    const s = siloNow({ siloSeconds: 2 * H, saveSeconds: SAVE, nowSeconds: SAVE + 2 * H - 30 })!;
    expect(siloNowWords(s, SAVE, SAVE + 2 * H - 30, ZONE).value).toBe('under a minute left');
  });

  it('null without a save time or silos', () => {
    expect(siloNow({ siloSeconds: 24 * H, saveSeconds: 0, nowSeconds: SAVE })).toBeNull();
    expect(siloNow({ siloSeconds: 0, saveSeconds: SAVE, nowSeconds: SAVE })).toBeNull();
  });

  it('the same silo model as the catch-up: Your eggs’ silo minutes are siloSeconds', () => {
    const f = farmFacts({
      farm: {
        eggType: 50, cash: 0, numSilos: 3, commonResearches: {}, habs: [null, null, null, null], vehicles: [],
        population: 0, deliveredEggs: 0, lastStepTime: SAVE - 60, cashEarned: 0, cashSpent: 0,
      },
      epic: { silo_capacity: 7 },
      colleggtibles: { habCap: 1, elr: 1, shippingCap: 1 },
      equipped: [],
    })!;
    expect(f.siloMinutes * 60).toBe(siloSeconds(3, 7));
    expect(f.stepSeconds).toBe(SAVE - 60);
  });
});
