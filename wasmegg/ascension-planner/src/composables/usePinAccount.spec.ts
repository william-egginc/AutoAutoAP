/**
 * The account's PIN as the card sees it (composables/usePinAccount.ts): off, locked, open, unavailable; enter, set, change, remove, recover,
 * reset. Against a stand-in collector that behaves like collector/pin.js (a stored pk, a session per epoch, a throttle). Placeholder IDs only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinAccount } from './usePinAccount';
import { createPinSessions } from '@/lib/pinSession';
import { pinKeyOf } from '@/lib/pinCrypt';
import type { SyncFetch } from '@/lib/syncedRecords';

const K = 'a'.repeat(64);
const ID = 'EI1234567890123456';
const SYNC = 'https://collector.example/sync';
const ROUNDS = 1000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 18, 17, 0, 0);
const mac = (n: number) => String(n).padStart(64, 'c');

function memStore() {
  const m = new Map<string, string>();
  return { m, st: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
}
interface Call { path: string; body: Record<string, unknown> | null; session: string | undefined }
/** A collector with one account: nothing set, or a PIN (pk, epoch, recovery code), a reset timer. */
function collector(o: { pinOff?: boolean; pk?: string; wrongTries?: number } = {}) {
  const calls: Call[] = [];
  let pk = o.pk ?? '';
  let epoch = 1;
  let recovery = 'ABCD2345EFGH6723';
  let resetAt = 0;
  let sessions = 0;
  let tries = 0;
  const issue = () => ({ session: `v1.${NOW + 30 * DAY}.${epoch}.${mac(++sessions)}`, expires: NOW + 30 * DAY });
  const live = (s: string | undefined) => !!s && s.startsWith(`v1.${NOW + 30 * DAY}.${epoch}.`);
  const f: SyncFetch = async (url, init) => {
    const u = new URL(url);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const session = init?.headers?.['x-aaap-session'];
    calls.push({ path: u.pathname, body, session });
    const res = (status: number, j: unknown = {}) => ({ ok: status < 300, status, json: async () => j, headers: { get: () => null } });
    if (o.pinOff) return res(404, { error: 'not found' });
    const r = u.pathname.replace('/pin/', '');
    if (r === 'status') return res(200, { pin: !!pk, ...(resetAt ? { resetAt } : {}) });
    if (r === 'set') {
      if (pk) return res(409, { error: 'a PIN is already set' });
      pk = body!.pk as string;
      return res(200, { ok: true, ...issue(), recovery, revokedLinks: 1 });
    }
    if (!pk) return res(404, { error: 'no PIN is set', pin: false });
    if (r === 'verify') {
      if (tries >= (o.wrongTries ?? 99)) return res(429, { error: 'too many tries', retryAfter: 3600 });
      if (body!.pk !== pk) {
        tries++;
        return res(401, { error: 'wrong PIN', pin: true });
      }
      tries = 0;
      return res(200, issue());
    }
    if (r === 'recover') {
      if (body!.recovery !== recovery) return res(401, { error: 'wrong recovery code', pin: true });
      pk = body!.pk as string;
      epoch++;
      recovery = 'ZZZZ2222YYYY3333';
      return res(200, { ok: true, ...issue(), recovery });
    }
    if (r === 'reset') {
      resetAt = NOW + 7 * DAY;
      return res(200, { ok: true, resetAt });
    }
    if (!live(session)) return res(401, { error: 'pin required', pin: true });
    if (r === 'refresh') return res(200, issue());
    if (r === 'change') {
      pk = body!.pk as string;
      epoch++;
      return res(200, { ok: true, ...issue() });
    }
    if (r === 'remove') {
      pk = '';
      return res(200, { ok: true });
    }
    if (r === 'reset/cancel') {
      resetAt = 0;
      return res(200, { ok: true });
    }
    return res(404, {});
  };
  return { f, calls, pk: () => pk, epoch: () => epoch };
}
const make = (col: ReturnType<typeof collector>, o: { id?: string; target?: boolean; now?: number; st?: ReturnType<typeof memStore> } = {}) => {
  const store = o.st ?? memStore();
  const sessions = createPinSessions({ storage: store.st, now: () => o.now ?? NOW });
  const p = createPinAccount({
    env: { target: () => (o.target === false ? null : { url: SYNC, k: K }), playerId: () => (o.id === undefined ? ID : o.id), rounds: ROUNDS },
    sessions,
    fetch: sessions.wrap(col.f),
    now: () => o.now ?? NOW,
  });
  return { p, sessions, store };
};
const PK = (pin: string) => pinKeyOf(pin, ID, ROUNDS);
let seenAll: string;
beforeEach(() => {
  seenAll = '';
});

