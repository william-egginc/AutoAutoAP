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
 *
 * WHAT THE CODE DOES ON THE COLLECTOR (phase 2 of the leaderboard, 2026-09-25). Beyond the flagged
 * board it now also:
 *   - folds repeated sends: the same result sent twice with the same code is stored once;
 *   - lets the sender put a name on a run sent anonymously (POST /claim, only with the same code);
 *   - lets the sender's own later runs replace their older plans in the race. On the public board a
 *     named row carries `acct`, a short HMAC of the code's hash, so rows sent with one code read as
 *     one player; an anonymous row carries nothing, so nobody can link it to a name;
 *   - answers GET /mine with the rows sent with the code, anonymous ones included.
 * The code itself is still never shown to anyone, and its hash is never served.
 */

const PREFIX = 'aap-owner:';

/**
 * The code for one account if this browser already has one, WITHOUT creating it. For reads
 * (`/mine`, a rename): an account this browser never sent for has no rows to find, and minting a
 * code just to ask would be a request carrying an identifier for nothing.
 */
export function existingOwnerToken(partition: string): string | null {
  try {
    const v = localStorage.getItem(PREFIX + partition);
    return v && /^[a-f0-9]{32}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

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

/** Every code this browser holds, for the Explorer's flagged board. `GET /mine` takes up to 20 of
 *  them as a comma list. */
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
