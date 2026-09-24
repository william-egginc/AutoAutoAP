/**
 * @module owner
 * @description The code that lets a player find their own rows on the flagged board.
 *
 * Flagged runs are shown anonymously, except to their owner. "Owner" cannot mean "knows the player
 * id": nothing derived from the id may leave the browser, and a hash of one is guessable (the id is
 * sixteen digits). So each account gets a random code the first time this browser submits for it,
 * kept here in localStorage under the account's own partition hash, and sent with every submission
 * in a header. The collector stores only its SHA-256; presenting the code back is the claim.
 *
 * Per browser, by design: another device cannot claim the rows, and clearing site data forgets them.
 * That is the price of never sending anything that identifies the account.
 */

const PREFIX = 'aap-owner:';

/** The code for one account (by its partition hash), created on first use. Null when storage is
 *  unavailable -- a private window -- in which case the run simply cannot be claimed later. */
export function ownerToken(partition: string): string | null {
  try {
    const key = PREFIX + partition;
    const existing = localStorage.getItem(key);
    if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, token);
    return token;
  } catch {
    return null;
  }
}

/** Every code this browser holds, for the Explorer's flagged board. */
export function allOwnerTokens(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const v = localStorage.getItem(key);
      if (v && /^[a-f0-9]{32}$/.test(v)) out.push(v);
    }
  } catch {
    /* storage unavailable: nothing to claim */
  }
  return out;
}
