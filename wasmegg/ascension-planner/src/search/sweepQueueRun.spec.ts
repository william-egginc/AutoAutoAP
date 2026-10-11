import { describe, it, expect } from 'vitest';
import { runSweepQueue, type LiveSweepQueue, type SweepQueueRunDeps } from './sweepQueueRun';
import type { SweepQueueChain } from './persistence';

const chain = (k: number): SweepQueueChain => ({
  label: `Chain ${k + 1}`,
  spec: { lo: 200 + k, hi: 200 + k, step: 1, minAsc: 2, maxAsc: 2, minGap: 0 },
  count: 10,
  ascensions: 2,
});
const CHAINS = [0, 1, 2, 3].map(chain);

function harness(o: { stopAt?: number; refuse?: boolean } = {}) {
  const queue: LiveSweepQueue = { at: -1, total: 0, cancelled: false, results: [] };
  const log: string[] = [];
  let last = 0;
  const deps: SweepQueueRunDeps = {
    queue,
    playerNow: () => 'P',
    busy: () => false,
    start: async spec => {
      last = spec.lo;
      log.push(`start ${spec.lo} (queue at ${queue.at})`);
    },
    resume: async next => {
      if (o.refuse) return false;
      last = next ? next.lo : 200 + queue.at;
      log.push(next ? `carry on into ${next.lo}` : `carry on ${200 + queue.at}`);
      return true;
    },
    outcome: () => ({
      error: o.refuse ? "its save wouldn't load" : null,
      failed: false,
      stoppedEarly: o.stopAt === last,
      days: 100 + last - 200,
      chain: [last, 490],
      finish: 1_000 + last,
    }),
    sendIfOwed: async () => void log.push(`send ${last}`),
    save: async label => void log.push(`save ${label}`),
    persistQueue: async handled => void log.push(`queue ${handled} (at ${queue.at})`),
  };
  return { queue, log, deps };
}

describe('runSweepQueue', () => {
  it('a carry-on finishes the chain it was on, then runs the rest, keeping the earlier results', async () => {
    const { queue, log, deps } = harness();
    const earlier = { label: 'Chain 1', chain: [200, 490], days: 100, stopped: false, finish: 1200 };
    await runSweepQueue(deps, {
      player: 'P',
      chains: CHAINS,
      from: 1,
      results: [earlier],
      carry: 'same',
      submit: true,
      name: 'Jo',
    });
    expect(log).toEqual([
      'carry on 201',
      'send 201',
      'save Chain 2',
      'queue true (at 1)',
      'start 202 (queue at 2)',
      'send 202',
      'save Chain 3',
      'queue true (at 2)',
      'start 203 (queue at 3)',
      'send 203',
      'save Chain 4',
      // The last one: the queue is over.
      'queue null (at -1)',
    ]);
    expect(queue.results.map(r => r.label)).toEqual(['Chain 1', 'Chain 2', 'Chain 3', 'Chain 4']);
    // The whole queue for the time left, and its submit intent, as a fresh click would have them.
    expect(queue.total).toBe(4);
    expect(queue.counts).toEqual([10, 10, 10, 10]);
    expect(queue.submit).toBe(true);
    expect(queue.name).toBe('Jo');
    expect(queue.at).toBe(-1);
  });

  it('a chain that had finished and been recorded: the carry-on starts the next one', async () => {
    const { log, deps } = harness();
    await runSweepQueue(deps, {
      player: 'P',
      chains: CHAINS,
      from: 2,
      results: [],
      carry: 'next',
      submit: false,
      name: '',
    });
    expect(log[0]).toBe('carry on into 202');
    expect(log).toContain('start 203 (queue at 3)');
    expect(log.filter(l => l.startsWith('carry on'))).toHaveLength(1);
  });

  it('stopped: the rest do not run and the queue is taken off the checkpoint', async () => {
    const { queue, log, deps } = harness({ stopAt: 201 });
    await runSweepQueue(deps, {
      player: 'P',
      chains: CHAINS,
      from: 0,
      results: [],
      carry: null,
      submit: false,
      name: '',
    });
    expect(log.filter(l => l.startsWith('start'))).toEqual(['start 200 (queue at 0)', 'start 201 (queue at 1)']);
    expect(log.at(-1)).toBe('queue null (at -1)');
    expect(queue.results.at(-1)).toMatchObject({ label: 'Chain 2', stopped: true });
  });

  it('a refused carry-on keeps the queue on the checkpoint, to carry on later', async () => {
    const { queue, log, deps } = harness({ refuse: true });
    await runSweepQueue(deps, {
      player: 'P',
      chains: CHAINS,
      from: 1,
      results: [],
      carry: 'same',
      submit: false,
      name: '',
    });
    expect(log.some(l => l.startsWith('queue'))).toBe(false);
    expect(queue.results[0].label).toMatch(/^Chain 2: /);
  });
});
