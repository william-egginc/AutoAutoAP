/**
 * The carry-on's reduced worker count holds for the whole run (the player's black box: 14 workers, a
 * carry-on at 10, then 15 again nine seconds later), and the player's own count comes back only when
 * that run ends or is stopped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';

const backing = new Map<string, string>();
function stubBrowser(): void {
  backing.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
  });
  vi.stubGlobal('window', { location: { href: 'https://planner.test/' } });
}

async function setup(threads = 16, own = 15) {
  vi.resetModules();
  stubBrowser();
  const sa = await import('@/search/stepAway');
  const m = await import('./useStepAway');
  const workerBudget: Ref<number> = ref(own);
  m.installStepAway({ workerBudget, machineThreads: threads, account: async () => 'acct', log: () => undefined });
  // The crashed run's last mark: 14 workers, automatic carry-on on, option 3 off.
  sa.writeRunMark({
    version: 1,
    kind: 'sweep',
    url: 'https://planner.test/',
    account: 'acct',
    startedAt: 1000,
    beatAt: 2000,
    status: 'running',
    autoCarryOn: true,
    watch: false,
    fewerWorkers: false,
    workers: 14,
    reopens: [],
    autoCarries: [],
  });
  return { sa, m, workerBudget };
}

describe('a carried-on run keeps its reduced worker count', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('takes a notch fewer than the crashed run and holds it through the run, restoring at the end', async () => {
    const { m, workerBudget } = await setup();
    expect(m.stepAwayBeginCarryOn()).toBe(10);
    await m.stepAwayRunStarted('sweep');
    await nextTick();
    expect(workerBudget.value).toBe(10);
    // Beats come and go (option 3 off: no step-down rule runs); the count stays.
    for (let i = 0; i < 4; i++) m.stepAwayBeat({ done: i * 100, workers: 10 });
    expect(workerBudget.value).toBe(10);
    m.stepAwayRunEnded(false);
    expect(workerBudget.value).toBe(15);
  });

  it('is not undone by ticking another box in "Stepping away?" mid-run', async () => {
    const { m, workerBudget } = await setup();
    m.stepAwayBeginCarryOn();
    await m.stepAwayRunStarted('sweep');
    m.stepAwayOptions.value.watch = true;
    await nextTick();
    m.stepAwayOptions.value.autoCarryOn = false;
    await nextTick();
    expect(workerBudget.value).toBe(10);
  });

  it('keeps the carry-on ceiling when option 3 is ticked and then unticked', async () => {
    const { m, workerBudget } = await setup();
    m.stepAwayBeginCarryOn();
    await m.stepAwayRunStarted('sweep');
    m.stepAwayOptions.value.fewerWorkers = true;
    await nextTick();
    expect(workerBudget.value).toBe(8); // half of 16 cores
    m.stepAwayOptions.value.fewerWorkers = false;
    await nextTick();
    expect(workerBudget.value).toBe(10); // back to the carry-on's count, not the player's 15
    m.stepAwayRunEnded(true);
    expect(workerBudget.value).toBe(15);
  });

  it('does not give the count back when a carry-on is cancelled while another run is going here', async () => {
    const { m, workerBudget } = await setup();
    m.stepAwayBeginCarryOn();
    await m.stepAwayRunStarted('sweep');
    m.stepAwayGiveUp('stopped');
    expect(workerBudget.value).toBe(10);
  });

  it('gives it back when the carry-on never gets going', async () => {
    const { m, workerBudget } = await setup();
    m.stepAwayBeginCarryOn();
    expect(workerBudget.value).toBe(10);
    m.stepAwayGiveUp('stuck');
    expect(workerBudget.value).toBe(15);
  });

  it('respects a slider move during the run, at the end and across later step-downs', async () => {
    const { m, workerBudget } = await setup();
    m.stepAwayBeginCarryOn();
    await m.stepAwayRunStarted('sweep');
    workerBudget.value = 12; // the player
    m.stepAwayRunEnded(false);
    expect(workerBudget.value).toBe(12);
  });

  it('shows the reduced count in the black box note', async () => {
    const { m } = await setup();
    m.stepAwayBeginCarryOn();
    expect([...backing.values()].join('\n')).toContain('carry-on workers: 15 -> 10 (the crashed run had 14)');
  });
});
