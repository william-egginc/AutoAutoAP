/**
 * Both halves of "a CSV in parts" together: the app's uploader (src/search/progressSend.ts
 * `uploadCsv`) posting to this Worker over an in-memory KV, with the part size turned down so a small
 * file goes in several parts. No network: `fetch` is the Worker itself.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import worker from './worker.js';
import { uploadCsv } from '../src/search/progressSend';

function makeKV() {
  const m = new Map();
  const meta = new Map();
  return {
    _m: m,
    _meta: meta,
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async getWithMetadata(k, type) {
      const value = await this.get(k, type);
      return { value, metadata: value !== null && meta.has(k) ? meta.get(k) : null };
    },
    async put(k, v, opts) {
      m.set(k, v);
      if (opts && opts.metadata) meta.set(k, opts.metadata);
      else meta.delete(k);
    },
    async delete(k) {
      m.delete(k);
      meta.delete(k);
    },
    async list({ prefix, limit }) {
      const keys = [...m.keys()]
        .filter(k => k.startsWith(prefix))
        .sort()
        .slice(0, limit);
      return {
        keys: keys.map(name => (meta.has(name) ? { name, metadata: meta.get(name) } : { name })),
        list_complete: true,
      };
    },
  };
}

let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
});

const viaWorker = (input, init) => worker.fetch(new Request(input, init), env);
let n = 0;
async function submitted() {
  const res = await viaWorker('https://collector.test/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
    body: JSON.stringify({ schema: 3, chain: [195, 490], durationDays: 700 + ++n, finalTE: 490 }),
  });
  return res.json();
}
async function gz(text) {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
async function gunzip(buf) {
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const bigCsv = () =>
  'rank,chain,days\n' +
  Array.from({ length: 4000 }, (_, i) => `${i},195 ${(i * 7919) % 10007},${(i * 0.37).toFixed(3)}`).join('\n');

describe('uploadCsv against the collector', () => {
  it('sends a big CSV in parts, and GET /csv hands back the whole file', async () => {
    const csv = bigCsv();
    const body = await gz(csv);
    const { id, uploadToken } = await submitted();
    const partBytes = Math.ceil(body.byteLength / 5);
    const up = await uploadCsv(`https://collector.test/csv?id=${id}`, uploadToken, body, {
      fetch: viaWorker,
      partBytes,
      retryMs: [],
    });
    expect(up).toEqual({ kind: 'stored', parts: 5 });
    expect(env.SUBMISSIONS._meta.get(`csv:${id}`)).toEqual({ parts: 5 });
    const res = await viaWorker(`https://collector.test/csv?id=${id}`);
    expect(await gunzip(await res.arrayBuffer())).toBe(csv);
    const board = await (await viaWorker('https://collector.test/all')).json();
    expect(board.rows.find(r => r.id === id).hasCsv).toBe(true);
    // Sending it again is "already there", as for one file.
    expect(
      await uploadCsv(`https://collector.test/csv?id=${id}`, uploadToken, body, {
        fetch: viaWorker,
        partBytes,
        retryMs: [],
      })
    ).toEqual({
      kind: 'already',
    });
  });

  it('a small CSV is one upload, exactly as before', async () => {
    const csv = 'rank,chain\n1,195 490\n';
    const { id, uploadToken } = await submitted();
    const urls = [];
    const up = await uploadCsv(`https://collector.test/csv?id=${id}`, uploadToken, await gz(csv), {
      fetch: (u, i) => (urls.push(String(u)), viaWorker(u, i)),
    });
    expect(up).toEqual({ kind: 'stored', parts: 1 });
    expect(urls).toEqual([`https://collector.test/csv?id=${id}`]);
    expect(env.SUBMISSIONS._meta.has(`csv:${id}`)).toBe(false);
  });

  it('sends a lost part again when the seal says it is missing', async () => {
    const csv = bigCsv();
    const body = await gz(csv);
    const { id, uploadToken } = await submitted();
    let dropped = false;
    const lossy = async (u, i) => {
      const res = await viaWorker(u, i);
      // Part 2's write "lands" and is then lost (as a KV write not yet visible would look).
      if (!dropped && String(u).includes('part=2&')) {
        dropped = true;
        env.SUBMISSIONS._m.delete(`csv:${id}:p2`);
      }
      return res;
    };
    const up = await uploadCsv(`https://collector.test/csv?id=${id}`, uploadToken, body, {
      fetch: lossy,
      partBytes: Math.ceil(body.byteLength / 3),
      retryMs: [],
    });
    expect(up).toEqual({ kind: 'stored', parts: 3 });
    expect(await gunzip(await (await viaWorker(`https://collector.test/csv?id=${id}`)).arrayBuffer())).toBe(csv);
  });

  it('with a wrong token, is refused and stores nothing', async () => {
    const body = await gz(bigCsv());
    const { id } = await submitted();
    const up = await uploadCsv(`https://collector.test/csv?id=${id}`, 'f'.repeat(64), body, {
      fetch: viaWorker,
      partBytes: Math.ceil(body.byteLength / 3),
      retryMs: [],
    });
    expect(up).toEqual({ kind: 'refused' });
    expect([...env.SUBMISSIONS._m.keys()].some(k => k.startsWith('csv:'))).toBe(false);
  });
});
