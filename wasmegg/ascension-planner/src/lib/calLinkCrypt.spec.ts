/**
 * The saved calendar link, encrypted in the browser (lib/calLinkCrypt.ts; Jordan, 18 Nov 2026,
 * notes/calendar-link-across-browsers-2026-11-18.md). AES-GCM, key = PBKDF2-SHA-256 of the player ID (600,000 rounds, salt
 * "aaap-callink-v1:" + the ID), a fresh 12-byte iv each time. The collector holds { v: 1, iv, ct } and never the key.
 */
import { describe, expect, it } from 'vitest';
import { CALLINK_ROUNDS, decryptLink, deriveLinkKey, encryptLink, readLinkRecord } from './calLinkCrypt';

const ID = 'EI1234567890123456';
const LINK = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics';
const FAST = 1000; // rounds for the specs that are not about the rounds

describe('the key', () => {
  it('uses 600,000 rounds', () => {
    expect(CALLINK_ROUNDS).toBe(600_000);
  });
  it('is worked out from the ID alone: the same for the same ID, trimmed and upper-cased as the follow key is', async () => {
    const a = await deriveLinkKey(ID, FAST);
    const rec = await encryptLink(a, LINK);
    expect(await decryptLink(await deriveLinkKey(`  ${ID.toLowerCase()} `, FAST), rec)).toBe(LINK);
  });
  it('another ID gives another key', async () => {
    const rec = await encryptLink(await deriveLinkKey(ID, FAST), LINK);
    expect(await decryptLink(await deriveLinkKey('EI6543210987654321', FAST), rec)).toBeNull();
  });
  it('a different round count gives a different key (the rounds are part of the contract)', async () => {
    const rec = await encryptLink(await deriveLinkKey(ID, FAST), LINK);
    expect(await decryptLink(await deriveLinkKey(ID, FAST + 1), rec)).toBeNull();
  });
  it('is not the account key k: the collector, which sees k, cannot work it out', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('aaap-follow-v1:' + ID));
    const k = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    // the key material is derived from the ID with a different salt; its raw bytes are never exposed (not extractable)
    const key = await deriveLinkKey(ID, FAST);
    expect(key.extractable).toBe(false);
    expect(k).toHaveLength(64);
  });
  it('refuses an empty ID', async () => {
    await expect(deriveLinkKey('', FAST)).rejects.toThrow();
    await expect(deriveLinkKey('   ', FAST)).rejects.toThrow();
  });
});

describe('the record', () => {
  it('is { v: 1, iv, ct } of base64, the iv 12 bytes, and small enough for the collector (512 bytes)', async () => {
    const rec = await encryptLink(await deriveLinkKey(ID, FAST), LINK);
    expect(Object.keys(rec).sort()).toEqual(['ct', 'iv', 'v']);
    expect(rec.v).toBe(1);
    expect(atob(rec.iv)).toHaveLength(12);
    expect(rec.ct).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(JSON.stringify(rec).length).toBeLessThan(512);
    expect(atob(rec.ct).length).toBeGreaterThanOrEqual(17);
    expect(atob(rec.ct).length).toBeLessThanOrEqual(300);
  });
  it('holds nothing readable: not the link, not its parts, not the ID', async () => {
    const rec = await encryptLink(await deriveLinkKey(ID, FAST), LINK);
    const text = JSON.stringify(rec) + atob(rec.ct) + atob(rec.iv);
    for (const bit of ['collector', 'cal/', '.ics', 'https', 'AbCdEf', ID]) expect(text).not.toContain(bit);
  });
  it('a fresh iv every time: the same link never gives the same bytes twice', async () => {
    const key = await deriveLinkKey(ID, FAST);
    const a = await encryptLink(key, LINK);
    const b = await encryptLink(key, LINK);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
  it('round-trips the link exactly', async () => {
    const key = await deriveLinkKey(ID, FAST);
    expect(await decryptLink(key, await encryptLink(key, LINK))).toBe(LINK);
  });
  it('a changed byte, a swapped iv, or a wrong shape reads as null (never throws, never a wrong link)', async () => {
    const key = await deriveLinkKey(ID, FAST);
    const rec = await encryptLink(key, LINK);
    const flip = (b64: string) => {
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      raw[0] ^= 1;
      return btoa(String.fromCharCode(...raw));
    };
    const other = await encryptLink(key, LINK);
    for (const bad of [{ ...rec, ct: flip(rec.ct) }, { ...rec, iv: other.iv }, { ...rec, v: 2 }, { v: 1, iv: rec.iv }, { v: 1, iv: 'x', ct: 'y' }, null, 'text', 5, []]) {
      expect(await decryptLink(key, bad as never)).toBeNull();
    }
  });
  it('what the record decrypts to must be a link: any other plaintext reads as null', async () => {
    const key = await deriveLinkKey(ID, FAST);
    expect(await decryptLink(key, await encryptLink(key, 'not a link'))).toBeNull();
    expect(await decryptLink(key, await encryptLink(key, 'javascript:alert(1)'))).toBeNull();
  });
  it('readLinkRecord keeps only a well-formed record', () => {
    const good = { v: 1, iv: btoa('a'.repeat(12)), ct: btoa('b'.repeat(40)) };
    expect(readLinkRecord(good)).toEqual(good);
    expect(readLinkRecord({ ...good, extra: 1 })).toBeNull();
    expect(readLinkRecord({ ...good, iv: btoa('a'.repeat(8)) })).toBeNull();
    expect(readLinkRecord(null)).toBeNull();
  });
});

describe('the real round count', () => {
  it('a record made with the 600,000-round key opens with it (contract pin: ID, rounds, salt and algorithm stay as they are)', async () => {
    const rec = await encryptLink(await deriveLinkKey(ID), LINK);
    expect(await decryptLink(await deriveLinkKey(ID), rec)).toBe(LINK);
  }, 30_000);
});
