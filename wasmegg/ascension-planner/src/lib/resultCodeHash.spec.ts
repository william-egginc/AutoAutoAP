import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isWordingOnly, resolveImport, resultCodeHash, resultCodeInputs } from './resultCodeHash';
import { DEV_RESULT_CODE, resultCode, sameResultCode, setResultCode, withResultCode } from './resultCode';

/** A fake source tree: the hash is pure over what it is handed. */
function tree(over: Record<string, string> = {}): Map<string, string> {
  return new Map(
    Object.entries({
      'release.ts': "export default { history: [{ at: '2026-11-05', note: 'Release 7' }] };",
      'src/search/leg.ts': "import { fmt } from '@/lib/format';\nimport { x } from '../lib/eggDay';\nexport const leg = 1;",
      'src/search/leg.spec.ts': "it('leg', () => {});",
      'src/search/tableV2.fixture.ts': 'export const fixture = 1;',
      'src/search/chain.ts': "import { leg } from './leg';\nexport const chain = leg;",
      'src/auto/run.ts': 'export const run = 1;',
      'src/engine/sim.ts': 'export const sim = 1;',
      'src/lib/format.ts': 'export const fmt = 1;',
      'src/lib/eggDay.ts': "import { t } from '@/types/time';\nexport const x = 1;",
      'src/types/time.ts': 'export const t = 1;',
      'src/lib/nowWords.ts': 'export const words = "Right now";',
      'src/lib/updateNotes.ts': 'export const notes = 1;',
      'src/lib/followSim.ts': "import { words } from './nowWords';\nexport const SIM = 1;",
      'src/lib/unrelated.ts': 'export const u = 1;',
      'src/components/Card.vue.ts': 'export const c = 1;',
      'src/stores/chainSearch.ts': "import { leg } from '@/search/leg';\nexport const store = 'words and logic';",
      'src/composables/useCurrentSim.ts': "import { SIM } from '@/lib/followSim';\nexport const use = 1;",
      ...over,
    })
  );
}

