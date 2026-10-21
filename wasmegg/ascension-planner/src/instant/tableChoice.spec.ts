import { beforeEach, describe, expect, it } from 'vitest';
import { SIM_VERSION } from './simVersion';
import type { TableHeader } from './precomputedTable';
import {
  answeredBy,
  choiceFor,
  choiceLine,
  tableLineFor,
  chooseTable,
  forgetChoices,
  ownRange,
  shiftWords,
  type ChoiceDeps,
} from './tableChoice';
import { deliveryKey } from './deliveryTables';
import { gearTableNameV3, type TableGear } from './tableGear';

const slot = (artifact: string, ...stones: string[]) => ({ artifact, stones });
const K3 = { comfy_nests: 50 };
const OWN_RESEARCH = { comfy_nests: 40 };

function gear(research: Record<string, number>, delivery = 'T4L Gusset'): TableGear {
  return {
    earnings: [slot('T4L Demeters necklace', 'T4 Lunar stone')],
    deliveryBare: [slot('T4L Interstellar compass', 'T4 Quantum stone')],
    deliveryFull: [slot(delivery, 'T4 Tachyon stone')],
    research,
    epicResearch: { epic_multiplier: 100 },
    colleggtibles: {},
  };
}

const head = (o: Partial<TableHeader>): TableHeader => ({
  version: 1,
  referenceWeek: 0,
  cteBonus: 0,
  deliveryScore: 1,
  from: 120,
  to: 339,
  slots: 1,
  builtAt: 'x',
  simVersion: SIM_VERSION,
  ...o,
});
const MAXED = head({ from: 75, to: 339, k3: { research: K3, delivery: [] } });
const BASE = '/p/';
const ACCT = 'acct-000000000000000000000000.bin';

/** A site with these files' headers; every other probe is a miss. Logs what was asked. */
function deps(
  files: Record<string, TableHeader>,
  mine: (r: Record<string, number>) => TableGear | null,
  log: string[] = []
): ChoiceDeps {
  return {
    header: async url => {
      log.push(url);
      return files[url] ?? null;
    },
    stampAt: mine,
  };
}
const input = { base: BASE, maxed: 'table.bin', accountName: ACCT };

