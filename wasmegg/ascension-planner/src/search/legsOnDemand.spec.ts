import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLegsOnDemand, driftNote, legsKey } from './legsOnDemand';
import type { ChainSearchPool } from './pool';
import type { SearchInputs } from './types';

const leg = { key: '1-sale', endTE: 300, durationSeconds: 10, maxELR: 1, endTime: 1010, tier13Unlocked: false };

/** A stand-in pool: resolves when told, records what it was given. */
function fakePool() {
  const made: { inputs: SearchInputs; size: number; handoff?: string; terminated: boolean; release: () => void }[] = [];
  const makePool = vi.fn(async (inputs: SearchInputs, opts: { size: number }) => {
    let release = () => {};
    const gate = new Promise<void>(r => (release = r));
    const rec = {
      inputs,
      size: opts.size,
      handoff: undefined as string | undefined,
      terminated: false,
      release: () => release(),
    };
    made.push(rec);
    return {
      evaluate: async (chains: number[][], _p: unknown, o?: { handoff?: string }) => {
        rec.handoff = o?.handoff;
        await gate;
        return { results: chains.map(c => ({ chain: c, seconds: 1234, legs: [leg] })), legSims: 1, workersUsed: 1 };
      },
      terminate: () => void (rec.terminated = true),
    } as unknown as ChainSearchPool;
  });
  return { made, makePool };
}

const inputs = (planStart: number) => ({ planStart }) as SearchInputs;

describe('legs on demand', () => {
  it("one worker, the result's plan start and handoff; kept by route + plan start + handoff", async () => {
    const { made, makePool } = fakePool();
    const od = createLegsOnDemand(makePool);
    const p = od.load([250, 300], inputs(1000), 'now');
    await vi.waitFor(() => expect(made.length).toBe(1));
    expect(od.state.get(legsKey([250, 300], 1000, 'now'))?.state).toBe('running');
    made[0].release();
    const r = await p;
    expect(r).toEqual({ state: 'done', legs: [leg], seconds: 1234 });
    expect(made[0].size).toBe(1);
    expect(made[0].inputs.planStart).toBe(1000);
    expect(made[0].handoff).toBe('now');
    expect(made[0].terminated).toBe(true);
    // Asked again: from the cache, no new worker.
    await od.load([250, 300], inputs(1000), 'now');
    expect(makePool).toHaveBeenCalledTimes(1);
    // Another plan start is another price.
    expect(legsKey([250, 300], 1000, 'now')).not.toBe(legsKey([250, 300], 2000, 'now'));
    expect(legsKey([250, 300], 1000, 'now')).not.toBe(legsKey([250, 300], 1000, 'hour'));
  });

  it('Cancel (or a search starting) stops the worker and marks the route cancelled', async () => {
    const { made, makePool } = fakePool();
    const od = createLegsOnDemand(makePool);
    const p = od.load([250, 300], inputs(1000));
    await vi.waitFor(() => expect(made.length).toBe(1));
    od.cancel();
    expect(made[0].terminated).toBe(true);
    made[0].release();
    await p;
    expect(od.state.get(legsKey([250, 300], 1000))?.state).toBe('cancelled');
  });

  it('a second route replaces the first', async () => {
    const { made, makePool } = fakePool();
    const od = createLegsOnDemand(makePool);
    void od.load([250, 300], inputs(1000));
    await vi.waitFor(() => expect(made.length).toBe(1));
    const p2 = od.load([260, 300], inputs(1000));
    expect(made[0].terminated).toBe(true);
    expect(od.state.get(legsKey([250, 300], 1000))?.state).toBe('cancelled');
    await vi.waitFor(() => expect(made.length).toBe(2));
    made[1].release();
    expect((await p2).state).toBe('done');
  });

  it('a failure says so (no legs, or the worker throwing)', async () => {
    const od = createLegsOnDemand(async () => {
      throw new Error('no worker');
    });
    expect((await od.load([250], inputs(1))).state).toBe('failed');
  });

  it('driftNote: only past a minute, with both ends', () => {
    const show = (t: number) => `t${t}`;
    expect(driftNote(1000, 1060, 0, show)).toBe('');
    expect(driftNote(1000, 1100, 5, show)).toBe(
      'Re-simulated on your current setup and save: it ends t1105, not t1005 as the run priced it.'
    );
  });

  it("Your latest run: rows without legs get the arrow and Work them out, from the run's plan start, cancelled by any search", () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/auto/LatestRunView.vue'), 'utf8');
    expect(src).toContain('createLegsOnDemand(createChainSearchPool)');
    expect(src).toContain(
      "onDemand.load([...row.chain], { ...store.collectInputs(), planStart: runStart.value }, 'now')"
    );
    expect(src).toContain('const runStart = computed(() => store.planStartUsed || store.planStart);');
    expect(src).toContain('watch(anythingRunning, on => on && onDemand.cancel());');
    expect(src).toContain('onBeforeUnmount(() => onDemand.cancel());');
    expect(src).toContain('data-testid="legs-on-demand-cancel"');
  });
});
