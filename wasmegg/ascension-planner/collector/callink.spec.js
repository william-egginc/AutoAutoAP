/**
 * The `callink` sync kind (Jordan, 18 Nov 2026; notes/calendar-link-across-browsers-2026-11-18.md): the calendar link,
 * encrypted in the browser with a key the collector never sees, kept so every browser of the player can show it again.
 * The collector holds an opaque record { v: 1, iv, ct } and never a link in the clear. D1 is Node's in-memory SQLite.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { handleCal, pruneCal, CAL_EXPIRE_DAYS } from './cal.js';
import { handleForget, handleSync, SYNC_MAX_CALLINK_BYTES } from './sync.js';
import { makeD1 } from './d1shim.js';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const T0 = Date.UTC(2026, 10, 18, 17, 0, 0);
const DAY = 86_400_000;
const b64 = n => Buffer.alloc(n, 7).toString('base64');
const REC = (o = {}) => ({ v: 1, iv: b64(12), ct: b64(100), ...o });
let env;
beforeEach(() => {
  env = { WATCH: makeD1(), CSV_UPLOAD_KEY: 'test-upload-key' };
});
const put = (value, { k = K, kind = 'callink', slot = '0', at = T0, now = T0 } = {}) => {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return handleSync(new Request(`https://c.example/sync?k=${k}&kind=${kind}&slot=${slot}&at=${at}`, { method: 'PUT', headers: { 'content-length': String(bytes.length) }, body: bytes }), env, now);
};
const get = (k = K) => handleSync(new Request(`https://c.example/sync/get?k=${k}&kind=callink&slot=0`), env, T0);
const post = (path, body, now = T0) => handleCal(new Request(`https://c.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, now);
const callinkRows = () => env.WATCH._db.prepare("SELECT * FROM synced WHERE kind = 'callink'").all();

describe('the callink sync kind', () => {
  it('stores the opaque record per account and serves it back as sent', async () => {
    const res = await put(REC());
    expect(res.status).toBe(200);
    const got = await get();
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual(REC());
    expect((await get(K2)).status).toBe(404);
  });
  it('shows in the account list with its size', async () => {
    await put(REC());
    const list = await (await handleSync(new Request(`https://c.example/sync?k=${K}`), env, T0)).json();
    expect(list.records.map(r => r.kind)).toEqual(['callink']);
  });
  it('is slot 0 only', async () => {
    expect((await put(REC(), { slot: '1793000000' })).status).toBe(400);
  });
  it('last write wins by at: an older one is 409', async () => {
    await put(REC(), { at: T0 });
    expect((await put(REC({ ct: b64(90) }), { at: T0 - 1000 })).status).toBe(409);
    expect((await put(REC({ ct: b64(90) }), { at: T0 + 1000, now: T0 + 1000 })).status).toBe(200);
  });
  it('refuses anything but { v: 1, iv, ct } of base64: a link in the clear, extra fields, bad sizes', async () => {
    for (const bad of [
      'https://c.example/cal/AAAAAAAAAAAAAAAAAAAAAA.ics',
      { link: 'https://c.example/cal/AAAAAAAAAAAAAAAAAAAAAA.ics' },
      REC({ v: 2 }),
      REC({ extra: 'x' }),
      REC({ iv: b64(8) }),
      REC({ iv: 'not base64!!!!' }),
      REC({ ct: 'https://c.example/cal/AAAAAAAAAAAAAAAAAAAAAA.ics' }),
      REC({ ct: b64(10) }), // under the GCM tag plus anything
      REC({ ct: b64(320) }), // an encrypted link is about 100 bytes
      REC({ ct: '' }),
      [REC()],
      null,
    ]) {
      expect((await put(bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    expect(callinkRows().length).toBe(0);
  });
  it('is capped at SYNC_MAX_CALLINK_BYTES (413)', async () => {
    expect(SYNC_MAX_CALLINK_BYTES).toBe(512);
    expect((await put('x'.repeat(SYNC_MAX_CALLINK_BYTES + 1))).status).toBe(413);
  });
  it('never takes a player id', async () => {
    expect((await put(REC({ ct: '1234567890123456789012345' + b64(80) }))).status).toBe(400);
  });
});

describe('the callink record and the links', () => {
  const mint = async (k = K) => (await post('/cal/new', { k })).status;
  it('Reset link (revoke all) deletes the stored link record too', async () => {
    await mint();
    await put(REC());
    expect((await post('/cal/revoke', { k: K, all: true })).status).toBe(200);
    expect((await get()).status).toBe(404);
  });
  it('revoke all of one account leaves another account\'s record', async () => {
    await mint(K);
    await mint(K2);
    await put(REC(), { k: K });
    await put(REC(), { k: K2 });
    await post('/cal/revoke', { k: K, all: true });
    expect((await get(K2)).status).toBe(200);
  });
  it('revoking one link by its token (no account key) leaves the record: the cron cleans a stale one', async () => {
    const url = (await (await post('/cal/new', { k: K })).json()).url;
    await put(REC());
    await post('/cal/revoke', { token: url.match(/\/cal\/([A-Za-z0-9_-]{22})\.ics$/)[1] });
    expect((await get()).status).toBe(200);
    // no link left: the cron removes the record
    await pruneCal(env, T0);
    expect((await get()).status).toBe(404);
  });
  it('the cron keeps a record while the account still has a link, and drops it when the last link expires', async () => {
    await mint();
    await put(REC());
    await pruneCal(env, T0 + DAY);
    expect((await get()).status).toBe(200);
    await pruneCal(env, T0 + (CAL_EXPIRE_DAYS + 1) * DAY);
    expect((await get()).status).toBe(404);
  });
  it('Delete everything removes it', async () => {
    await mint();
    await put(REC());
    const res = await handleForget(new Request(`https://c.example/forget?k=${K}&all=1`, { method: 'DELETE' }), env, T0);
    expect(res.status).toBe(200);
    expect((await get()).status).toBe(404);
  });
  it('no key or plain link text is in any stored row', async () => {
    await mint();
    await put(REC());
    const all = JSON.stringify(env.WATCH._db.prepare('SELECT data FROM synced').all());
    expect(all).not.toContain('/cal/');
    expect(all).not.toContain(K);
  });
});

// The Workers runtime has no Node `Buffer` (no nodejs_compat): the first TEST deploy answered 500 "Buffer is not defined" (18 Nov 2026).
describe('no Node Buffer in the Worker', () => {
  it('stores and serves a record when Buffer.byteLength, which the Worker lacks, throws', async () => {
    const rec = REC();
    // A plain stand-in for the Request: Node's own Request needs Buffer to read a body; the Worker's code must not. (Node's Response needs
    // Buffer too, so the whole global cannot be removed here; the check below bans the call that failed and the next spec bans the word.)
    const req = (value, k = K) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      return { url: `https://c.example/sync?k=${k}&kind=callink&slot=0&at=${T0}`, method: 'PUT', headers: new Headers({ 'content-length': String(bytes.length) }), arrayBuffer: async () => bytes.buffer };
    };
    const good = req(rec);
    const short = req({ ...rec, ct: 'AAAA' }, K2);
    const saved = Buffer.byteLength;
    let a;
    let b;
    let err;
    // only the call the Worker made (base64 sizes): Node's own Response uses byteLength too
    Buffer.byteLength = (x, enc) => {
      if (enc === 'base64') throw new ReferenceError('Buffer is not defined');
      return saved(x, enc);
    };
    try {
      a = await handleSync(good, env, T0);
      b = await handleSync(short, env, T0);
    } catch (e) {
      err = e;
    } finally {
      Buffer.byteLength = saved;
    }
    expect(err?.stack).toBeUndefined();
    expect(a.status).toBe(200);
    expect(b.status).toBe(400);
    expect(await (await get()).json()).toEqual(rec);
  });
  it('no Worker file (collector/*.js that is not a spec) uses Buffer', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('.', import.meta.url);
    const bad = readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.spec.js') && /\bBuffer\b/.test(readFileSync(new URL(f, dir), 'utf8')));
    expect(bad).toEqual([]);
  });
});

describe('with ACCOUNT_KEY_SALT set (the TEST and live collectors have one)', () => {
  it('revoke all deletes the record, and the record is stored under the salted key', async () => {
    env.ACCOUNT_KEY_SALT = 'test-salt-not-a-real-secret';
    expect((await put(REC())).status).toBe(200);
    expect((await post('/cal/new', { k: K })).status).toBe(200);
    expect((await get()).status).toBe(200);
    expect(callinkRows()).toHaveLength(1);
    expect(callinkRows()[0].key).not.toBe(K);
    expect((await post('/cal/revoke', { k: K, all: true })).status).toBe(200);
    expect(callinkRows()).toHaveLength(0);
    expect((await get()).status).toBe(404);
  });
  it('the hourly cron cannot delete the record while a legacy account is re-keyed (every table moves in one batch, 21 Nov 2026)', async () => {
    // Rows made before the salt: raw key K in synced and cal_feeds.
    expect((await put(REC())).status).toBe(200);
    expect((await post('/cal/new', { k: K })).status).toBe(200);
    expect(callinkRows()[0].key).toBe(K);
    env.ACCOUNT_KEY_SALT = 'test-salt-not-a-real-secret';
    // The cron runs after every batch the move sends (the moment between two table moves, if there is one).
    const db = env.WATCH;
    const batch = db.batch.bind(db);
    db.batch = async stmts => {
      const r = await batch(stmts);
      await pruneCal({ WATCH: { prepare: q => db.prepare(q) } }, T0);
      return r;
    };
    expect((await get()).status).toBe(200);
    expect(callinkRows()).toHaveLength(1);
    expect(callinkRows()[0].key).not.toBe(K);
  });
  it('an older at with DIFFERENT bytes is 409; the same bytes at an older at is "unchanged" 200 (nothing changes)', async () => {
    expect((await put(REC(), { at: T0 })).status).toBe(200);
    expect((await put(REC({ ct: b64(101) }), { at: T0 - 5000 })).status).toBe(409);
    const same = await put(REC(), { at: T0 - 5000 });
    expect(same.status).toBe(200);
    expect((await same.json()).unchanged).toBe(true);
  });
});