describe('chooseTable: the account table, then the exact gear table, then the maxed one', () => {
  it('the account table when its stamp is the save’s (worked out at the table’s own research)', async () => {
    const seen: Record<string, number>[] = [];
    const own = head({ gear: gear(OWN_RESEARCH) });
    const c = await chooseTable(
      input,
      deps({ '/p/table.bin': MAXED, [BASE + ACCT]: own }, r => (seen.push(r), gear(r)))
    );
    expect(c).toMatchObject({ url: BASE + ACCT, kind: 'account', header: own, maxed: MAXED });
    expect(seen).toEqual([OWN_RESEARCH]);
  });

  it('gear changed: the gear table when there is one, else the maxed one saying what changed', async () => {
    const own = head({ gear: gear(OWN_RESEARCH, 'T4L Quantum metronome') });
    const log: string[] = [];
    const c = await chooseTable(
      input,
      deps({ '/p/table.bin': MAXED, [BASE + ACCT]: own }, r => gear(r), log)
    );
    expect(c).toEqual({ url: '/p/table.bin', header: MAXED, maxed: MAXED, kind: 'maxed', changed: ['delivery set'] });
    const gearUrl = BASE + (await gearTableNameV3(gear(K3)));
    expect(log).toEqual(['/p/table.bin', BASE + ACCT, gearUrl]);

    const g = head({ gear: gear(K3) });
    const c2 = await chooseTable(
      input,
      deps({ '/p/table.bin': MAXED, [BASE + ACCT]: own, [gearUrl]: g }, r => gear(r))
    );
    expect(c2).toEqual({ url: gearUrl, header: g, maxed: MAXED, kind: 'gear' });
  });

  it('the gear table is named from the stamp at the maxed table’s k3 research, and checked at its own', async () => {
    const seen: Record<string, number>[] = [];
    const gearUrl = BASE + (await gearTableNameV3(gear(K3)));
    const g = head({ gear: gear(OWN_RESEARCH) });
    const c = await chooseTable(
      { ...input, accountName: null },
      deps({ '/p/table.bin': MAXED, [gearUrl]: g }, r => (seen.push(r), gear(r)))
    );
    expect(c.kind).toBe('gear');
    expect(seen).toEqual([K3, OWN_RESEARCH]);
    // A file under the name whose own stamp is not the save's: refused.
    const wrong = head({ gear: gear(OWN_RESEARCH, 'T4E Gusset') });
    const c2 = await chooseTable(
      { ...input, accountName: null },
      deps({ '/p/table.bin': MAXED, [gearUrl]: wrong }, r => gear(r))
    );
    expect(c2.kind).toBe('maxed');
  });

  it('a table from another simulator is refused like a missing one (the next is tried)', async () => {
    const gearUrl = BASE + (await gearTableNameV3(gear(K3)));
    const other = { simVersion: 'joo31b596bb-dbl-bc7c3daa' };
    const c = await chooseTable(
      input,
      deps(
        {
          '/p/table.bin': MAXED,
          [BASE + ACCT]: head({ ...other, gear: gear(OWN_RESEARCH) }),
          [gearUrl]: head({ gear: gear(K3) }),
        },
        r => gear(r)
      )
    );
    expect(c.kind).toBe('gear');
    const c2 = await chooseTable(
      input,
      deps(
        {
          '/p/table.bin': MAXED,
          [BASE + ACCT]: head({ ...other, gear: gear(OWN_RESEARCH) }),
          [gearUrl]: head({ ...other, gear: gear(K3) }),
        },
        r => gear(r)
      )
    );
    expect(c2).toEqual({ url: '/p/table.bin', header: MAXED, maxed: MAXED, kind: 'maxed' });
    const fake = await chooseTable(
      input,
      deps({ '/p/table.bin': MAXED, [BASE + ACCT]: head({ fake: true, gear: gear(OWN_RESEARCH) }) }, r => gear(r))
    );
    expect(fake.kind).toBe('maxed');
  });

  it('nothing probed without the maxed table; a probe that throws is a miss', async () => {
    const log: string[] = [];
    const c = await chooseTable(
      input,
      deps({}, r => gear(r), log)
    );
    expect(c).toEqual({ url: '/p/table.bin', header: null, maxed: null, kind: 'maxed' });
    expect(log).toEqual(['/p/table.bin']);
    const throwing: ChoiceDeps = {
      header: async url => {
        if (url !== '/p/table.bin') throw new Error('404');
        return MAXED;
      },
      stampAt: r => gear(r),
    };
    expect((await chooseTable(input, throwing)).kind).toBe('maxed');
  });

  it('no save: no stamp, the maxed table', async () => {
    const c = await chooseTable(
      input,
      deps({ '/p/table.bin': MAXED, [BASE + ACCT]: head({ gear: gear(OWN_RESEARCH) }) }, () => null)
    );
    expect(c).toEqual({ url: '/p/table.bin', header: MAXED, maxed: MAXED, kind: 'maxed' });
  });
});

describe('choiceFor: probed once per save', () => {
  beforeEach(() => forgetChoices());

  it('the same key gets the same choice without probing again', async () => {
    let made = 0;
    const make = async () => (made++, { url: 'u', header: MAXED, maxed: MAXED, kind: 'maxed' as const });
    const a = await choiceFor('k', make);
    expect(await choiceFor('k', make)).toBe(a);
    expect(made).toBe(1);
    await choiceFor('k2', make);
    expect(made).toBe(2);
  });

  it('a choice with no maxed table is asked again', async () => {
    let made = 0;
    const make = async () => (made++, { url: 'u', header: null, maxed: null, kind: 'maxed' as const });
    await choiceFor('k', make);
    await Promise.resolve();
    await choiceFor('k', make);
    expect(made).toBe(2);
  });
});

describe('the line and which table the first ascension starts on', () => {
  it('says which answered, in a player’s words', () => {
    expect(choiceLine('account')).toBe('Built for your account');
    expect(choiceLine('gear')).toBe('Built for your exact gear');
    expect(choiceLine('maxed', ['earnings set', 'delivery set'])).toBe(
      'Maxed gear (yours differs: earnings set, delivery set)'
    );
    expect(choiceLine('maxed')).toBe('Maxed gear');
    expect(choiceLine('maxed', [])).toBe('Maxed gear');
  });

  it('says so when only the later ascensions are on the account or gear table', () => {
    const acct = { kind: 'account' as const, header: head({ from: 120, to: 339 }) };
    const gear = { kind: 'gear' as const, header: head({ from: 120, to: 339 }) };
    expect(tableLineFor(acct, 100)).toBe('Maxed gear for TE below 120, then built for your account');
    expect(tableLineFor(gear, 100)).toBe('Maxed gear for TE below 120, then built for your exact gear');
    expect(tableLineFor(acct, 200)).toBe('Built for your account');
    expect(tableLineFor(acct, 345)).toBe('Maxed gear');
    expect(tableLineFor({ kind: 'maxed', header: MAXED, changed: ['earnings set'] }, 100)).toBe(
      'Maxed gear (yours differs: earnings set)'
    );
  });

  it('the chosen table only when the start TE is in its range', () => {
    const c = { kind: 'account' as const, header: head({ from: 120, to: 339 }) };
    expect(answeredBy(c, 120)).toBe('account');
    expect(answeredBy(c, 339)).toBe('account');
    expect(answeredBy(c, 119)).toBe('maxed');
    expect(answeredBy(c, 340)).toBe('maxed');
    expect(answeredBy({ kind: 'maxed', header: MAXED }, 200)).toBe('maxed');
  });
});

