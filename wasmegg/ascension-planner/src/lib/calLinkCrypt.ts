/**
 * THE SAVED CALENDAR LINK, encrypted in the browser (Jordan, 18 Nov 2026; collector kind `callink`,
 * notes/calendar-link-across-browsers-2026-11-18.md). The link is shown once today and kept nowhere; this keeps it on the
 * collector so every browser of the player can show it again, without the collector being able to read it.
 *
 *  - Key: PBKDF2-SHA-256, 600,000 rounds, salt "aaap-callink-v1:" + the ID (trimmed, upper-cased as lib/followCloud.ts
 *    `followKey` does), a 256-bit AES-GCM key that is not extractable. The collector sees only `k` (a different hash), never
 *    this key. Worked out once per browser (about half a second) and held in memory only.
 *  - Record: { v: 1, iv, ct }, base64; iv 12 random bytes made fresh every time; ct = the link's UTF-8 bytes sealed with the tag.
 *  - Anyone who has the player ID can open it; they could already read the plan itself with the ID. The ID never leaves this
 *    browser and never goes in a request, a log or a spec (placeholders only).
 */
export const CALLINK_ROUNDS = 600_000;
export const CALLINK_SALT_PREFIX = 'aaap-callink-v1:';

export interface LinkRecord {
  v: 1;
  iv: string;
  ct: string;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const bytesOf = (b64: string): Uint8Array | null => {
  if (!B64.test(b64) || b64.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  } catch {
    return null;
  }
};
const b64Of = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** The AES-GCM key for an ID. Rejects without one. `rounds` is for specs only. */
export async function deriveLinkKey(playerId: string, rounds: number = CALLINK_ROUNDS): Promise<CryptoKey> {
  const id = (playerId ?? '').trim().toUpperCase();
  if (!id) throw new Error('no player ID');
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(id), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(CALLINK_SALT_PREFIX + id), iterations: rounds }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** The record the collector accepts, or null for anything else. */
export function readLinkRecord(x: unknown): LinkRecord | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (Object.keys(o).some(f => f !== 'v' && f !== 'iv' && f !== 'ct') || o.v !== 1) return null;
  if (typeof o.iv !== 'string' || typeof o.ct !== 'string') return null;
  const iv = bytesOf(o.iv);
  const ct = bytesOf(o.ct);
  if (!iv || iv.length !== 12 || !ct || ct.length < 17 || ct.length > 300) return null;
  return { v: 1, iv: o.iv, ct: o.ct };
}

export async function encryptLink(key: CryptoKey, link: string): Promise<LinkRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(link)));
  return { v: 1, iv: b64Of(iv), ct: b64Of(ct) };
}

/** The link a record holds, or null: a wrong key, a changed byte, a wrong shape, or something that is not an http(s) link. */
export async function decryptLink(key: CryptoKey, record: unknown): Promise<string | null> {
  const r = readLinkRecord(record);
  if (!r) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesOf(r.iv)! as BufferSource }, key, bytesOf(r.ct)! as BufferSource);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(plain);
    return /^https?:\/\/\S+$/.test(text) ? text : null;
  } catch {
    return null;
  }
}
