/** A small save for tableGear.spec.ts: a virtue inventory of T4 artifacts and stones (placeholder id). */
import { ei } from 'lib';
const N = ei.ArtifactSpec.Name,
  L = ei.ArtifactSpec.Level,
  R = ei.ArtifactSpec.Rarity;
const spec = (name: number, level = L.GREATER, rarity = R.LEGENDARY) => ({ name, level, rarity });
const stone = (name: number, level = L.NORMAL) => ({ name, level, rarity: R.COMMON });
let id = 1;
const item = (s: object, stones: object[] = []) => ({ itemId: id++, quantity: 1, artifact: { spec: s, stones } });
export function fixtureBackup(): ei.IBackup {
  id = 1;
  const items = [
    item(spec(N.PUZZLE_CUBE), [stone(N.TACHYON_STONE), stone(N.TACHYON_STONE), stone(N.QUANTUM_STONE)]),
    item(spec(N.INTERSTELLAR_COMPASS), [stone(N.QUANTUM_STONE), stone(N.QUANTUM_STONE)]),
    item(spec(N.QUANTUM_METRONOME, L.GREATER, R.EPIC), [stone(N.TACHYON_STONE), stone(N.TACHYON_STONE)]),
    item(spec(N.ORNATE_GUSSET), [stone(N.TACHYON_STONE), stone(N.TACHYON_STONE), stone(N.TACHYON_STONE)]),
    item(spec(N.DEMETERS_NECKLACE), [stone(N.LUNAR_STONE), stone(N.LUNAR_STONE), stone(N.LUNAR_STONE)]),
    item(spec(N.LUNAR_TOTEM), [stone(N.LUNAR_STONE), stone(N.LUNAR_STONE, L.LESSER), stone(N.LUNAR_STONE)]),
    item(spec(N.TUNGSTEN_ANKH), [stone(N.LUNAR_STONE), stone(N.LUNAR_STONE), stone(N.LUNAR_STONE)]),
    item(stone(N.TACHYON_STONE)),
  ];
  return {
    eiUserId: 'EI0000000000000000',
    game: { permitLevel: 1, epicResearch: [] },
    artifactsDb: {
      virtueAfxDb: {
        inventoryItems: items,
        activeArtifacts: {
          slots: [1, 5, 6, 7].map(i => ({ occupied: true, itemId: items.find(x => x.itemId === i)!.itemId })),
        },
      },
    },
  } as unknown as ei.IBackup;
}
export const research = {
  comfy_nests: 50,
  hab_capacity1: 8,
  internal_hatchery1: 10,
  leafsprings: 30,
  lightweight_boxes: 40,
};
export const epic = {
  epic_comfy_nests: 20,
  epic_internal_incubators: 20,
  transportation_lobbyist: 30,
  silo_capacity: 20,
  epic_silo_quality: 40,
};
