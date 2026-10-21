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
    for (const f of ['tableChoice.ts', 'tableFetch.ts', 'tableGear.ts', 'instant.worker.ts', 'instantClient.ts'])
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
    expect(card).toMatch(/answer\(\s*id,\s*TABLE_URL,[\s\S]*?ownUrl\.value\s*\)/);
    expect(card).toMatch(/function answerKey[\s\S]*?JSON\.stringify\(\[\s*TABLE_URL,\s*ownUrl\.value/);
    // The header comes from the choice, probed once per save.
    expect(card).toMatch(/const c = await tableFor\(\)/);
    expect(card).not.toMatch(/tableHeader\(TABLE_URL\)/);
  });

  it('the one line is on the card', () => {
    expect(card).toMatch(/data-testid="find-table"/);
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
