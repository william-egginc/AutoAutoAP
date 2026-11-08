/**
 * QA review 7 Nov 2026, finding 12 (INFO): a best-so-far send flagged 'typed-te' that was a duplicate lost its "Not
 * ranked" note (stores/chainSearch.ts tested the send's message for the long line's lower-case tail, but a duplicate
 * carries TYPED_TE_NOT_RANKED_SHORT, capital N); and a typed send with its CSV said "sent" twice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TYPED_TE_NOT_RANKED, TYPED_TE_NOT_RANKED_SHORT, typedTeNoted } from './saveOnlineWords';

describe('typedTeNoted', () => {
  it('finds the line in either form, and nothing else', () => {
    const lead = `${TYPED_TE_NOT_RANKED.charAt(0).toLowerCase()}${TYPED_TE_NOT_RANKED.slice(1)}`;
    expect(typedTeNoted(lead)).toBe(true);
    expect(typedTeNoted(`Already on the Leaderboard, nothing new stored ${TYPED_TE_NOT_RANKED_SHORT}`)).toBe(true);
    expect(typedTeNoted('sent. It went to the flagged Leaderboard (stalled).')).toBe(false);
  });
  it('the store uses it for the best-so-far note, and a typed send with its CSV says "sent" once', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../stores/chainSearch.ts'), 'utf8');
    expect(src).toMatch(/const typedNote = typedTeNoted\(res\.message\)/);
    expect(src).not.toMatch(/TYPED_TE_NOT_RANKED\.slice\(10\)/);
    expect(src).toMatch(/typedTe \? `\$\{lead\} \$\{sentence\(t\.message\.replace\(\/\^sent,\?\\s\*\/, ''\)\)/);
  });
});
