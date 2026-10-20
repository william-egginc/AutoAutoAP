import { beforeEach, describe, expect, it } from 'vitest';
import { SIM_VERSION } from './simVersion';
import type { TableHeader } from './precomputedTable';
import { answeredBy, choiceFor, choiceLine, chooseTable, forgetChoices, type ChoiceDeps } from './tableChoice';
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

  it('the chosen table only when the start TE is in its range', () => {
    const c = { kind: 'account' as const, header: head({ from: 120, to: 339 }) };
    expect(answeredBy(c, 120)).toBe('account');
    expect(answeredBy(c, 339)).toBe('account');
    expect(answeredBy(c, 119)).toBe('maxed');
    expect(answeredBy(c, 340)).toBe('maxed');
    expect(answeredBy({ kind: 'maxed', header: MAXED }, 200)).toBe('maxed');
  });
});
