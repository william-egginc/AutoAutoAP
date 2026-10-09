import { describe, expect, it } from 'vitest';
import {
  csvNote,
  csvSettled,
  gzipChunksCapped,
  progressDetail,
  PROGRESS_CSV_LIMIT_BYTES,
  sizeLabel,
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
      '3,735 chains; CSV too big to send (over 8.0 MB compressed)'
    );
    expect(progressDetail(12, 'routes', { kind: 'none' })).toBe('12 routes');
    expect(progressDetail(12, 'routes', { kind: 'off' })).toMatch(/unticked/);
    expect(progressDetail(12, 'routes', { kind: 'not-taken' })).toMatch(/doesn't take one mid-run yet/);
    expect(progressDetail(12, 'routes', { kind: 'failed', why: 'x' })).toMatch(/didn't upload/);
  });

  it('never promises the final will carry a CSV too big for the board (the same 8 MB cap)', () => {
    const note = csvNote({ kind: 'too-big', bytes: 9 * 1024 * 1024 });
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
