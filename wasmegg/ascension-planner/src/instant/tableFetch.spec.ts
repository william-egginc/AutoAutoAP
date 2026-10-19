import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { packTable } from './precomputedTable';
import { fetchTable, type FetchDeps } from './tableFetch';

const table = packTable(
  { version: 1, referenceWeek: 1, cteBonus: 128.71, deliveryScore: 1, from: 200, to: 201, builtAt: 'x' },
  [
    {
      te: 201,
      h: 3,
      builds: [{ sales: 1, tier13: false, waitStart: 1, saleEnd: 2, peakELR: 3, delivered: [1, 2, 3, 4, 5] }],
    },
  ]
);
const gz = gzipSync(table);
const html = new TextEncoder().encode('<!doctype html><html></html>');

/** A site: each path's body and content type, everything else the app's page (status 200, HTML). */
function site(files: Record<string, { body: Uint8Array; type?: string }>, log: string[] = []): FetchDeps['fetch'] {
  return async url => {
    log.push(url);
    const f = files[url];
    if (!f) return new Response(html as unknown as BodyInit, { headers: { 'content-type': 'text/html' } });
    return new Response(f.body as unknown as BodyInit, {
      headers: { 'content-type': f.type ?? 'application/octet-stream' },
    });
  };
}
const ok = (t: Awaited<ReturnType<typeof fetchTable>>) => expect(t.lookup(201, 3)).toHaveLength(1);

describe('fetchTable', () => {
  it('reads the .gz, unpacking it itself when the server sends it packed', async () => {
    const log: string[] = [];
    ok(await fetchTable('t.bin', { fetch: site({ 't.bin.gz': { body: gz } }, log), DecompressionStream }));
    expect(log).toEqual(['t.bin.gz']);
  });

  it('reads the .gz when the browser has already unpacked it (Content-Encoding: gzip)', async () => {
    const log: string[] = [];
    ok(await fetchTable('t.bin', { fetch: site({ 't.bin.gz': { body: table } }, log), DecompressionStream }));
    expect(log).toEqual(['t.bin.gz']);
  });

  it('falls back to the plain file: no .gz, a cut-short .gz, or nothing to unpack it with', async () => {
    const plain = { 't.bin': { body: table } };
    ok(await fetchTable('t.bin', { fetch: site(plain), DecompressionStream }));
    const cut = { ...plain, 't.bin.gz': { body: gz.subarray(0, gz.length >> 1) } };
    ok(await fetchTable('t.bin', { fetch: site(cut), DecompressionStream }));
    const unpackedShort = { ...plain, 't.bin.gz': { body: table.subarray(0, table.length - 8) } };
    ok(await fetchTable('t.bin', { fetch: site(unpackedShort), DecompressionStream }));
    const log: string[] = [];
    ok(await fetchTable('t.bin', { fetch: site({ ...plain, 't.bin.gz': { body: gz } }, log) }));
    expect(log).toEqual(['t.bin.gz', 't.bin']);
  });

  it('fails when neither file is there, or the plain one is cut short', async () => {
    await expect(fetchTable('t.bin', { fetch: site({}), DecompressionStream })).rejects.toThrow('404');
    await expect(
      fetchTable('t.bin', {
        fetch: site({ 't.bin': { body: table.subarray(0, table.length - 8) } }),
        DecompressionStream,
      })
    ).rejects.toThrow('incomplete');
  });
});
