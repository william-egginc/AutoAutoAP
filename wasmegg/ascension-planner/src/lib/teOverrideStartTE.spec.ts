/**
 * spec-overridestart (7 Nov 2026). My runs waits for the stores set up from the save "as Fastest and By a date have
 * them" (useNowPage `storeReady`, App `storesSetUpFromSave`), and checked that by the store's TE equalling the SAVE's
 * TE (pending counted). But setting a save up (lib/modes/planFuture.ts) rolls the pending TE up and THEN puts this
 * account's starting-TE override back (4b): claimed TE only, pending left out by design. With an override on, the
 * store never reads the save's TE, so My runs waited for good, whichever way in ("the planner's inputs are not this
 * save's yet", Jordan, a save at 198 with one Curiosity TE pending, the stores at 197). The set-up is right when the
 * store holds the TE the planner starts from: the override's, when this account has one; else the save's.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { plannerStartTEOf } from './teOverrideAccount';
import { accountOf } from '@/search/runSaves';
import { useAutoPlannerStore } from '@/stores/autoPlanner';

const ID_A = 'EI' + '1234567890123456';
const ID_B = 'EI' + '6543210987654321';
/** 40 + 40 + 40 + 40 + 37 claimed, nothing pending: the save reads 197. */
function save(id: string) {
  return { eiUserId: id, virtue: { eovEarned: [40, 40, 40, 40, 37], eggsDelivered: [0, 0, 0, 0, 0] } };
}
const OVERRIDE = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };

describe('plannerStartTEOf', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("is the save's TE when there is no override", () => {
    const raw = save(ID_A);
    expect(plannerStartTEOf(raw)).toBe(197);
  });

  it("is the override's TE when this account has one", () => {
    const raw = save(ID_A);
    const planner = useAutoPlannerStore();
    planner.teOverride = { ...OVERRIDE, kindness: 30 };
    planner.teOverrideAccount = accountOf(raw);
    expect(plannerStartTEOf(raw)).toBe(190);
  });

  it("ignores another account's override", () => {
    const planner = useAutoPlannerStore();
    planner.teOverride = { ...OVERRIDE, kindness: 30 };
    planner.teOverrideAccount = accountOf(save(ID_B));
    expect(plannerStartTEOf(save(ID_A))).toBe(197);
  });
});

describe('My runs reads its set-up against the planner start TE, not the save TE alone', () => {
  const nowPage = readFileSync(new URL('../composables/useNowPage.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');

  it('useNowPage storeReady', () => {
    const line = nowPage.split('\n').find(l => l.includes('const storeReady = computed('));
    expect(line).toContain('plannerStartTEOf(raw.value)');
  });

  it('App storesSetUpFromSave', () => {
    const start = app.indexOf('const storesSetUpFromSave = computed(');
    expect(start).toBeGreaterThan(0);
    expect(app.slice(start, app.indexOf(');\n', start))).toContain('plannerStartTEOf(initialStateStore.rawBackup)');
  });
});
