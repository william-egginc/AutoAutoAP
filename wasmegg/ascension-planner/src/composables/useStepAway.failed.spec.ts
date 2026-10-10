/**
 * How a run's end is marked for the watcher (composables/useStepAway.ts): 'finished' only when the
 * run says so (its result saved), 'failed' for an error, 'stopped' when Stop was pressed; and a run
 * starting while another tab's run is alive leaves that tab's mark alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const backing = new Map<string, string>();
beforeEach(() => {
  vi.resetModules();
  backing.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
  });
  vi.stubGlobal('window', { location: { href: 'https://planner.test/' } });
});

async function setup(lock: 'ours' | 'other' | 'unknown' = 'ours') {
  const sa = await import('@/search/stepAway');
  const m = await import('./useStepAway');
  m.installStepAway({
    workerBudget: ref(8),
    machineThreads: 16,
    account: async () => 'acct',
    log: () => undefined,
    runLock: async () => lock,
  });
  return { sa, m };
}

describe('the end of a run, as the run mark says it', () => {
  for (const how of ['finished', 'failed', 'stopped'] as const) {
    it(`writes ${how} when the run ended ${how}`, async () => {
      const { sa, m } = await setup();
      await m.stepAwayRunStarted('deadline');
      expect(sa.readRunMark()?.status).toBe('running');
      m.stepAwayRunEnded(how);
      expect(sa.readRunMark()?.status).toBe(how);
    });
  }

  it('keeps stopped when Stop was pressed, whatever the end then was', async () => {
    const { sa, m } = await setup();
    await m.stepAwayRunStarted('deadline');
    m.stepAwayStopPressed();
    m.stepAwayRunEnded('failed');
    expect(sa.readRunMark()?.status).toBe('stopped');
  });

  it("a carry-on that gives up stands a failed run's watcher down", async () => {
    const { sa, m } = await setup();
    sa.writeRunMark({
      version: 1,
      kind: 'deadline',
      url: 'https://planner.test/',
      account: 'acct',
      startedAt: 1,
      beatAt: 2,
      status: 'failed',
      autoCarryOn: true,
      watch: true,
      fewerWorkers: false,
      workers: 19,
      reopens: [],
      autoCarries: [],
    });
    m.stepAwayGiveUp('stuck');
    expect(sa.readRunMark()?.status).toBe('stuck');
  });
});

describe('a second tab', () => {
  const alive = () => ({
    version: 1 as const,
    kind: 'deadline' as const,
    url: 'https://planner.test/first',
    account: 'acct',
    startedAt: Date.now() - 3600_000,
    beatAt: Date.now() - 5_000,
    status: 'running' as const,
    autoCarryOn: true,
    watch: true,
    fewerWorkers: false,
    workers: 19,
    reopens: [],
    autoCarries: [],
  });

  it("does not write over a live run's mark in another tab", async () => {
    const { sa, m } = await setup('other');
    const first = alive();
    sa.writeRunMark(first);
    await m.stepAwayRunStarted('smart');
    expect(sa.readRunMark()).toEqual(first);
    // ...nor end it.
    m.stepAwayRunEnded('finished');
    expect(sa.readRunMark()?.status).toBe('running');
  });

  it('takes the mark over once it holds the run lock (the other run is gone)', async () => {
    const { sa, m } = await setup('ours');
    sa.writeRunMark(alive());
    await m.stepAwayRunStarted('smart');
    expect(sa.readRunMark()?.kind).toBe('smart');
  });
});