describe('checking', () => {
  it('no PIN on the account: off', async () => {
    const { p } = make(collector());
    expect(p.state.value).toBe('unknown');
    await p.check();
    expect(p.state.value).toBe('off');
  });
  it('a PIN and no session here: locked', async () => {
    const { p } = make(collector({ pk: await PK('123456') }));
    await p.check();
    expect(p.state.value).toBe('locked');
  });
  it('a collector with the PIN off, or no collector: unavailable (the card does not show)', async () => {
    const a = make(collector({ pinOff: true }));
    await a.p.check();
    expect(a.p.state.value).toBe('unavailable');
    const b = make(collector(), { target: false });
    await b.p.check();
    expect(b.p.state.value).toBe('unavailable');
  });
  it('a reload that still has a good session is open without asking for the PIN again', async () => {
    const col = collector({ pk: await PK('123456') });
    const a = make(col);
    await a.p.check();
    await a.p.enter('123456');
    const before = col.calls.filter(c => c.path === '/pin/verify').length;
    const b = make(col, { st: a.store });
    await b.p.check();
    expect(b.p.state.value).toBe('open');
    expect(col.calls.filter(c => c.path === '/pin/verify').length).toBe(before);
  });
  it('a session with under 7 days left is refreshed, and the new one kept', async () => {
    const col = collector({ pk: await PK('123456') });
    const a = make(col);
    await a.p.check();
    await a.p.enter('123456');
    const later = NOW + 25 * DAY;
    // the stand-in's sessions expire at NOW + 30 days; at day 25, 5 days are left
    const b = make(col, { st: a.store, now: later });
    await b.p.check();
    expect(col.calls.some(c => c.path === '/pin/refresh')).toBe(true);
    expect(b.p.state.value).toBe('open');
  });
});

describe('entering the PIN', () => {
  it('the right PIN: open; the session is kept; only pk went out, never the PIN or the ID', async () => {
    const col = collector({ pk: await PK('123456') });
    const { p, sessions } = make(col);
    await p.check();
    await p.enter('123456');
    expect(p.state.value).toBe('open');
    expect(p.error.value).toBe('');
    expect(sessions.get(K)).not.toBeNull();
    seenAll = JSON.stringify(col.calls);
    expect(seenAll).not.toContain('123456');
    expect(seenAll).not.toContain(ID);
    expect(col.calls.find(c => c.path === '/pin/verify')!.body).toEqual({ k: K, pk: await PK('123456') });
  });
  it('a wrong PIN: stays locked, error wrong', async () => {
    const { p } = make(collector({ pk: await PK('123456') }));
    await p.check();
    await p.enter('654321');
    expect(p.state.value).toBe('locked');
    expect(p.error.value).toBe('wrong');
  });
  it('throttled: error limit with the seconds to wait, nothing else changes', async () => {
    const { p } = make(collector({ pk: await PK('123456'), wrongTries: 1 }));
    await p.check();
    await p.enter('000000');
    await p.enter('111111');
    expect(p.error.value).toBe('limit');
    expect(p.retryAfter.value).toBe(3600);
    expect(p.state.value).toBe('locked');
  });
  it('not 6 digits, or no player ID: refused here, nothing sent', async () => {
    const col = collector({ pk: await PK('123456') });
    const a = make(col);
    await a.p.check();
    const n = col.calls.length;
    await a.p.enter('12345');
    expect(a.p.error.value).toBe('rejected');
    const b = make(col, { id: '' });
    await b.p.check();
    const m = col.calls.length;
    await b.p.enter('123456');
    expect(b.p.error.value).toBe('rejected');
    expect(col.calls.length).toBe(m);
    expect(n).toBeGreaterThan(0);
  });
  it('busy while it works out the key and asks', async () => {
    const { p } = make(collector({ pk: await PK('123456') }));
    await p.check();
    const run = p.enter('123456');
    expect(p.busy.value).toBe(true);
    await run;
    expect(p.busy.value).toBe(false);
  });
  it('any cloud call that answers 401 later (an expired or revoked session) puts it back to locked', async () => {
    const col = collector({ pk: await PK('123456') });
    const { p, sessions } = make(col);
    await p.check();
    await p.enter('123456');
    sessions.clear(K);
    await sessions.wrap(col.f)(`https://collector.example/sync?k=${K}`);
    expect(p.state.value).toBe('locked');
  });
});

