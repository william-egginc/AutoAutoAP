/**
 * GUARD spec for the table-builder speedup (Joo's cb6febae, ported): a pure speed change, so there is
 * no honest failing-first test. Instead the cells below were built with the code BEFORE the port
 * (origin/egg-beta2-int a841f801) and stored in tableSpeedup.fixture.json; the ported code must give
 * the same cell fields, to the last bit (the packed table stores exactly these float64s, so equal
 * fields mean equal table bytes). Maxed cells (the alt's save with --reference's additions) and
 * own-gear cells (the alt's 1 Oct gear save).
 *
 * The saves are read where they are (never copied into the repo): SPEEDUP_SAVE / SPEEDUP_GEAR_SAVE,
 * or ~/code/aaap-tools. SKIPPED when absent. About 20 s. To re-pin with the code of the day:
 *   SPEEDUP_WRITE=1 npx vitest run src/search/tableSpeedup.spec.ts
 */
import '../../scripts/node-shims';

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { buildAt, paramsOf, REFERENCE_WEEK, startStateAt } from '@/search/tableBuild';
import type { SearchInputs } from '@/search/types';

const TOOLS = join(homedir(), 'code/aaap-tools');
const SAVE = process.env.SPEEDUP_SAVE ?? join(TOOLS, 'alt.json');
const GEAR_SAVE = process.env.SPEEDUP_GEAR_SAVE ?? join(TOOLS, 'alt-gear-2026-10-01.json');
const FIXTURE = join(__dirname, 'tableSpeedup.fixture.json');
const WRITE = !!process.env.SPEEDUP_WRITE;

/** scripts/precompute.ts REFERENCE_ADDITIONS (--reference), repeated here: that script runs on import. */
const REFERENCE_ADDITIONS: [number, number, number, number][] = [
  [24, 3, 3, 1],
  [33, 2, 0, 12],
  [1, 2, 0, 12],
  [36, 2, 0, 12],
];

async function load(file: string, reference: boolean): Promise<SearchInputs> {
  setActivePinia(createPinia());
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  if (reference) {
    const items = (backup.artifactsDb.virtueAfxDb.inventoryItems ??= []);
    REFERENCE_ADDITIONS.forEach(([name, level, rarity, quantity], i) =>
      items.push({ itemId: 910000000 + i, artifact: { spec: { name, level, rarity, egg: 1000 } }, quantity, serverId: '' })
    );
  }
  resolveColleggtibleContracts(backup);
  await initPlanFuture('file', markRaw(backup));
  const store = useChainSearchStore();
  store.continueStartRule = false;
  return store.collectInputs();
}

function cell(inputs: SearchInputs, te: number, hour: number) {
  const start = REFERENCE_WEEK + hour * 3600;
  const build = buildAt(inputs, startStateAt(inputs, te), start, te);
  return JSON.parse(JSON.stringify(build.variants.map(v => paramsOf(build, v, start))));
}

const CASES = {
  maxed: { file: SAVE, reference: true, cells: [[150, 0], [250, 83], [320, 128]] },
  gear: { file: GEAR_SAVE, reference: false, cells: [[200, 40], [300, 40]] },
} as const;

describe.skipIf(!existsSync(SAVE) || !existsSync(GEAR_SAVE))('table speedup guard: same cells as before', () => {
  const stored = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
  const out: Record<string, unknown> = {};

  for (const [name, c] of Object.entries(CASES)) {
    it(
      `${name} cells are bit-identical to the fixture`,
      async () => {
        const inputs = await load(c.file, c.reference);
        for (const [te, hour] of c.cells) {
          const key = `${name} ${te}@${hour}`;
          const got = cell(inputs, te, hour);
          if (WRITE) out[key] = got;
          else expect(JSON.stringify(got), key).toBe(JSON.stringify(stored[key]));
        }
        if (WRITE) writeFileSync(FIXTURE, JSON.stringify({ ...stored, ...out }, null, 1) + '\n');
      },
      300_000
    );
  }
});
