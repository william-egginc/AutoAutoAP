/**
 * `pnpm generate:pacific-time-table` WRITES THE FILE THE CALENDAR READS (code review 22 Nov 2026, T1.10): it wrote
 * src/lib/pacificTimeTable.json, which nothing imports, while lib/planners/events.ts reads
 * lib/planners/pacificTimeTable.json. Checked by the script's source (running it writes the table).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const script = readFileSync(at('../../scripts/generatePacificTimeTable.ts'), 'utf8');

describe('generatePacificTimeTable', () => {
  it('writes lib/planners/pacificTimeTable.json, the file events.ts imports, and only if it is there', () => {
    expect(script).toContain("join(__dirname, '..', '..', '..', 'lib', 'planners', 'pacificTimeTable.json')");
    expect(script).toContain('if (!existsSync(outPath)) throw');
    expect(existsSync(at('../../../../lib/planners/pacificTimeTable.json'))).toBe(true);
    expect(readFileSync(at('../../../../lib/planners/events.ts'), 'utf8')).toContain("from './pacificTimeTable.json'");
  });
});
