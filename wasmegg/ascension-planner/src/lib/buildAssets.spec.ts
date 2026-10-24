import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { digest, freshBrotli, restoreKept, verifyAssets, writeBrotliCopies } from './buildAssets';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'aap-assets-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const js = (n: number) => `export const a${n} = ${'1+'.repeat(800)}1;\n`;

describe('the build never leaves a broken chunk to serve (14 Oct 2026: egg-beta stuck loading)', () => {
  it('serves no brotli copy that is empty or older than its file', () => {
    const f = path.join(dir, 'a.js');
    writeFileSync(f, js(1));
    writeFileSync(`${f}.br`, '');
    expect(freshBrotli(f, `${f}.br`)).toBe(false);
    writeFileSync(`${f}.br`, brotliCompressSync(js(1)));
    expect(freshBrotli(f, `${f}.br`)).toBe(true);
    const old = statSync(f).mtime.getTime() / 1000 - 60;
    utimesSync(`${f}.br`, old, old);
    expect(freshBrotli(f, `${f}.br`)).toBe(false);
    expect(freshBrotli(f, path.join(dir, 'none.js.br'))).toBe(false);
  });

  it('writes each brotli copy whole, leaves no temporary files, and keeps an up-to-date one', async () => {
    writeFileSync(path.join(dir, 'a.js'), js(1));
    writeFileSync(path.join(dir, 'tiny.js'), 'export {};');
    await writeBrotliCopies(dir);
    expect(brotliDecompressSync(readFileSync(path.join(dir, 'a.js.br'))).toString()).toBe(js(1));
    expect(readdirSync(dir).sort()).toEqual(['a.js', 'a.js.br', 'tiny.js']);
    const before = statSync(path.join(dir, 'a.js.br')).mtimeMs;
    await writeBrotliCopies(dir);
    expect(statSync(path.join(dir, 'a.js.br')).mtimeMs).toBe(before);
  });

  it("puts back only what this build didn't emit, and never an old brotli copy of a name it did", async () => {
    const stash = path.join(dir, 'stash');
    const assets = path.join(dir, 'assets');
    mkdirSync(stash);
    mkdirSync(assets);
    writeFileSync(path.join(stash, 'old.js'), js(1));
    writeFileSync(path.join(stash, 'same.js'), js(2));
    writeFileSync(path.join(stash, 'same.js.br'), brotliCompressSync(js(2)));
    writeFileSync(path.join(assets, 'same.js'), js(3));
    await restoreKept(stash, assets, new Map([['same.js', digest(Buffer.from(js(3)))]]));
    expect(readFileSync(path.join(assets, 'old.js'), 'utf8')).toBe(js(1));
    expect(readFileSync(path.join(assets, 'same.js'), 'utf8')).toBe(js(3));
    expect(readdirSync(assets)).not.toContain('same.js.br');
  });

  it('finds a file that is not what the build emitted, and a brotli copy that is empty or wrong', async () => {
    writeFileSync(path.join(dir, 'a.js'), js(1));
    writeFileSync(path.join(dir, 'a.js.br'), brotliCompressSync(js(1)));
    writeFileSync(path.join(dir, 'b.js'), js(2));
    writeFileSync(path.join(dir, 'b.js.br'), '');
    writeFileSync(path.join(dir, 'c.js'), js(9));
    const emitted = new Map([
      ['a.js', digest(Buffer.from(js(1)))],
      ['b.js', digest(Buffer.from(js(2)))],
      ['c.js', digest(Buffer.from(js(3)))],
      ['d.js', digest(Buffer.from(js(4)))],
    ]);
    expect(await verifyAssets(dir, emitted)).toEqual([
      'b.js.br: does not unpack',
      'c.js: on disk is not what the build emitted',
      'd.js: missing',
    ]);
  });
});
