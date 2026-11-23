/**
 * Which ships the optimizer offers (game expert's check, 22 Nov 2026): the Henliner only once the save shows one
 * launched on the Path. A player with hundreds of Henliner launches at home would otherwise see it ranked first
 * for the compass, on a Path where nobody has shown it can fly.
 */
import { describe, expect, it } from 'vitest';
import { ei } from 'lib';
import { readPlayerData } from 'lib/mission-optimizer/player-data';

const Ship = ei.MissionInfo.Spaceship;
// The game's Atreggies Henliner.
const HENLINER = Ship.ATREGGIES;
const launch = (ship: ei.MissionInfo.Spaceship, type: ei.MissionInfo.MissionType) =>
  ({ ship, type, durationType: ei.MissionInfo.DurationType.EPIC, status: ei.MissionInfo.Status.COMPLETE }) as ei.IMissionInfo;
const backup = (launches: ei.IMissionInfo[]) =>
  ({
    game: { goldenEggsEarned: 0, goldenEggsSpent: 0 },
    artifacts: { craftingXp: 0, tankLevel: 0 },
    artifactsDb: { missionArchive: launches, missionInfos: [], virtueAfxDb: { artifactStatus: [] } },
  }) as unknown as ei.IBackup;

describe('readPlayerData ship visibility', () => {
  it('a Henliner launched only at home is not offered', () => {
    const data = readPlayerData(backup([launch(HENLINER, ei.MissionInfo.MissionType.STANDARD), launch(Ship.HENERPRISE, ei.MissionInfo.MissionType.STANDARD)]))!;
    expect(data.shipsConfig.shipVisibility[HENLINER]).toBe(false);
    // Any other ship launched at home stays on the menu.
    expect(data.shipsConfig.shipVisibility[Ship.HENERPRISE]).toBe(true);
  });

  it('a Henliner launched on the Path is offered', () => {
    const data = readPlayerData(backup([launch(HENLINER, ei.MissionInfo.MissionType.VIRTUE)]))!;
    expect(data.shipsConfig.shipVisibility[HENLINER]).toBe(true);
  });

  it('Chicken One is always on the menu', () => {
    expect(readPlayerData(backup([]))!.shipsConfig.shipVisibility[Ship.CHICKEN_ONE]).toBe(true);
  });
});
