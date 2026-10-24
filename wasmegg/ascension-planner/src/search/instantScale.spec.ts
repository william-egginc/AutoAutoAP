// MUST be first: the stores read localStorage/window at import (see chain.spec.ts).
import '../../scripts/node-shims';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { SimulationContext } from '@/engine/types';
import type { TableHeader } from './precomputedTable';

/**
 * THE INSTANT CARD'S GEAR NUMBERS, OFF THE SETUP (search/instantScale.ts). A player's Safari, 24 Oct 2026: By a date
 * (Egg Day 2027), hours 7:00 am to 5:00 am (America/Denver), no-prestige days 29-31 Oct and 22-24 Nov 2026, then a
 * day off on 27 Oct 2027, after the deadline: the card gave way to "The instant answer couldn't be shown". Adding the
 * day off re-ran the card's delivery scale inside its own update, because it was read through the store's whole
 * setup (`collectInputs`): any throw anywhere in that setup took the card down. It reads the save only now, and a
 * reading that throws keeps the last good number.
 */
let mods: {
  chain: typeof import('@/stores/chainSearch');
  planner: typeof import('@/stores/autoPlanner');
  scale: typeof import('./instantScale');
  adapter: typeof import('@/engine/adapter');
};
beforeAll(async () => {
  mods = {
    chain: await import('@/stores/chainSearch'),
    planner: await import('@/stores/autoPlanner'),
    scale: await import('./instantScale'),
    adapter: await import('@/engine/adapter'),
  };
}, 120_000);

function stores() {
  setActivePinia(createPinia());
  return { store: mods.chain.useChainSearchStore(), planner: mods.planner.useAutoPlannerStore() };
}

/** The player's setup, as Your setup holds it. */
function playerSetup(
  store: ReturnType<typeof stores>['store'],
  planner: ReturnType<typeof stores>['planner']
): void {
  planner.timezone = 'America/Denver';
  store.scheduleEnabled = true;
  store.availableFrom = 7;
  store.availableTo = 5;
  store.noPrestige = [
    { from: '2026-10-29', to: '2026-10-31' },
    { from: '2026-11-22', to: '2026-11-24' },
  ];
}

const K3 = { research: {}, delivery: [] } as unknown as NonNullable<TableHeader['k3']>;

describe('the card’s delivery scale reads the save, not the setup', () => {
  it('a day off, no-prestige days or the hours changing do not re-run it (the player’s exact setup)', () => {
    const { store, planner } = stores();
    playerSetup(store, planner);
    // Every store the setup touches exists already on the page (a store made later is a change of its own).
    store.collectInputs();
    const reads = vi.fn(() => mods.adapter.getSimulationContext());
    const scale = computed(() => mods.scale.cardDeliveryScale(false, { k3: K3 }, reads));
    expect(scale.value).toBe(1); // no save loaded: 1
    // The day off, as the editor adds it (Egg Day first) and the player moves it to 27 Oct 2027, after the deadline;
    // then another no-prestige day and other hours.
    const edits = [
      () => store.timeOff.push({ from: '2027-07-14', to: '2027-07-14' }),
      () => (store.timeOff[0].from = '2027-10-27'),
      () => (store.timeOff[0].to = '2027-10-27'),
      () => (store.noPrestige = [...store.noPrestige, { from: '2027-08-01', to: '2027-08-01' }]),
      () => (store.availableTo = 4),
    ];
    for (const edit of edits) {
      edit();
      expect(scale.value).toBe(1);
    }
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('the old reading, through the whole setup, re-ran on every edit of the day off', () => {
    const { store, planner } = stores();
    playerSetup(store, planner);
    store.collectInputs();
    let runs = 0;
    const old = computed(() => {
      runs++;
      store.collectInputs();
      return 1;
    });
    void old.value;
    store.timeOff.push({ from: '2027-07-14', to: '2027-07-14' });
    void old.value;
    store.timeOff[0].from = '2027-10-27';
    void old.value;
    store.timeOff[0].to = '2027-10-27';
    void old.value;
    expect(runs).toBe(4);
  });

  it('the setup itself collects without a throw: time off after the deadline, no-prestige days, hours past midnight', () => {
    const { store, planner } = stores();
    playerSetup(store, planner);
    store.timeOff = [{ from: '2027-10-27', to: '2027-10-27' }];
    const i = store.collectInputs();
    expect(i.availability).toEqual({ days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 5, timezone: 'America/Denver' });
    // Whole local days in Denver (MDT, UTC-6 on both).
    expect(i.timeOff).toEqual([
      { from: Date.parse('2027-10-27T06:00:00Z') / 1000, to: Date.parse('2027-10-28T06:00:00Z') / 1000 },
    ]);
    expect(i.noPrestige).toEqual([
      { from: Date.parse('2026-10-29T06:00:00Z') / 1000, to: Date.parse('2026-11-01T06:00:00Z') / 1000 },
      // 22-24 Nov is MST (UTC-7).
      { from: Date.parse('2026-11-22T07:00:00Z') / 1000, to: Date.parse('2026-11-25T07:00:00Z') / 1000 },
    ]);
  });
});

describe('cardDeliveryScale', () => {
  const ctx = () => ({}) as SimulationContext;
  it('1 on the player’s own table, null before the header, 1 with a header without k3', () => {
    expect(mods.scale.cardDeliveryScale(true, null, ctx)).toBe(1);
    expect(mods.scale.cardDeliveryScale(false, null, ctx)).toBeNull();
    expect(mods.scale.cardDeliveryScale(false, {}, ctx)).toBe(1);
  });
  it('1 without a save to read', () => {
    expect(mods.scale.cardDeliveryScale(false, { k3: K3 }, ctx)).toBe(1);
  });
});

describe('readKept: a number the card draws never takes it down', () => {
  it('the reading, kept as the last good one', () => {
    const last = { value: 0 };
    expect(mods.scale.readKept(() => 1.25, last, () => {})).toBe(1.25);
    expect(last.value).toBe(1.25);
  });
  it('a throw: the last good one, and the error handed on', () => {
    const last = { value: 0.97 as number | null };
    const seen: unknown[] = [];
    const v = mods.scale.readKept(
      () => {
        throw new RangeError('Out of memory');
      },
      last,
      e => seen.push(e)
    );
    expect(v).toBe(0.97);
    expect(seen).toHaveLength(1);
  });
  it('a throw before any reading: the default', () => {
    expect(
      mods.scale.readKept(
        () => {
          throw new Error('x');
        },
        { value: null },
        () => {}
      )
    ).toBeNull();
  });
});
