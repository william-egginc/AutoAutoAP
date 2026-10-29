/**
 * THE INSTANT CARD'S GEAR NUMBERS, OFF THE SETUP (a player's Safari, 24 Oct 2026: By a date, Egg Day 2027, hours
 * 7:00 am to 5:00 am, no-prestige days, then a day off on 27 Oct 2027: "I took a day off and it broke the
 * simulator", the card replaced by "The instant answer couldn't be shown").
 *
 * The card's delivery scale (search/leg.ts `instantDeliveryScale`) was read through the store's `collectInputs()`,
 * which builds the whole search setup: the engine's base state, the hours, dates to hit, and the time off and
 * no-prestige days turned into windows. Read inside a computed the card draws, every one of those became something
 * the card redraws on: each edit of a day off (adding the row, its first day, its last day) re-ran the setup
 * collection and the inventory's best-set search inside the card's own update (measured in Chrome: three runs for
 * one day off). Anything that threw there, from any part of that setup, took the whole card down (InstantGuard.ts).
 * The scale needs only the save (its backup, epic research and colleggtibles), so it reads only that now, and a
 * reading that fails keeps the last good number instead of failing the card.
 *
 * Pure apart from what `context` reads: no Vue here, so the spec can count what a setup edit re-runs.
 */
import type { SimulationContext } from '@/engine/types';
import { instantDeliveryScale } from './leg';
import type { TableHeader } from './precomputedTable';

/**
 * The player's peak delivery rate against the table's: 1 on the player's own table, null until the table's header is
 * in, 1 with a header without `k3`. `context` is the save's simulation context (engine/adapter.ts
 * `getSimulationContext`), never the whole setup.
 */
export function cardDeliveryScale(
  own: boolean,
  header: Pick<TableHeader, 'k3'> | null,
  context: () => SimulationContext
): number | null {
  if (own) return 1;
  const k3 = header?.k3;
  if (!k3) return header ? 1 : null;
  return instantDeliveryScale({ context: context() }, k3);
}

/**
 * A number the card draws, read so that a failure never takes the card down: the reading, or when it throws the last
 * good one (`last`, which starts as the caller's default), with the error handed to `onError` (a console line; the
 * card shows as before).
 */
export function readKept<T>(read: () => T, last: { value: T }, onError: (err: unknown) => void): T {
  try {
    const v = read();
    last.value = v;
    return v;
  } catch (err) {
    onError(err);
    return last.value;
  }
}
