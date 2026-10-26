import { describe, expect, it, vi } from 'vitest';
import { BLOCKED_WHY } from './uploadWhy';
import {
  csvNote,
  csvParts,
  csvSettled,
  CSV_MAX_PARTS,
  CSV_PART_BYTES,
  breathe,
  gzipChunksCapped,
  progressDetail,
  PROGRESS_CSV_LIMIT_BYTES,
  sizeLabel,
  uploadCsv,
} from './progressSend';

async function inflate(body: ArrayBuffer): Promise<string> {
  const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Text gzip barely shrinks: each line is random hex. */
function* noisy(lines: number): Generator<string> {
  for (let i = 0; i < lines; i++) {
    let row = '';
    for (let k = 0; k < 8; k++) row += Math.random().toString(16).slice(2);
    yield row + '\n';
  }
}

describe('gzipChunksCapped', () => {
  it('compresses chunk by chunk into one gzip that inflates back to the whole text', async () => {
    const chunks = ['# header\n', 'rank,chain\n', ...Array.from({ length: 50 }, (_, i) => `${i + 1},212 280 490\n`)];
    const out = await gzipChunksCapped(chunks, PROGRESS_CSV_LIMIT_BYTES);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const bytes = new Uint8Array(out.body);
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    expect(await inflate(out.body)).toBe(chunks.join(''));
  });

  it('scrubs each chunk before it is compressed', async () => {
    const fake = 'EI' + '1'.repeat(16);
    const out = await gzipChunksCapped([`a ${fake}\n`, 'b\n'], 1024 * 1024, t => t.replace(/EI\d{16}/g, 'EI[x]'));
    expect(out.ok).toBe(true);
    if (out.ok) expect(await inflate(out.body)).toBe('a EI[x]\nb\n');
  });

  it('stops once the compressed size passes the cap, without reading the rest', async () => {
    let pulled = 0;
    function* counted(): Generator<string> {
      for (const c of noisy(20_000)) {
        pulled++;
        yield c;
      }
    }
    const out = await gzipChunksCapped(counted(), 64 * 1024);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.atLeast).toBeGreaterThan(64 * 1024);
    expect(pulled).toBeLessThan(20_000);
  });
});

