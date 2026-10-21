import { beforeEach, describe, expect, it } from 'vitest';
import {
  deliveryEntry,
  deliveryKey,
  deliveryTableName,
  deliveryWords,
  forgetIndexes,
  tableDeliveryIds,
  tableIndex,
  TABLE_FOURTH,
} from './deliveryTables';

const T = 'tachyon-stone-4';
const Q = 'quantum-stone-4';
const slot = (artifactId: string, ...stones: (string | null)[]) => ({ artifactId, stones });

describe('deliveryKey: Joo’s FNV-1a of the sorted ids', () => {
  it('gives the storage’s keys (index.json, 21 Oct 2026) in any order', () => {
    const ids = ['quantum-metronome-4-2', 'interstellar-compass-4-3', 'gusset-4-3', 'lunar-totem-4-3'];
    expect(deliveryKey(ids)).toBe('0b85c7a1');
    expect(deliveryKey([...ids].reverse())).toBe('0b85c7a1');
    expect(deliveryKey(['quantum-metronome-3-2', 'interstellar-compass-4-0', 'gusset-2-2', 'lunar-totem-4-3'])).toBe(
      '09f8b316'
    );
    // Joo's MAXED_DELIVERY (aaap-tools notes/tablecheck.md part 5), and our maxed table's (puzzle cube 4th).
    expect(deliveryKey(['quantum-metronome-4-3', 'interstellar-compass-4-3', 'gusset-4-3', 'lunar-totem-4-3'])).toBe(
      '0a85c60e'
    );
    expect(deliveryKey(['quantum-metronome-4-3', 'interstellar-compass-4-3', 'gusset-4-3', 'puzzle-cube-4-3'])).toBe(
      '3f17f084'
    );
  });
});

describe('tableDeliveryIds: the set as a delivery table is keyed for it', () => {
  const met = slot('quantum-metronome-4-2', T, T);
  const com = slot('interstellar-compass-4-3', T, T);
  const gus = slot('gusset-4-3', Q, T, T);
  const expected = ['quantum-metronome-4-2', 'interstellar-compass-4-3', 'gusset-4-3', TABLE_FOURTH];

  it('the three families with their tiers, and the lunar totem as 4th, in any slot order', () => {
    expect(tableDeliveryIds([met, com, gus, slot('lunar-totem-4-3', T, T, T)])).toEqual(expected);
    expect(tableDeliveryIds([slot('lunar-totem-4-3', T, T, T), gus, met, com])).toEqual(expected);
  });

  it('any 3-slot T4L as the 4th stands for the lunar totem (it holds the same stones)', () => {
    expect(tableDeliveryIds([met, com, gus, slot('puzzle-cube-4-3', T, T, T)])).toEqual(expected);
    expect(tableDeliveryIds([met, com, gus, slot('the-chalice-4-3', Q, Q, T)])).toEqual(expected);
  });

  it('not when the 4th is not a 3-slot T4L, a family is missing, or a stone is not T4', () => {
    expect(tableDeliveryIds([met, com, gus, slot('puzzle-cube-4-2', T, T)])).toBeNull();
    expect(tableDeliveryIds([met, com, gus, slot('book-of-basan-4-3', T, T)])).toBeNull();
    expect(tableDeliveryIds([met, com, slot('puzzle-cube-4-3', T, T, T), slot('lunar-totem-4-3', T, T, T)])).toBeNull();
    expect(tableDeliveryIds([met, com, slot('gusset-4-3', Q, T, 'tachyon-stone-3'), slot('lunar-totem-4-3', T, T, T)])).toBeNull();
    expect(tableDeliveryIds([met, com, slot('gusset-4-3', Q, T, null), slot('lunar-totem-4-3', T, T, T)])).toBeNull();
    expect(tableDeliveryIds([met, com, gus])).toBeNull();
    expect(tableDeliveryIds(null)).toBeNull();
  });

  it('says the set in a player’s words', () => {
    expect(deliveryWords(expected)).toBe('metronome T4E, compass T4L, gusset T4L');
  });
});

describe('index.json', () => {
  beforeEach(() => forgetIndexes());
  const entry = { name: 'delivery-0b85c7a1.bin.gz', kind: 'delivery', deliveryKey: '0b85c7a1' };
  const json = (body: unknown, type = 'application/json') =>
    new Response(JSON.stringify(body), { headers: { 'content-type': type } });

  it('is fetched once per page and base, and finds the delivery table by its key', async () => {
    const asked: string[] = [];
    const get = async (url: string) => (asked.push(url), json({ tables: [entry] }));
    const a = await tableIndex('/t/', get);
    expect(await tableIndex('/t/', get)).toBe(a);
    expect(asked).toEqual(['/t/index.json']);
    expect(deliveryEntry(a, '0b85c7a1')).toEqual(entry);
    expect(deliveryEntry(a, '09f8b316')).toBeNull();
    expect(deliveryEntry([{ ...entry, kind: 'gear' }], '0b85c7a1')).toBeNull();
    expect(deliveryTableName('0b85c7a1')).toBe('delivery-0b85c7a1.bin');
  });

  it('null, quietly, when it is missing, a web page, not an index, or the fetch fails', async () => {
    expect(await tableIndex('/a/', async () => new Response('', { status: 404 }))).toBeNull();
    expect(await tableIndex('/b/', async () => json('<html>', 'text/html'))).toBeNull();
    expect(await tableIndex('/c/', async () => json({ nope: 1 }))).toBeNull();
    expect(
      await tableIndex('/d/', async () => {
        throw new Error('offline');
      })
    ).toBeNull();
    expect(deliveryEntry(null, '0b85c7a1')).toBeNull();
  });
});
