/**
 * An own table looked up under its `.v2` name first, then the plain one (tableGear.ts ownTableNames, tableFetch.ts
 * probeFirst), as InstantRoute.vue does it: a fake site, each request counted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { packTable, restampTable, type TableHeader } from './precomputedTable';
import { fetchTable, gzOnlyWhenMissing, probeFirst, type FetchDeps } from './tableFetch';

const base = { referenceWeek: 1, cteBonus: 128.71, deliveryScore: 1, from: 200, to: 201, builtAt: 'x' };
const v1 = packTable({ version: 1, ...base }, []);
const v2 = packTable({ version: 2, ...base }, []);
/** A version this page can't read (a newer page's). */
const v3 = restampTable(v1.slice().buffer, { version: 3 as unknown as 1 });
const html = new TextEncoder().encode('<!doctype html><html></html>');

const PLAIN = '/p/acct-0123456789abcdef01234567.bin';
const V2 = '/p/acct-0123456789abcdef01234567.v2.bin';

/** A site with these files (each also as `.gz`); anything else the app's page (status 200, HTML) or a 404. */
function site(files: Record<string, Uint8Array>, log: string[], missing: 'html' | '404' = 'html'): FetchDeps['fetch'] {
  return async url => {
    log.push(url);
    const name = url.replace(/\.gz$/, '');
    const f = files[name];
    if (!f) {
      return missing === '404'
        ? new Response(null, { status: 404 })
        : new Response(html as unknown as BodyInit, { headers: { 'content-type': 'text/html' } });
    }
    return new Response((url.endsWith('.gz') ? gzipSync(f) : f) as unknown as BodyInit, {
      headers: { 'content-type': 'application/octet-stream' },
    });
  };
}

async function lookup(files: Record<string, Uint8Array>, missing: 'html' | '404' = 'html') {
  const log: string[] = [];
  const deps = { fetch: site(files, log, missing), DecompressionStream };
  const found = await probeFirst<TableHeader>([V2, PLAIN], url => fetchTable(url, deps).then(t => t.header));
  return { found, log };
}

afterEach(() => vi.restoreAllMocks());

describe('own table: .v2 name first, then the plain one', () => {
  it('a hit on the .v2 name: one name asked for, one request (its .gz)', async () => {
    const { found, log } = await lookup({ [V2]: v2, [PLAIN]: v1 });
    expect(found?.url).toBe(V2);
    expect(found?.header.version).toBe(2);
    expect(log).toEqual([`${V2}.gz`]);
  });

  it('the .v2 name missing, a version 1 file under the plain one: two requests, the plain one only after', async () => {
    for (const missing of ['html', '404'] as const) {
      const { found, log } = await lookup({ [PLAIN]: v1 }, missing);
      expect(found?.url).toBe(PLAIN);
      expect(found?.header.version).toBe(1);
      expect(log).toEqual([`${V2}.gz`, `${PLAIN}.gz`]);
    }
  });

  it('both missing: two requests (one .gz per name, never the plain file), null, nothing on the console', async () => {
    const spies = (['error', 'warn', 'log', 'info'] as const).map(m => vi.spyOn(console, m));
    for (const missing of ['html', '404'] as const) {
      const { found, log } = await lookup({}, missing);
      expect(found).toBeNull();
      expect(log).toEqual([`${V2}.gz`, `${PLAIN}.gz`]);
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('a .gz that is there but broken falls back to that name\'s plain file; no .gz at all is no table there', async () => {
    const log: string[] = [];
    const broken: FetchDeps['fetch'] = async url => {
      log.push(url);
      if (url === `${V2}.gz`) return new Response(gzipSync(v2).subarray(0, 20) as unknown as BodyInit);
      if (url === V2) return new Response(v2 as unknown as BodyInit);
      return new Response(null, { status: 404 });
    };
    const found = await probeFirst([V2, PLAIN], u => fetchTable(u, { fetch: broken, DecompressionStream }).then(t => t.header));
    expect(found?.url).toBe(V2);
    expect(log).toEqual([`${V2}.gz`, V2]);
    // Only the plain file on the server (never deployed that way): a miss, one request per name.
    const plainLog: string[] = [];
    const onlyPlain: FetchDeps['fetch'] = async url => {
      plainLog.push(url);
      return url.endsWith('.gz') ? new Response(null, { status: 404 }) : new Response(v1 as unknown as BodyInit);
    };
    expect(await probeFirst([V2, PLAIN], u => fetchTable(u, { fetch: onlyPlain }).then(t => t.header))).toBeNull();
    expect(plainLog).toEqual([`${V2}.gz`, `${PLAIN}.gz`]);
  });

  it('only own and gear names skip the plain file on a missing .gz; the maxed table keeps the fallback', async () => {
    expect(gzOnlyWhenMissing(V2)).toBe(true);
    expect(gzOnlyWhenMissing(PLAIN)).toBe(true);
    expect(gzOnlyWhenMissing('/p/gear-aaaaaaaaaaaaaaaaaaaaaaaa.v2.bin')).toBe(true);
    expect(gzOnlyWhenMissing('/p/table-v2.bin')).toBe(false);
    expect(gzOnlyWhenMissing('/p/table.bin')).toBe(false);
    const log: string[] = [];
    const maxed = '/p/table-v2.bin';
    const t = await fetchTable(maxed, { fetch: site({}, log, '404') }).catch(() => null);
    expect(t).toBeNull();
    expect(log).toEqual([`${maxed}.gz`, maxed]);
  });

  it('a gear table missing under all six names: six requests, one .gz each', async () => {
    const names = ['v3', 'canon', 'legacy'].map(n => `/p/gear-${n}.v2.bin`);
    const urls = [...names, ...names.map(n => n.replace('.v2.bin', '.bin'))];
    const log: string[] = [];
    const deps = { fetch: site({}, log, '404'), DecompressionStream };
    expect(await probeFirst(urls, u => fetchTable(u, deps).then(t => t.header))).toBeNull();
    expect(log).toEqual(urls.map(u => `${u}.gz`));
  });

  it('a version 2 file under the old plain name (deployed before .v2 names) is read: this page reads version 2', async () => {
    const { found } = await lookup({ [PLAIN]: v2 });
    expect(found?.url).toBe(PLAIN);
    expect(found?.header.version).toBe(2);
  });

  it('a version this page cannot read, under either name, is no table: quietly, never the error', async () => {
    const spies = (['error', 'warn'] as const).map(m => vi.spyOn(console, m));
    expect((await lookup({ [PLAIN]: v3 })).found).toBeNull();
    expect((await lookup({ [V2]: v3 })).found).toBeNull();
    // An unreadable .v2 file gives way to a readable plain one.
    expect((await lookup({ [V2]: v3, [PLAIN]: v1 })).found?.url).toBe(PLAIN);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('a stall on the .v2 name is thrown on: the plain name is not asked for (no second 30 s)', async () => {
    const log: string[] = [];
    const stall = (url: string) => {
      log.push(url);
      return Promise.reject(new Error('the instant answer download stalled (timeout)'));
    };
    await expect(probeFirst([V2, PLAIN], stall)).rejects.toThrow('stalled');
    expect(log).toEqual([V2]);
  });
});
