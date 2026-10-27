import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { BIG_CSV_PART_BYTES, bigCsvMessage, gzipCsvTo, uploadBigCsv, type BigCsvSink, type BigCsvSource } from './bigCsvUpload';

/** A sink in memory. */
function memorySink(): BigCsvSink & { bytes(): Uint8Array } {
  const parts: Uint8Array[] = [];
  const all = () => {
    const n = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  return {
    write: b => void parts.push(b.slice()),
    close: () => {
      const b = all();
      return { size: b.length, read: (at, len) => b.slice(at, at + len) };
    },
    bytes: all,
  };
}

/** The collector's /bigcsv routes as the contract has them, in memory. */
function fakeCollector(o: { token?: string; status?: number; loseOnce?: number; failNetworkTimes?: number; preUploaded?: number[]; partSize?: number } = {}) {
  const token = o.token ?? 'tok';
  let open: { bytes: number; partSize: number; parts: number; got: Map<number, Uint8Array> } | null = null;
  let kept: Uint8Array | null = null;
  let networkFails = o.failNetworkTimes ?? 0;
  let lost = false;
  const log: string[] = [];
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const f = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const route = u.pathname.replace(/^\/bigcsv\//, '');
    log.push(`${init.method} ${route}${u.searchParams.get('n') ? ' ' + u.searchParams.get('n') : ''}`);
    if (networkFails > 0) {
      networkFails--;
      throw new TypeError('network down');
    }
    if (o.status) return answer(o.status, { error: o.status === 503 ? 'big CSV uploads are not set up on this collector' : 'too small' });
    if ((init.headers as Record<string, string>)['x-upload-token'] !== token) return answer(403, { error: 'token' });
    if (kept && route !== 'parts') return answer(409, { error: 'already kept' });
    if (route === 'start') {
      if (!open) {
        const bytes = Number(u.searchParams.get('bytes'));
        const partSize = o.partSize ?? Number(u.searchParams.get('partSize'));
        open = { bytes, partSize, parts: Math.ceil(bytes / partSize), got: new Map() };
        for (const n of o.preUploaded ?? []) open.got.set(n, new Uint8Array(n < open.parts ? partSize : bytes - partSize * (open.parts - 1)));
      }
      return answer(200, { ok: true, state: 'open', partSize: open.partSize, parts: open.parts, bytes: open.bytes, uploaded: [...open.got].map(([n, b]) => ({ n, size: b.length })), resumed: (o.preUploaded ?? []).length > 0 });
    }
    if (!open) return answer(404, { error: 'no open upload' });
    if (route === 'part') {
      const n = Number(u.searchParams.get('n'));
      const body = init.body as Uint8Array;
      const want = n < open.parts ? open.partSize : open.bytes - open.partSize * (open.parts - 1);
      if (body.length !== want) return answer(400, { problems: [`part ${n} must be ${want} bytes`] });
      open.got.set(n, body.slice());
      return answer(200, { ok: true, n, size: body.length });
    }
    if (route === 'complete') {
      if (o.loseOnce && !lost) {
        lost = true;
        open.got.delete(o.loseOnce);
      }
      const missing = Array.from({ length: open.parts }, (_, i) => i + 1).filter(n => !open!.got.has(n));
      if (missing.length) return answer(409, { error: 'parts missing', missing });
      const out = new Uint8Array(open.bytes);
      for (const [n, b] of open.got) out.set(b, (n - 1) * open.partSize);
      if (out[0] !== 0x1f || out[1] !== 0x8b) return answer(422, { error: 'not gzip' });
      kept = out;
      return answer(200, { ok: true, bytes: out.length });
    }
    return answer(404, { error: 'route' });
  }) as unknown as typeof fetch;
  return { f, log, kept: () => kept };
}

async function* csv(rows: number, id = false) {
  yield '# ascension-planner chain search\n';
  if (id) yield `# note: EI${'1'.repeat(16)}\n`;
  for (let i = 0; i < rows; i += 1000) yield Array.from({ length: 1000 }, (_, k) => `${i + k},${Math.random()}`).join('\n') + '\n';
}
const scrub = (t: string) => t.replace(/EI\d{16}/g, 'EI-redacted');
const noSleep = async () => {};

async function file(rows = 20_000, id = false): Promise<BigCsvSource> {
  return gzipCsvTo(csv(rows, id), memorySink(), scrub);
}

describe('the full CSV, gzipped and scrubbed a chunk at a time', () => {
  it('unpacks to the same text, with no player id', async () => {
    const src = await gzipCsvTo(csv(3000, true), memorySink(), scrub);
    const text = gunzipSync(Buffer.from(await src.read(0, src.size))).toString('utf8');
    expect(text).toContain('EI-redacted');
    expect(text).not.toMatch(/EI\d{16}/);
    expect(text.split('\n').filter(l => /^\d/.test(l))).toHaveLength(3000);
  });
});