describe('the result code hash (vite.config.ts, at build time)', () => {
  it('takes the search, simulator and named files and what they import from lib and types; no specs, words or stores', () => {
    expect(resultCodeInputs(tree())).toEqual([
      'src/auto/run.ts',
      'src/composables/useCurrentSim.ts',
      'src/engine/sim.ts',
      'src/lib/eggDay.ts',
      'src/lib/followSim.ts',
      'src/lib/format.ts',
      'src/search/chain.ts',
      'src/search/leg.ts',
      'src/types/time.ts',
    ]);
  });

  it('is twelve hex characters', () => {
    expect(resultCodeHash(tree()).hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('changing a spec, release.ts, a words file, the update notes, a store or an unrelated lib file keeps it', () => {
    const base = resultCodeHash(tree()).hash;
    for (const [p, text] of [
      ['src/search/leg.spec.ts', "it('leg, again', () => {});"],
      ['release.ts', "export default { history: [{ at: '2026-11-06', note: 'Release 7.1: words' }] };"],
      ['src/lib/nowWords.ts', 'export const words = "Right now, said better";'],
      ['src/lib/updateNotes.ts', 'export const notes = 2;'],
      ['src/stores/chainSearch.ts', "import { leg } from '@/search/leg';\nexport const store = 'other words';"],
      ['src/lib/unrelated.ts', 'export const u = 2;'],
      ['src/search/tableV2.fixture.ts', 'export const fixture = 2;'],
    ] as const)
      expect(resultCodeHash(tree({ [p]: text })).hash, p).toBe(base);
  });

  it('changing leg.ts, the simulator, or a lib file the search imports changes it', () => {
    const base = resultCodeHash(tree()).hash;
    for (const [p, text] of [
      ['src/search/leg.ts', "import { fmt } from '@/lib/format';\nimport { x } from '../lib/eggDay';\nexport const leg = 2;"],
      ['src/engine/sim.ts', 'export const sim = 2;'],
      ['src/lib/eggDay.ts', "import { t } from '@/types/time';\nexport const x = 2;"],
      ['src/types/time.ts', 'export const t = 2;'],
      ['src/lib/followSim.ts', "import { words } from './nowWords';\nexport const SIM = 2;"],
    ] as const)
      expect(resultCodeHash(tree({ [p]: text })).hash, p).not.toBe(base);
  });

  it("an edit to the instant answer's words (lib/instantWords.ts) keeps it, even when a hashed file imports them", () => {
    const over = {
      'src/lib/instantWords.ts': "export const INSTANT_ESTIMATE_LINE = 'An estimate';",
      'src/search/chain.ts': "import { leg } from './leg';\nimport { INSTANT_ESTIMATE_LINE } from '@/lib/instantWords';\nexport const chain = leg;",
    };
    const base = resultCodeHash(tree(over)).hash;
    expect(resultCodeInputs(tree(over))).not.toContain('src/lib/instantWords.ts');
    expect(resultCodeHash(tree({ ...over, 'src/lib/instantWords.ts': "export const INSTANT_ESTIMATE_LINE = 'An estimate, said better';" })).hash).toBe(base);
  });

  it('wording-only files and imports resolve as named', () => {
    expect(isWordingOnly('release.ts')).toBe(true);
    expect(isWordingOnly('src/lib/siloWords.ts')).toBe(true);
    // spec-r7verify: the instant answer's estimate line and Right now's fresh-start line are words only.
    expect(isWordingOnly('src/lib/instantWords.ts')).toBe(true);
    expect(isWordingOnly('src/lib/freshSoonerWords.ts')).toBe(true);
    expect(isWordingOnly('src/lib/instantComputeWords.ts')).toBe(true);
    expect(isWordingOnly('src/lib/followSim.ts')).toBe(false);
    const t = tree();
    expect(resolveImport('src/search/chain.ts', './leg', t)).toBe('src/search/leg.ts');
    expect(resolveImport('src/search/leg.ts', '../lib/eggDay', t)).toBe('src/lib/eggDay.ts');
    expect(resolveImport('src/search/leg.ts', 'vue', t)).toBeNull();
  });

  it('the config defines __RESULT_CODE_HASH__ from it over every .ts under src, and env.d.ts declares it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8');
    expect(src).toMatch(/__RESULT_CODE_HASH__:\s*JSON\.stringify\(RESULT_CODE\.hash\)/);
    expect(src).toMatch(/const RESULT_CODE = resultCodeHash\(readResultCodeFiles\(\)\)/);
    const env = fs.readFileSync(path.resolve(__dirname, '../env.d.ts'), 'utf8');
    expect(env).toContain('declare const __RESULT_CODE_HASH__: string;');
  });

  it('over the real tree: leg.ts, chain.ts and the simulator are in, release.ts and specs are not', () => {
    const root = path.resolve(__dirname, '../..');
    const files = new Map<string, string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.ts')) files.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
      }
    };
    walk('src');
    files.set('release.ts', fs.readFileSync(path.join(root, 'release.ts'), 'utf8'));
    const inputs = resultCodeInputs(files);
    for (const p of ['src/search/leg.ts', 'src/search/chain.ts', 'src/search/instantCompute.ts', 'src/composables/useInstantCompute.ts', 'src/lib/followSim.ts'])
      expect(inputs, p).toContain(p);
    expect(inputs.some(p => p.endsWith('.spec.ts'))).toBe(false);
    expect(inputs).not.toContain('release.ts');
    expect(inputs).not.toContain('src/lib/updateNotes.ts');
    expect(inputs).not.toContain('src/stores/chainSearch.ts');
    expect(inputs.some(p => p.startsWith('src/components/'))).toBe(false);
  });
});

describe('resultCode() on the page', () => {
  afterEach(() => setResultCode(null));
  it("is 'dev' where nothing defines it (specs), and keys and rc checks follow it", () => {
    expect(resultCode()).toBe(DEV_RESULT_CODE);
    expect(withResultCode('k')).toBe('k|rc=dev');
    setResultCode('B');
    expect(withResultCode('k')).toBe('k|rc=B');
    expect(sameResultCode('B')).toBe(true);
    expect(sameResultCode('A')).toBe(false);
    expect(sameResultCode(undefined)).toBe(false);
  });
});
