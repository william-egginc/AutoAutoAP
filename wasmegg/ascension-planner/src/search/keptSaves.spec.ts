/**
 * The saves Saved answers and Saved runs were priced from (search/keptSaves.ts): kept gzipped, one
 * copy per save, while an entry names them, within a cap; and the file a player can download.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const {
  keepSave,
  listKeptSaves,
  loadKeptSave,
  keptToKeep,
  pruneKeptSaves,
  saveFileName,
  parseSaveFile,
  backupText,
  MAX_KEPT_SAVES,
} = await import('./keptSaves');

/** A save shaped like the game's: a fake account id, and enough artifact rows to be worth gzipping. */
function backup(at: number, over: Record<string, unknown> = {}) {
  return {
    userName: 'Synthetic',
    eiUserId: 'TEST-ACCOUNT-1',
    approxTime: at,
    game: { soulEggsD: 1e24, eggsOfProphecy: 180, permitLevel: 1 },
    farms: [{ habs: [1, 2, 3, 4], commonResearch: [] }],
    artifactsDb: {
      inventoryItems: Array.from({ length: 400 }, (_, i) => ({ itemId: i, quantity: 1, artifact: { spec: { name: i % 30, level: 3 } } })),
    },
    virtue: { eovEarned: [10, 20, 30, 40, 50] },
    ...over,
  };
}

const T0 = 1_791_430_784;
const NOW = 1_800_000_000_000;

beforeEach(() => db.clear());

describe('kept saves', () => {
  it('keeps the full backup, gzipped, and gives the same object back', async () => {
    const raw = backup(T0);
    const s = await keepSave('P', raw, 230, NOW);
    expect(s).toMatchObject({ te: 230, backupAt: T0, keptAt: NOW });
    expect(s.account).toBeTruthy();
    expect(s.account).not.toContain('TEST-ACCOUNT-1'); // a hash, never the id
    expect(s.bytes).toBeLessThan(s.rawBytes / 4); // gzipped
    expect(await loadKeptSave('P', s.key)).toEqual(raw);
  });

  it('keeps one copy of a save however many entries keep it', async () => {
    const a = await keepSave('P', backup(T0), 230, NOW);
    const b = await keepSave('P', backup(T0), 230, NOW + 1000);
    expect(b.key).toBe(a.key);
    expect(await listKeptSaves('P')).toHaveLength(1);
    expect([...db.keys()].filter(k => k.includes('keptSave:'))).toHaveLength(1);
    // A different save is a different copy.
    const c = await keepSave('P', backup(T0 + 3600), 231, NOW);
    expect(c.key).not.toBe(a.key);
    expect(await listKeptSaves('P')).toHaveLength(2);
  });

  it('keeps numbers JSON cannot carry', async () => {
    const raw = backup(T0, { odd: { far: Infinity } });
    const s = await keepSave('P', raw, 230, NOW);
    expect(((await loadKeptSave('P', s.key)) as unknown as { odd: { far: number } }).odd.far).toBe(Infinity);
  });

  it('drops saves no entry names, once they are a quarter hour old, bodies too', async () => {
    const a = await keepSave('P', backup(T0), 230, NOW);
    const b = await keepSave('P', backup(T0 + 3600), 231, NOW);
    // Fresh: another tab may be about to write the entry that names it.
    await pruneKeptSaves('P', [{ key: a.key, at: NOW }], NOW + 60_000);
    expect(await listKeptSaves('P')).toHaveLength(2);
    const left = await pruneKeptSaves('P', [{ key: a.key, at: NOW }], NOW + 20 * 60_000);
    expect(left.map(s => s.key)).toEqual([a.key]);
    expect(await loadKeptSave('P', b.key)).toBeNull();
    expect(await loadKeptSave('P', a.key)).not.toBeNull();
  });

  it(`keeps at most ${MAX_KEPT_SAVES}, those of the newest entries first`, () => {
    const later = NOW + 60 * 60_000;
    const index = Array.from({ length: MAX_KEPT_SAVES + 5 }, (_, i) => ({
      key: `k${i}`,
      te: 200,
      backupAt: T0 + i,
      keptAt: NOW,
      bytes: 150_000,
      rawBytes: 1_400_000,
    }));
    // Entry i was saved at time i: the five oldest entries lose their saves.
    const refs = index.map((s, i) => ({ key: s.key, at: i }));
    const keep = keptToKeep(index, refs, later);
    expect(keep.size).toBe(MAX_KEPT_SAVES);
    for (let i = 0; i < 5; i++) expect(keep.has(`k${i}`)).toBe(false);
    expect(keep.has(`k${MAX_KEPT_SAVES + 4}`)).toBe(true);
    // And within the byte budget.
    expect(keptToKeep(index, refs, later, { saves: 100, bytes: 450_000 }).size).toBe(3);
  });

  it('a save named by an old and a new entry counts as new', () => {
    const later = NOW + 60 * 60_000;
    const index = ['a', 'b'].map(key => ({ key, te: 1, backupAt: 1, keptAt: NOW, bytes: 1, rawBytes: 1 }));
    const refs = [
      { key: 'a', at: 1 },
      { key: 'b', at: 2 },
      { key: 'a', at: 3 },
    ];
    expect([...keptToKeep(index, refs, later, { saves: 1, bytes: 1e9 })]).toEqual(['a']);
  });
});

describe('the save as a file', () => {
  it('is named by TE and date, never by the player id', () => {
    const name = saveFileName({ te: 230.4, backupAt: T0 }, 'UTC');
    expect(name).toMatch(/^egg-inc-save-TE230-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(name).not.toMatch(/EI\d/);
    expect(saveFileName({ te: 0, backupAt: 0 })).toBe('egg-inc-save-TE0-unknown-date.json');
  });

  it('reads back what was written', () => {
    const raw = backup(T0);
    expect(parseSaveFile(backupText(raw))).toEqual(raw);
  });

  it('refuses anything that is not a save, in words', () => {
    expect(() => parseSaveFile('not json')).toThrow(/isn't JSON/);
    expect(() => parseSaveFile('{"chain":[1,2]}')).toThrow(/isn't an Egg, Inc. save/);
    expect(() => parseSaveFile('[1,2]')).toThrow(/isn't an Egg, Inc. save/);
  });
});
