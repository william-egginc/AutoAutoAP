/**
 * THE PIN'S SLOW HASH (Jordan, 17 Nov 2026; design ~/code/aaap-tools/notes/pin-cloud-design-2026-11-17.md): `pk` = PBKDF2-SHA-256 of the
 * 6 digits, salt "aaap-pin-v1:" + the player ID (trimmed, upper-cased as lib/followCloud.ts `followKey` does), 600,000 rounds, 64 lowercase hex.
 * The collector only ever sees `pk` (in a POST body, never a URL), keeps an HMAC of it, and never sees the PIN or the ID. Worked out in the
 * browser (about half a second): the collector cannot do it, a Worker caps PBKDF2 at 100,000 rounds and the free plan's CPU limit is 10 ms.
 */
export const PIN_ROUNDS = 600_000;
export const PIN_SALT_PREFIX = 'aaap-pin-v1:';

/** Exactly 6 ASCII digits. */
export const isPin = (s: unknown): s is string => typeof s === 'string' && /^[0-9]{6}$/.test(s);

/** `pk` for a PIN and an ID. Rejects (before any work) a PIN that is not 6 digits or an empty ID. `rounds` is for specs only. */
export async function pinKeyOf(pin: string, playerId: string, rounds: number = PIN_ROUNDS): Promise<string> {
  if (!isPin(pin)) throw new Error('the PIN is 6 digits');
  const id = (playerId ?? '').trim().toUpperCase();
  if (!id) throw new Error('no player ID');
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(PIN_SALT_PREFIX + id), iterations: rounds }, material, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
