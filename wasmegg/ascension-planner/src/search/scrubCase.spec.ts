/**
 * The player-id scrubbers match any case (review 21 Oct 2026, data-security #18): `EI\d{16}` was
 * case-sensitive, so a lowercase "ei" + 16 digits typed into a name or a note was kept and sent.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scrubIdentifiers } from './submission';
import { cleanNickname } from './offline';
import { cleanSearched } from './searched';
import { holdsPlayerId } from './instantRecord';
import { scrub } from '@/lib/calendarEvents';

const ID = 'EI1234567890123456';
const forms = [ID, ID.toLowerCase(), 'Ei1234567890123456', 'eI1234567890123456'];

describe('id scrubbers, any case', () => {
  it('take the id out of free text', () => {
    for (const id of forms) {
      expect(scrubIdentifiers(`name ${id} x`)).toBe('name EI[redacted] x');
      expect(cleanNickname(`  ${id} `)).toBe('EI[redacted]');
      expect(cleanSearched(`boxes ${id}`)).toBe('boxes EI[redacted]');
      expect(scrub(`note ${id}`)).toBe('note [id]');
      expect(holdsPlayerId({ note: id } as never)).toBe(true);
    }
  });

  it('no case-sensitive id pattern is left in the page code', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|vue)$/.test(f) && !/\.spec\.ts$/.test(f)) files.push(p);
      }
    };
    walk(new URL('..', import.meta.url).pathname);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\/EI\\d\{16\}\/([a-z]*)/g)) expect(m[1], f).toContain('i');
    }
  });
});
