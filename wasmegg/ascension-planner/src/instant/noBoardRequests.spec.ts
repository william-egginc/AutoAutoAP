/**
 * The site makes no requests to the AutoAutoAP collector (the board): none of the files this fork adds
 * (src/instant, src/components/instant) may name it, its env vars or its row list. Joo's own code is
 * not scanned; this spec file itself is left out (it has to spell the words).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const OURS = [join(SRC, 'instant'), join(SRC, 'components', 'instant')];
const BANNED = ['collector', 'VITE_COLLECTOR_URL', 'VITE_SUBMIT_URL', '/all'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('no collector requests from our files', () => {
  const ours = OURS.flatMap(files).filter(p => p !== __filename && /\.(ts|vue|js)$/.test(p));

  it('finds our files', () => {
    expect(ours.length).toBeGreaterThan(10);
  });

  it.each(BANNED)('no file of ours mentions %s', word => {
    const hits = ours.filter(p => readFileSync(p, 'utf8').toLowerCase().includes(word.toLowerCase()));
    expect(hits.map(p => relative(SRC, p))).toEqual([]);
  });
});