describe('chooseTable: a delivery table like the save’s, read with the earnings shift', () => {
  const T = 'tachyon-stone-4';
  const Q = 'quantum-stone-4';
  const s = (artifactId: string, ...stones: string[]) => ({ artifactId, stones });
  const MET_E = s('quantum-metronome-4-2', T, T);
  const COM = s('interstellar-compass-4-3', T, T);
  const GUS = s('gusset-4-3', Q, T, T);
  const MET_L = s('quantum-metronome-4-3', T, T, T);
  const LIKE = [MET_E, COM, GUS, s('lunar-totem-4-3', T, T, T)];
  const KEY = deliveryKey(['quantum-metronome-4-2', 'interstellar-compass-4-3', 'gusset-4-3', 'lunar-totem-4-3']);
  const DEL_URL = `${BASE}delivery-${KEY}.bin`;
  /** The maxed table's own set at its k3 (a puzzle cube 4th, as joo717's). */
  const MAXED_SET = [GUS, COM, MET_L, s('puzzle-cube-4-3', T, T, T)];
  const MAX = head({ from: 75, to: 339, cteBonus: 128.71, k3: { research: K3, delivery: MAXED_SET } });
  const DEL = head({ from: 120, to: 489, cteBonus: 128.71, deliveryKey: KEY });
  const INDEX = [{ name: `delivery-${KEY}.bin.gz`, kind: 'delivery', deliveryKey: KEY, simVersion: SIM_VERSION }];

  /** A site with these files, an index, and a save wearing `set` (picked at the maxed k3) with `cte`. */
  function site(
    o: {
      files?: Record<string, TableHeader>;
      set?: typeof LIKE | null;
      cte?: number | null;
      index?: (() => Promise<unknown>) | null;
      mine?: (r: Record<string, number>) => TableGear | null;
    },
    log: string[] = []
  ): ChoiceDeps {
    const files = o.files ?? { '/p/table.bin': MAX, [DEL_URL]: DEL };
    return {
      ...deps(files, o.mine ?? (() => null), log),
      deliveryAt: r => {
        expect(r).toEqual(K3);
        return o.set === undefined ? LIKE : o.set;
      },
      earningsCTE: () => (o.cte === undefined ? 103.78 : o.cte),
      index: (o.index === undefined ? async () => INDEX : (o.index ?? undefined)) as ChoiceDeps['index'],
    };
  }

  it('the exact own-account table still comes first, and the index is not asked', async () => {
    let asked = 0;
    const own = head({ gear: gear(OWN_RESEARCH) });
    const c = await chooseTable(
      input,
      site({
        files: { '/p/table.bin': MAX, [BASE + ACCT]: own, [DEL_URL]: DEL },
        mine: r => gear(r),
        index: async () => (asked++, INDEX),
      })
    );
    expect(c.kind).toBe('account');
    expect(asked).toBe(0);
  });

  it('a delivery match: the delivery table, its shift from its own cteBonus, one probe for it', async () => {
    const log: string[] = [];
    const c = await chooseTable(input, site({}, log));
    expect(c).toEqual({
      url: DEL_URL,
      header: DEL,
      maxed: MAX,
      kind: 'delivery',
      shift: 24.93,
      delivery: ['quantum-metronome-4-2', 'interstellar-compass-4-3', 'gusset-4-3', 'lunar-totem-4-3'],
    });
    expect(log.filter(u => u.includes('delivery-'))).toEqual([DEL_URL]);
    expect(log[0]).toBe('/p/table.bin');
    // Earnings as the table's: no shift.
    expect((await chooseTable(input, site({ cte: 128.71 }))).shift).toBe(0);
  });

  it('a 4th that is any 3-slot T4L is the same delivery (it holds the same stones)', async () => {
    const c = await chooseTable(input, site({ set: [MET_E, COM, GUS, s('puzzle-cube-4-3', T, T, T)] }));
    expect(c.kind).toBe('delivery');
    expect(c.url).toBe(DEL_URL);
    const two = await chooseTable(input, site({ set: [MET_E, COM, GUS, s('puzzle-cube-4-2', T, T)] }));
    expect(two.kind).toBe('maxed');
  });

  it('no table for the save’s set in the index: the maxed table, nothing more asked', async () => {
    const log: string[] = [];
    const other = [s('quantum-metronome-4-1', T, T), COM, GUS, s('lunar-totem-4-3', T, T, T)];
    const c = await chooseTable(input, site({ set: other }, log));
    expect(c).toEqual({ url: '/p/table.bin', header: MAX, maxed: MAX, kind: 'maxed' });
    expect(log.some(u => u.includes('delivery-'))).toBe(false);
    // No set a delivery table stands for (no gusset): the index is not even needed.
    expect(
      (
        await chooseTable(
          input,
          site({ set: [MET_E, COM, s('puzzle-cube-4-3', T, T, T), s('lunar-totem-4-3', T, T, T)] })
        )
      ).kind
    ).toBe('maxed');
  });

  it('index.json missing or failing: as before (the maxed table), no delivery table asked for', async () => {
    for (const index of [async () => null, async () => Promise.reject(new Error('down')), null]) {
      const log: string[] = [];
      const c = await chooseTable(input, site({ index }, log));
      expect(c.kind).toBe('maxed');
      expect(log.some(u => u.includes('delivery-'))).toBe(false);
    }
  });

  it('refused: a header keyed for another set, another simulator, or a shift past the table', async () => {
    const wrong = await chooseTable(
      input,
      site({ files: { '/p/table.bin': MAX, [DEL_URL]: { ...DEL, deliveryKey: '00000000' } } })
    );
    expect(wrong.kind).toBe('maxed');
    const other = await chooseTable(
      input,
      site({ files: { '/p/table.bin': MAX, [DEL_URL]: { ...DEL, simVersion: 'x' } } })
    );
    expect(other.kind).toBe('maxed');
    // The index says another simulator: not fetched at all.
    const log: string[] = [];
    await chooseTable(input, site({ index: async () => [{ ...INDEX[0], simVersion: 'x' }] }, log));
    expect(log.some(u => u.includes('delivery-'))).toBe(false);
    const far = await chooseTable(input, site({ files: { '/p/table.bin': MAX, [DEL_URL]: { ...DEL, to: 140 } } }));
    expect(far.kind).toBe('maxed');
  });

  it('no save or no earnings: nothing to shift by, the maxed table', async () => {
    expect((await chooseTable(input, site({ cte: null }))).kind).toBe('maxed');
    expect((await chooseTable(input, site({ set: null }))).kind).toBe('maxed');
  });

  it('the maxed table’s own delivery set, only earnings below: the maxed table read with the shift', async () => {
    const mine = [MET_L, COM, GUS, s('lunar-totem-4-3', T, T, T)];
    const c = await chooseTable(input, site({ set: mine }));
    expect(c).toMatchObject({ url: '/p/table.bin', header: MAX, kind: 'maxed-shift', shift: 24.93 });
    expect(ownRange(c)).toEqual({ from: 100, to: 339 });
    // Earnings as the table's: the plain maxed table.
    expect((await chooseTable(input, site({ set: mine, cte: 128.71 }))).kind).toBe('maxed');
  });

  it('per leg: below from + Δ the maxed table answers, and the line says so', async () => {
    const c = await chooseTable(input, site({}));
    expect(ownRange(c)).toEqual({ from: 145, to: 489 });
    expect(answeredBy(c, 144.9)).toBe('maxed');
    expect(answeredBy(c, 145)).toBe('delivery');
    expect(answeredBy(c, 400)).toBe('delivery');
    expect(tableLineFor(c, 200)).toBe(
      'Built for gear like yours: delivery metronome T4E, compass T4L, gusset T4L, earnings read 24.9 TE lower'
    );
    expect(tableLineFor(c, 130)).toBe(
      'Maxed gear for TE below 145, then built for gear like yours: delivery metronome T4E, compass T4L, gusset T4L, earnings read 24.9 TE lower'
    );
    expect(tableLineFor({ ...c, shift: 0 }, 200)).toBe(
      'Built for gear like yours: delivery metronome T4E, compass T4L, gusset T4L, earnings match'
    );
    expect(shiftWords(0.04)).toBe('earnings read 0.1 TE lower');
    const m = await chooseTable(input, site({ set: [MET_L, COM, GUS, s('lunar-totem-4-3', T, T, T)] }));
    expect(tableLineFor(m, 200)).toBe('Maxed gear, earnings read 24.9 TE lower (your delivery matches)');
    expect(tableLineFor(m, 90)).toBe(
      'Maxed gear for TE below 100, then maxed gear, earnings read 24.9 TE lower (your delivery matches)'
    );
  });
});
