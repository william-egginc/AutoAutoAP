/**
 * 17 Nov 2026 (Jordan, via the orchestrator): the amber "Silos are low: from your save, they run out about …" warning is
 * only for a FRESH save (under FRESH_SAVE_SECONDS, 1 h) with low silos. A save older than that just states its age,
 * with no warning and no amber: the player has likely opened the game since, which refills the silos.
 */
import { describe, expect, it } from 'vitest';
import { FRESH_SAVE_SECONDS, saveBannerState, siloLineState } from './saveBanner';
import { TONE_FLOOR_SECONDS } from './saveFreshness';

const NOW = Date.UTC(2026, 10, 17, 18, 0) / 1000;
const H = 3600;
const ZONE = 'America/Denver';
const S = 10 * H;
/** A save `age` seconds old over a farm last run `farmAge` seconds ago (silo time S). */
const line = (age: number, farmAge = age) =>
  siloLineState(
    saveBannerState({ hasVirtueFarm: true, nowSeconds: NOW, zone: ZONE, backupSeconds: NOW - age, farmStepSeconds: NOW - farmAge, siloSeconds: S, siloCount: 4 }),
    NOW,
    ZONE
  );

describe('the silo warning needs a fresh save', () => {
  it('the threshold is 1 h', () => { expect(FRESH_SAVE_SECONDS).toBe(3600); expect(FRESH_SAVE_SECONDS).toBe(TONE_FLOOR_SECONDS); });

  it('fresh save, low silos: the short amber warning', () => {
    const l = line(20 * 60, 20 * 60 + 8 * H);
    expect(l?.low).toBe(true);
    expect(l?.text).toMatch(/^Silos are low\. They run out about [^.]*\.$/);
  });

  it('fresh save, silos already gone: the "ran out" warning stays', () => {
    const l = line(10 * 60, 12 * H);
    expect(l?.past).toBe(true);
    expect(l?.text).toMatch(/^Silos have run out\. They ran out about [^.]*\.$/);
  });

  it('a save over an hour old, low silos: its age only, no warning, not amber', () => {
    const l = line(2 * H, 2 * H + 0.75 * S);
    expect(l?.low).toBe(false);
    expect(l?.text).toMatch(/^Save from \d{1,2}:\d{2} [AP]M, 2h ago$/);
    expect(l?.text).not.toMatch(/low|opened the game|run out/i);
  });

  it('a stale save with silos long gone: its age only too', () => {
    const l = line(5 * H, 5 * H + S + 3 * H);
    expect(l?.low).toBe(false);
    expect(l?.past).toBe(false);
    expect(l?.text).toMatch(/^Save from (\d{1,2}:\d{2} [AP]M|Nov \d+ at \d{1,2}:\d{2} [AP]M), 5h ago$/);
  });

  it('just under the threshold is fresh, at it is not', () => {
    expect(line(FRESH_SAVE_SECONDS - 60, FRESH_SAVE_SECONDS + 8 * H)?.low).toBe(true);
    expect(line(FRESH_SAVE_SECONDS, FRESH_SAVE_SECONDS + 8 * H)?.low).toBe(false);
  });

  it('a stale save with plenty of silo time left keeps its plain "Silos run out about … (from your save)" line', () => {
    const l = line(2 * H, 2 * H);
    expect(l?.low).toBe(false);
    expect(l?.text).toMatch(/^Silos run out about .* \(from your save\)$/);
  });

  it('the clock behind the save (true age unknown): never the warning', () => {
    const l = siloLineState(
      saveBannerState({ hasVirtueFarm: true, nowSeconds: NOW, zone: ZONE, backupSeconds: NOW + 2 * H, farmStepSeconds: NOW - 8 * H, siloSeconds: S, siloCount: 4 }),
      NOW,
      ZONE
    );
    expect(l?.low).toBe(false);
  });
});
