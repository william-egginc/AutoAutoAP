/**
 * Ships already out (Jordan, 23 Nov 2026, shot 6: "the plan launches in all 3 slots at 12:49 PM, but my slots are busy").
 * The save's Path missions that are exploring give each busy slot's return time. The solver has one capacity for all three
 * slots, so this only reads and says: it does not change the answer.
 */
import { describe, expect, it } from 'vitest';
import { ei } from 'lib';
import { missionsOut, outNowLine } from './missionsOut';

const NOW = 1_800_000_000;
const mission = (o: Partial<ei.IMissionInfo>) =>
  ({ ship: ei.MissionInfo.Spaceship.CHICKEN_ONE, type: ei.MissionInfo.MissionType.VIRTUE, status: ei.MissionInfo.Status.EXPLORING, startTimeDerived: NOW - 3600, durationSeconds: 7200, ...o }) as ei.IMissionInfo;
const backup = (list: ei.IMissionInfo[]) => ({ artifactsDb: { missionInfos: list } }) as unknown as ei.IBackup;

describe('missionsOut', () => {
  it('the exploring Path missions, with when each returns, soonest first', () => {
    const out = missionsOut(backup([mission({ durationSeconds: 20_000 }), mission({ durationSeconds: 7200 })]), NOW);
    expect(out.map(m => m.returnAt)).toEqual([NOW - 3600 + 7200, NOW - 3600 + 20_000]);
  });
  it('not home missions, not ones fueling or already back, not ones whose return has passed', () => {
    const out = missionsOut(
      backup([
        mission({ type: ei.MissionInfo.MissionType.STANDARD }),
        mission({ status: ei.MissionInfo.Status.FUELING }),
        mission({ status: ei.MissionInfo.Status.RETURNED }),
        mission({ startTimeDerived: NOW - 90_000, durationSeconds: 3600 }),
      ]),
      NOW
    );
    expect(out).toEqual([]);
  });
  it('no save, or one with no missions: none', () => {
    expect(missionsOut(null, NOW)).toEqual([]);
    expect(missionsOut({} as ei.IBackup, NOW)).toEqual([]);
  });
});

describe('outNowLine', () => {
  const at = (h: number) => NOW + h * 3600;
  it('names the returns that fall inside the stop, and those after it ends', () => {
    const t = outNowLine([{ ship: 0, returnAt: at(2) }, { ship: 0, returnAt: at(3) }, { ship: 0, returnAt: at(30) }], { from: NOW, to: at(18) }, 'UTC');
    expect(t).toContain('2 ships are back');
    expect(t).toContain('1 ship returns after this stop ends');
    expect(t).toContain('The plan below treats all three slots as free from the start');
  });
  it('says nothing when every ship is back before the plan starts', () => {
    expect(outNowLine([{ ship: 0, returnAt: NOW - 5 }], { from: NOW, to: at(18) }, 'UTC')).toBe('');
    expect(outNowLine([], { from: NOW, to: at(18) }, 'UTC')).toBe('');
  });
});