describe('the words for what went', () => {
  it('sizes in KB under a tenth of a megabyte, MB above', () => {
    expect(sizeLabel(10)).toBe('1 KB');
    expect(sizeLabel(50 * 1024)).toBe('50 KB');
    expect(sizeLabel(2.1 * 1024 * 1024)).toBe('2.1 MB');
  });

  it('says the count and the CSV for the status line', () => {
    expect(progressDetail(3735, 'chains', { kind: 'sent', bytes: 2.1 * 1024 * 1024 })).toBe('3,735 chains, CSV 2.1 MB');
    expect(progressDetail(3735, 'chains', { kind: 'too-big', bytes: 9 * 1024 * 1024 })).toBe(
      '3,735 chains; CSV too big to send (over 64.0 MB compressed)'
    );
    expect(progressDetail(12, 'routes', { kind: 'none' })).toBe('12 routes');
    expect(progressDetail(12, 'routes', { kind: 'off' })).toMatch(/unticked/);
    expect(progressDetail(12, 'routes', { kind: 'not-taken' })).toMatch(/doesn't take one mid-run yet/);
    expect(progressDetail(12, 'routes', { kind: 'failed', why: 'x' })).toMatch(/didn't upload/);
  });

  it('never promises the final will carry a CSV too big for the board (the same 64 MB cap)', () => {
    const note = csvNote({ kind: 'too-big', bytes: 65 * 1024 * 1024 });
    expect(note).toMatch(/too big to send/);
    expect(note).toMatch(/Download CSV/);
    expect(note).not.toMatch(/goes with the final/);
    expect(csvNote({ kind: 'sent', bytes: 1 })).toBe('');
    expect(csvNote({ kind: 'off' })).toBe('');
  });

  it('counts only a failed upload as worth sending again with nothing new', () => {
    expect(csvSettled({ kind: 'failed', why: 'x' })).toBe(false);
    for (const kind of ['off', 'none', 'not-taken'] as const) expect(csvSettled({ kind })).toBe(true);
    expect(csvSettled({ kind: 'sent', bytes: 1 })).toBe(true);
    expect(csvSettled({ kind: 'too-big', bytes: 1 })).toBe(true);
  });
});

describe('a CSV over the cap goes in parts (uploadCsv)', () => {
  const ok = (body: unknown = { ok: true }, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  /** A fake collector: answers each call with the next outcome, keeps the URLs. */
  function fake(...outcomes: (Response | Error)[]) {
    const urls: string[] = [];
    const bodies: number[] = [];
    const fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(u));
      bodies.push((init?.body as ArrayBuffer).byteLength);
      const next = outcomes.shift();
      if (!next) throw new Error('unexpected request ' + String(u));
      if (next instanceof Error) throw next;
      return next;
    }) as typeof globalThis.fetch;
    return { fetch, urls, bodies };
  }
  const URL_ = 'https://collector.test/csv?id=abcd1234';

  it('cuts the bytes into slices that join back to the file', () => {
    const body = new Uint8Array(25).map((_, i) => i).buffer;
    const parts = csvParts(body, 10);
    expect(parts.map(p => p.byteLength)).toEqual([10, 10, 5]);
    expect(new Uint8Array(parts[2])).toEqual(new Uint8Array([20, 21, 22, 23, 24]));
    expect(csvParts(body, 25)).toHaveLength(1);
    expect(PROGRESS_CSV_LIMIT_BYTES).toBe(CSV_PART_BYTES * CSV_MAX_PARTS);
  });

  it('sends one file as it always did: one POST, no part numbers', async () => {
    const f = fake(ok());
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(10), { fetch: f.fetch })).toEqual({ kind: 'stored', parts: 1 });
    expect(f.urls).toEqual([URL_]);
  });

  it('sends parts 1..m-1 first, then part 0, which seals it', async () => {
    const f = fake(ok(), ok(), ok());
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(25), { fetch: f.fetch, partBytes: 10, retryMs: [] })).toEqual({
      kind: 'stored',
      parts: 3,
    });
    expect(f.urls).toEqual([`${URL_}&part=1&parts=3`, `${URL_}&part=2&parts=3`, `${URL_}&part=0&parts=3`]);
    expect(f.bodies).toEqual([10, 5, 10]);
  });

  it('tries a part again after a dropped connection or a 5xx, and gives up after three', async () => {
    const f = fake(new TypeError('Failed to fetch'), ok({}, 502), ok(), ok());
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(20), { fetch: f.fetch, partBytes: 10, retryMs: [0, 0] })).toEqual(
      {
        kind: 'stored',
        parts: 2,
      }
    );
    expect(f.urls.filter(u => u.includes('part=1&'))).toHaveLength(3);
    const g = fake(new TypeError('x'), new TypeError('x'), new TypeError('x'));
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(20), { fetch: g.fetch, partBytes: 10, retryMs: [0, 0] })).toEqual(
      {
        kind: 'failed',
        why: BLOCKED_WHY,
      }
    );
  });

  it("says why a single file or a part didn't land: blocked or offline, the board's answer, or the error", async () => {
    const one = fake(new TypeError('Load failed'));
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(10), { fetch: one.fetch })).toEqual({ kind: 'failed', why: BLOCKED_WHY });
    const busy = fake(ok({}, 503));
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(10), { fetch: busy.fetch })).toEqual({
      kind: 'failed',
      why: 'the Leaderboard answered 503',
      status: 503,
    });
    const odd = fake(new Error('boom'), new Error('boom'), new Error('boom'));
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(20), { fetch: odd.fetch, partBytes: 10, retryMs: [0, 0] })).toEqual({
      kind: 'failed',
      why: 'the request failed (boom)',
    });
  });

  it('sends the parts the seal says are missing, then seals again', async () => {
    const f = fake(ok(), ok(), ok({ missing: [2] }, 422), ok(), ok());
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(25), { fetch: f.fetch, partBytes: 10, retryMs: [] })).toEqual({
      kind: 'stored',
      parts: 3,
    });
    expect(f.urls.slice(3)).toEqual([`${URL_}&part=2&parts=3`, `${URL_}&part=0&parts=3`]);
  });

  it('says so when the collector does not take parts yet (an old one refuses part 1 as not gzip)', async () => {
    const f = fake(ok({ error: 'body must be gzip' }, 400));
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(20), { fetch: f.fetch, partBytes: 10, retryMs: [] })).toEqual({
      kind: 'no-parts',
    });
    expect(f.urls).toHaveLength(1);
  });

  it('refuses more parts than the collector takes, without sending', async () => {
    const f = fake();
    const up = await uploadCsv(URL_, 't', new ArrayBuffer(CSV_MAX_PARTS * 10 + 1), { fetch: f.fetch, partBytes: 10 });
    expect(up).toEqual({ kind: 'too-big' });
    expect(f.urls).toHaveLength(0);
  });

  it('takes 409 as already stored, and stops on 403', async () => {
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(20), { fetch: fake(ok({}, 409)).fetch, partBytes: 10 })).toEqual({
      kind: 'already',
    });
    expect(await uploadCsv(URL_, 't', new ArrayBuffer(20), { fetch: fake(ok({}, 403)).fetch, partBytes: 10 })).toEqual({
      kind: 'refused',
    });
  });
});

describe('breathe (12 Oct: a hidden tab holds timers to one a minute)', () => {
  it('yields through a message, not a timer, so a hidden tab is not held back', async () => {
    // With setTimeout faked, a timer-based yield would never resolve and the test would time out.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await breathe();
      await breathe();
    } finally {
      vi.useRealTimers();
    }
  }, 2_000);
});
