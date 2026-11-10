/**
 * THE SILO TRICK SETTING ON JORDAN'S MAIN (spec-silotrick, 10 Nov 2026): the save of Sat 7 Nov 2026, 9:58 am (scrubbed, read
 * where it is, never copied), planned from Sun 8 Nov 10:30 am, target 218. Off (today's default) the plan buys 17 levels at
 * the Friday 13 Nov sale (NNR 15→18, RO 2→4, TD 46→50, HP 0→5, WD 15→18) and shifts to Humility at 10:00 am. On, the plan
 * counts the silo trick cash (one modify_bank credit at Monday's 2x event) and buys the 18th (WD 15→19) and shifts later:
 * the plan he really faced on Tue 10 Nov from his real bank (WD 18→19 at 2:29 pm, shift 2:29 pm).
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1:
 *   AAP_SLOW_SPECS=1 TZ=America/Denver npx vitest run src/search/leg.siloTrick.save.spec.ts
 */
import '../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { buildUpPlanFromSegments } from '@/lib/followSim';
import { createChainEvaluator } from './chain';

const SAVE = process.env.MAIN_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-11-07-0959.json');
const hasSave = existsSync(SAVE);
const NOW = Math.floor(Date.parse('2026-11-08T10:30:00-07:00') / 1000);
const SALE_START = Math.floor(Date.parse('2026-11-13T10:00:00-07:00') / 1000);

type Act = { kind: string; label?: string; id?: string; fromLevel?: number; level?: number; t: number };

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)("Jordan's main, 7 Nov: the silo trick setting", () => {
  const plans: Record<'off' | 'on', Act[]> = { off: [], on: [] };
  beforeAll(async () => {
    const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
    setActivePinia(createPinia());
    backup.eiUserId = 'EI0000000000000000';
    resolveColleggtibleContracts(backup);
    await initPlanFuture('file', markRaw(backup));
    const store = useChainSearchStore();
    store.setFirstAscension('buildup');
    store.pinPlanStart(NOW);
    for (const mode of ['off', 'on'] as const) {
      (store as unknown as { siloTrick: boolean }).siloTrick = mode === 'on';
      const route = createChainEvaluator(store.collectInputs()).evaluate([218], { keepPurchases: true })!;
      plans[mode] = buildUpPlanFromSegments(route.legs, { accountKey: 'a', siloSeconds: 0 })!
        .actions as unknown as Act[];
    }
  }, 600_000);
  afterAll(() => vi.useRealTimers());

  const wd = (acts: Act[]) =>
    Math.max(...acts.filter(a => a.kind === 'research' && a.id === 'wormhole_dampening').map(a => a.level ?? 0));
  const credits = (acts: Act[]) => acts.filter(a => a.label === 'modify_bank' || a.id === 'modify_bank').length;
  const h1 = (acts: Act[]) => acts.find(a => a.kind === 'shift' && a.label === 'H1')!.t;

  it('off: as today, 17 buys at the sale (WD 15 to 18), no credit, the shift at 10:00 am', () => {
    expect(wd(plans.off)).toBe(18);
    expect(credits(plans.off)).toBe(0);
    expect(h1(plans.off)).toBe(SALE_START);
  });

  it('on: the credit is in the plan, the 18th buy (WD 15 to 19) comes and the shift is after 10:00 am', () => {
    expect(credits(plans.on)).toBe(1);
    expect(wd(plans.on)).toBe(19);
    expect(h1(plans.on)).toBeGreaterThan(SALE_START);
  });
});
