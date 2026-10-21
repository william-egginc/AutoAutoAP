/**
 * The account and gear tables' wiring, read from the source: the player id goes only into the slow
 * hash (tableGear.ts tableName), never into a request, a file, a log or an error; probes are quiet;
 * the chosen table is used wherever the maxed one was.
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { probeHeader } from './instantClient';

const SRC = join(__dirname, '..');
const OURS = [join(SRC, 'instant'), join(SRC, 'components', 'instant')];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const ours = OURS.flatMap(files).filter(p => /\.(ts|vue)$/.test(p) && !/\.spec\.ts$|\.fixture\.ts$/.test(p));
const card = readFileSync(join(SRC, 'components', 'instant', 'InstantAnswer.vue'), 'utf8');

describe('no player id in a request', () => {
  it('only the card reads eiUserId, and only to hash it into the account table’s name', () => {
    const readers = ours.filter(p => readFileSync(p, 'utf8').includes('eiUserId')).map(p => relative(SRC, p));
    expect(readers).toEqual([join('components', 'instant', 'InstantAnswer.vue')]);
    const lines = card.split('\n').filter(l => /\bid\b|eiUserId/.test(l) && /tableName|eiUserId/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    // The id is read and handed to tableName; no line with it builds a URL, fetches or logs.
    for (const l of lines) expect(l).not.toMatch(/precompute|fetch|console|TABLE_|url|`/i);
    expect(card).toMatch(/tableName\(id\)/);
  });

  it('the probes log nothing (a missing table is the usual case)', () => {
    for (const f of [
      'tableChoice.ts',
      'tableFetch.ts',
      'tableGear.ts',
      'instant.worker.ts',
      'instantClient.ts',
      'deliveryTables.ts',
      'earningsShift.ts',
    ])
      expect(readFileSync(join(SRC, 'instant', f), 'utf8')).not.toMatch(/console\./);
  });
});

describe('the chosen table is used wherever the maxed one was', () => {
  it('only the card names the maxed table’s file', () => {
    const naming = ours.filter(p =>
      /precompute\/|'table\.bin'/.test(readFileSync(p, 'utf8').replace(/^\s*(\/\*\*|\*|\/\/).*$/gm, ''))
    );
    expect(naming.map(p => relative(SRC, p))).toEqual([join('components', 'instant', 'InstantAnswer.vue')]);
  });

  it('the answer gets the chosen table, and kept answers are kept per table', () => {
    expect(card).toMatch(/answer\(\s*id,\s*TABLE_URL,[\s\S]*?ownUrl\.value,\s*ownShift\.value,\s*ownScale\.value\s*\)/);
    // The table read, its earnings shift and its delivery scale are part of the kept answer's key.
    expect(card).toMatch(
      /function answerKey[\s\S]*?JSON\.stringify\(\[\s*TABLE_URL,\s*ownUrl\.value \?\? null,\s*ownShift\.value,\s*ownScale\.value,/
    );
    // The header comes from the choice, probed once per save.
    expect(card).toMatch(/const c = await tableFor\(\)/);
    expect(card).not.toMatch(/tableHeader\(TABLE_URL\)/);
  });

  it('the one line is on the card', () => {
    expect(card).toMatch(/data-testid="find-table"/);
  });
});

describe('the delivery tables and the earnings shift', () => {
  const choice = readFileSync(join(SRC, 'instant', 'tableChoice.ts'), 'utf8');
  const delivery = readFileSync(join(SRC, 'instant', 'deliveryTables.ts'), 'utf8');

  it('no player id: index.json is asked under the table base, a delivery table by its key only', () => {
    expect(delivery).not.toMatch(/eiUserId|userId|playerId/);
    expect(delivery).toMatch(/get\(base \+ 'index\.json'\)/);
    expect(delivery).toMatch(/`delivery-\$\{key\}\.bin`/);
    expect(choice).toMatch(/const url = input\.base \+ deliveryTableName\(key\)/);
    expect(card).toMatch(/index: \(\) => tableIndex\(base\)/);
    // Every url the card builds starts from the table base; the id goes only to tableName.
    for (const l of card.split('\n').filter(l => /tableIndex|deliveryAt|earningsCTE/.test(l)))
      expect(l).not.toMatch(/eiUserId|\bid\b/);
  });

  it('the caveat goes by the table that answered (tableCaveat), with the save’s research below max', () => {
    expect(card).toMatch(/const gearCaveat = computed\(\(\) =>\s*tableCaveat\(\s*by\.value,/);
    expect(card).toMatch(
      /const belowMax = computed\(\(\) => researchBelowMax\(initialState\.epicResearchLevels, initialState\.colleggtibleTiers\)\)/
    );
    expect(card).toMatch(
      /gearDiffers\(startTE\.value, gap\.value\) \? gearDiffersText\(gap\.value\) : null,\s*belowMax\.value,\s*weakStones\.value\s*\)/
    );
  });

  it('a delivery table is scaled at its own k3, the shifted maxed table by the maxed scale, once each', () => {
    expect(card).toMatch(/if \(c\?\.kind !== 'delivery' && c\?\.kind !== 'maxed-shift'\) return 1;/);
    expect(card).toMatch(/c\.kind === 'maxed-shift'\s*\?\s*scale\.value\s*:\s*deliveryScale\(backup\.value, c\.header\?\.k3,/);
    // 1 within float noise is 1 (a save with the table's own stones reads its cells as they are).
    expect(card).toMatch(/return Math\.abs\(s - 1\) < 1e-9 \? 1 : s;/);
    expect(card).toMatch(/weakDeliveryStones\(choice\.value\?\.stonesBelowT4, ownScale\.value\)/);
    // The worker scales own and maxed cells in the join and searches at a scale of 1 (no double scaling).
    const worker = readFileSync(join(SRC, 'instant', 'instant.worker.ts'), 'utf8');
    expect(worker).toMatch(/joined\(m\.own, m\.url, m\.req\.deliveryScale, m\.shift, m\.ownScale\)/);
    expect(worker).toMatch(/m\.own \? \{ \.\.\.m\.req, deliveryScale: 1 \} : m\.req/);
    expect(worker).toMatch(/compositeTable\(shiftedTable\([^)]*\), shift\), await load\(url\), scale, ownScale\)/);
  });
});

describe('probeHeader', () => {
  it('asks the worker as a probe, and a miss resolves null (no throw)', async () => {
    const sent: unknown[] = [];
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: unknown = null;
      postMessage(m: { id: number }) {
        sent.push(m);
        queueMicrotask(() =>
          this.onmessage?.({
            data: { kind: 'error', id: m.id, message: 'the instant answer could not be loaded (404)' },
          })
        );
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);
    expect(await probeHeader('/p/acct-x.bin')).toBeNull();
    expect(sent).toMatchObject([{ kind: 'header', url: '/p/acct-x.bin', probe: true }]);
    vi.unstubAllGlobals();
  });
});
