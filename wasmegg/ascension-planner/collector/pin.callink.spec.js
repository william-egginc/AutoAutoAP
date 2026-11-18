/**
 * The PIN and the saved calendar link (pin.js, callink kind of sync.js; notes/calendar-link-across-browsers-2026-11-18.md): setting a
 * PIN ends the older links, so the saved (encrypted) copy of them goes too; afterwards the record needs the session like the rest.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { handleSync } from './sync.js';
import { handleCal } from './cal.js';
import { handlePin, pinResetsDue } from './pin.js';
import { makeD1 } from './d1shim.js';

const K = 'a'.repeat(64);
const PK = '1'.repeat(64);
const SALT = 'f'.repeat(64);
const T0 = Date.UTC(2026, 10, 18, 18, 0, 0);
const DAY = 86_400_000;
const b64 = n => Buffer.alloc(n, 7).toString('base64');
const REC = { v: 1, iv: b64(12), ct: b64(100) };
let env;
beforeEach(() => {
  env = { WATCH: makeD1(), ACCOUNT_KEY_SALT: SALT, PIN_ENABLED: '1' };
});
const pin = (route, body, headers = {}, now = T0) =>
  handlePin(new Request(`https://c.example/pin/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5', ...headers }, body: JSON.stringify(body) }), env, now);
const putLink = (session, at = T0) => {
  const bytes = new TextEncoder().encode(JSON.stringify(REC));
  return handleSync(new Request(`https://c.example/sync?k=${K}&kind=callink&slot=0&at=${at}`, { method: 'PUT', headers: { 'content-length': String(bytes.length), ...(session ? { 'x-aaap-session': session } : {}) }, body: bytes }), env, T0 + 1000);
};
const getLink = session => handleSync(new Request(`https://c.example/sync/get?k=${K}&kind=callink&slot=0`, { headers: session ? { 'x-aaap-session': session } : {} }), env, T0 + 1000);
const mint = () => handleCal(new Request('https://c.example/cal/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K }) }), env, T0);
const rows = () => env.WATCH._db.prepare("SELECT COUNT(*) AS n FROM synced WHERE kind = 'callink'").get().n;

describe('callink and the PIN', () => {
  it('setting a PIN deletes the saved link record together with the links it was a copy of', async () => {
    await mint();
    expect((await putLink()).status).toBe(200);
    expect(rows()).toBe(1);
    const set = await (await pin('set', { k: K, pk: PK })).json();
    expect(set.revokedLinks).toBe(1);
    expect(rows()).toBe(0);
  });
  it('a stale record with no link is gone too', async () => {
    await putLink();
    await pin('set', { k: K, pk: PK });
    expect(rows()).toBe(0);
  });
  it('other synced records stay when a PIN is set', async () => {
    const ticks = '{"ticked":["a"]}';
    await handleSync(new Request(`https://c.example/sync?k=${K}&kind=ticks&slot=1793000000&at=${T0 - 1000}`, { method: 'PUT', headers: { 'content-length': String(ticks.length) }, body: ticks }), env, T0);
    await putLink();
    await pin('set', { k: K, pk: PK });
    expect(env.WATCH._db.prepare("SELECT COUNT(*) AS n FROM synced WHERE kind = 'ticks'").get().n).toBe(1);
  });
  it('after the PIN, the record needs the session: 401 without, works with', async () => {
    const { session } = await (await pin('set', { k: K, pk: PK })).json();
    expect((await putLink()).status).toBe(401);
    expect((await getLink()).status).toBe(401);
    expect((await putLink(session)).status).toBe(200);
    expect((await getLink(session)).status).toBe(200);
  });
  it('changing the PIN keeps the record (its key comes from the ID, not the PIN)', async () => {
    const { session } = await (await pin('set', { k: K, pk: PK })).json();
    await putLink(session);
    const { session: next } = await (await pin('change', { k: K, pk: '2'.repeat(64) }, { 'x-aaap-session': session })).json();
    expect((await getLink(next)).status).toBe(200);
  });
  it('the 7-day reset deletes it with everything else', async () => {
    const { session } = await (await pin('set', { k: K, pk: PK })).json();
    await putLink(session);
    await pin('reset', { k: K });
    await pinResetsDue(env, T0 + 8 * DAY);
    expect(rows()).toBe(0);
  });
});
