/**
 * The sim5 tables are built and checked fresh (review 15 Nov, T1): --reuse-prefix gave a TE 95 all-common Monday
 * 3-sale cell 15.9 h faster than a fresh build, for about 3% less work. So tables.json lists no --reuse-prefix, and
 * tables:verify rebuilds without it whatever tables.json says, so a returned table is compared with fresh cells.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '../..');
const LIST = JSON.parse(readFileSync(join(APP, 'tables/sim5/tables.json'), 'utf8')) as { flags: string[] };
const SRC = readFileSync(join(APP, 'scripts/tables-build.mjs'), 'utf8');

describe('tables:build and tables:verify build fresh (T1)', () => {
  it('tables.json has no --reuse-prefix (or --verify-reuse)', () => {
    expect(LIST.flags).toEqual(['--generate', '--v2']);
  });
  it('the CLI refuses a list with --reuse-prefix and verify strips it', () => {
    expect(SRC).toMatch(/LIST\.flags\.includes\('--reuse-prefix'\)\) fail\(/);
    expect(SRC).toMatch(/const FRESH_FLAGS = LIST\.flags\.filter\(f => f !== '--reuse-prefix' && f !== '--verify-reuse'\)/);
    expect(SRC).not.toMatch(/\.\.\.LIST\.flags/);
  });
});