describe('uploadBigCsv against the contract', () => {
  it('starts, sends every part in order (the last the remainder) and completes', async () => {
    const src = await file();
    const c = fakeCollector();
    const r = await uploadBigCsv({ base: 'https://c.test/', id: 'abcd1234', token: 'tok', source: src, fetch: c.f, partSize: 100_000, sleep: noSleep });
    expect(r).toMatchObject({ kind: 'kept', bytes: src.size });
    expect(Buffer.compare(Buffer.from(c.kept()!), Buffer.from(await src.read(0, src.size)))).toBe(0);
    expect(c.log[0]).toBe('POST start');
    expect(c.log.at(-1)).toBe('POST complete');
    expect(BIG_CSV_PART_BYTES).toBe(64_000_000);
  });
  it('resumes an open upload: only the parts the server lacks go', async () => {
    const src = await file();
    const parts = Math.ceil(src.size / 100_000);
    const c = fakeCollector({ preUploaded: [1], partSize: 100_000 });
    const r = await uploadBigCsv({ base: 'https://c.test', id: 'abcd1234', token: 'tok', source: src, fetch: c.f, partSize: 100_000, sleep: noSleep });
    // The fake keeps zeros for part 1 (it "had" it), so only the parts it lacked were sent.
    expect(c.log.filter(l => l.startsWith('PUT'))).toHaveLength(parts - 1);
    expect(c.log).not.toContain('PUT part 1');
    expect(r.kind === 'kept' || r.kind === 'refused').toBe(true);
  });
  it('a part lost by the server is sent again after complete names it', async () => {
    const src = await file();
    const c = fakeCollector({ loseOnce: 2 });
    const r = await uploadBigCsv({ base: 'https://c.test', id: 'abcd1234', token: 'tok', source: src, fetch: c.f, partSize: 100_000, sleep: noSleep });
    expect(r.kind).toBe('kept');
    expect(c.log.filter(l => l === 'PUT part 2')).toHaveLength(2);
  });
  it('a network error is retried with backoff', async () => {
    const src = await file(2000);
    const c = fakeCollector({ failNetworkTimes: 2 });
    const waits: number[] = [];
    const r = await uploadBigCsv({ base: 'https://c.test', id: 'abcd1234', token: 'tok', source: src, fetch: c.f, partSize: 5_000_000, sleep: async ms => void waits.push(ms) });
    expect(r.kind).toBe('kept');
    expect(waits).toEqual([2000, 8000]);
  });
  it('not on this collector (503): unavailable and quiet; too small (422): refused, said plainly', async () => {
    const src = await file(100);
    expect(await uploadBigCsv({ base: 'https://c.test', id: 'x', token: 'tok', source: src, fetch: fakeCollector({ status: 503 }).f, sleep: noSleep })).toEqual({ kind: 'unavailable' });
    const small = await uploadBigCsv({ base: 'https://c.test', id: 'x', token: 'tok', source: src, fetch: fakeCollector({ status: 422 }).f, sleep: noSleep });
    expect(small).toMatchObject({ kind: 'refused', status: 422 });
    expect(bigCsvMessage({ kind: 'unavailable' })).toBe('');
    expect(bigCsvMessage(small)).toMatch(/^The full CSV was not kept: too small/);
  });
  it('a wrong token is refused (403), and a stop between parts leaves the upload open to resume', async () => {
    const src = await file();
    expect(await uploadBigCsv({ base: 'https://c.test', id: 'x', token: 'bad', source: src, fetch: fakeCollector().f, sleep: noSleep })).toMatchObject({ kind: 'refused', status: 403 });
    let k = 0;
    const r = await uploadBigCsv({ base: 'https://c.test', id: 'x', token: 'tok', source: src, fetch: fakeCollector().f, partSize: 100_000, shouldStop: () => ++k > 2, sleep: noSleep });
    expect(r).toEqual({ kind: 'stopped' });
  });
});

describe('when the full CSV goes, page and command line', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const store = src('../stores/chainSearch.ts');
  it("only after a run's own final send with its CSV, over 100,000 routes, with that row's final token", () => {
    expect(store).toContain(
      "if (!saved && !provisional && Number((payload as { chainsPriced?: number }).chainsPriced) > BIG_CSV_MIN_ROUTES)"
    );
    expect(store).toContain("bigCsvRow = { kind: deadlineSend ? 'deadline' : 'fastest', id, token: uploadToken };");
    expect(store).toContain('if (bigCsvRow && bigCsvAuto) void sendFullCsv();');
  });
  it('the file is the full CSV, scrubbed, from the one function a download reads', () => {
    expect(store).toContain('const source = await gzipCsvTo(streamFullCsv(row.kind), sink, scrubIdentifiers,');
  });
  it('the command line awaits it after --submit and submit --from, unless --no-full-csv', () => {
    const siteRun = src('../../scripts/siteRun.ts');
    const fastsearch = src('../../scripts/fastsearch.ts');
    expect(siteRun).toContain("store.setBigCsvPlatform({ sink: async () => (o.submit && !o.noFullCsv ? fileBigCsvSink(bigCsvPath) : null), auto: false });");
    expect(siteRun.match(/await sendFullCsvNow\(store\)/g)).toHaveLength(2);
    expect(fastsearch).toContain("res.uploadToken && priced > BIG_CSV_MIN_ROUTES && existsSync(full) && !has('no-full-csv')");
    expect(fastsearch).toContain('gzipCsvTo(gunzipLines(full), fileBigCsvSink(');
  });
});