describe('setting, changing, removing', () => {
  it('set: open at once, the recovery code held to show once, how many links ended', async () => {
    const { p } = make(collector());
    await p.check();
    await p.setPin('123456');
    expect(p.state.value).toBe('open');
    expect(p.recovery.value).toBe('ABCD2345EFGH6723');
    expect(p.revokedLinks.value).toBe(1);
    p.ackRecovery();
    expect(p.recovery.value).toBeNull();
  });
  it('change: a new PIN, a new session, the old PIN no longer works', async () => {
    const col = collector();
    const a = make(col);
    await a.p.check();
    await a.p.setPin('123456');
    await a.p.changePin('654321');
    expect(a.p.state.value).toBe('open');
    expect(col.pk()).toBe(await PK('654321'));
    const b = make(col);
    await b.p.check();
    await b.p.enter('123456');
    expect(b.p.error.value).toBe('wrong');
  });
  it('remove: off, and the session is forgotten here', async () => {
    const col = collector();
    const { p, sessions } = make(col);
    await p.check();
    await p.setPin('123456');
    await p.removePin();
    expect(p.state.value).toBe('off');
    expect(col.pk()).toBe('');
    expect(sessions.get(K)).toBeNull();
  });
  it('set when another browser set one first: error exists, then locked', async () => {
    const { p } = make(collector({ pk: await PK('999999') }));
    await p.setPin('123456');
    expect(p.error.value).toBe('exists');
    expect(p.state.value).toBe('locked');
  });
});

describe('forgot the PIN', () => {
  it('recover: the code and a new PIN open it, and a NEW recovery code is held to show once', async () => {
    const { p } = make(collector({ pk: await PK('123456') }));
    await p.check();
    await p.recover('abcd 2345-efgh 6723', '246810');
    expect(p.state.value).toBe('open');
    expect(p.recovery.value).toBe('ZZZZ2222YYYY3333');
  });
  it('recover with a wrong code: wrong, still locked', async () => {
    const { p } = make(collector({ pk: await PK('123456') }));
    await p.check();
    await p.recover('AAAA2222BBBB3333', '246810');
    expect(p.error.value).toBe('wrong');
    expect(p.state.value).toBe('locked');
  });
  it('the 7-day reset: start it (no login), the date shows, cancel it from an open browser', async () => {
    const col = collector({ pk: await PK('123456') });
    const a = make(col);
    await a.p.check();
    await a.p.startReset();
    expect(a.p.resetAt.value).toBe(NOW + 7 * DAY);
    expect(a.p.state.value).toBe('locked');
    const b = make(col, { st: a.store });
    await b.p.check();
    expect(b.p.resetAt.value).toBe(NOW + 7 * DAY);
    await b.p.enter('123456');
    await b.p.cancelReset();
    expect(b.p.resetAt.value).toBeNull();
  });
});
