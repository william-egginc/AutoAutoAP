/**
 * The gear part of the instant answer record that is sent only after the player has agreed to the one-more-time consent
 * (`shareGearDetail`, revision 3; Jordan, 24 Nov 2026): `gear.answer` as `delivery:<key>` when a delivery set's table
 * answered, and `gear.delivery`, `gear.earnings`, `gear.deliveryStones`, `gear.earningsStones`, `gear.noTable`
 * (collector 8aa9bc925). The collector refuses a WHOLE record for one bad known field, so each value is checked against
 * the collector's own pattern here and a bad one is left out, never sent. Before the new consent: the old answer only.
 */
import type { AnswerTable } from '@/lib/optimisticAnswer';
import type { PlayerGear } from './instantCompute';

/** collector/worker.js DELIVERY_KEY (delivery and earnings keys, and the part after `delivery:`). */
const SET_KEY = /^[A-Za-z0-9_-]{1,24}$/;
/** collector/worker.js GEAR_STONES. */
const STONE_KEY = /^[A-Za-z0-9_-]{1,48}$/;
/** The collector refuses any value that holds a player ID. */
const HAS_ID = /EI\d{16}/i;

const setKey = (v: unknown): v is string => typeof v === 'string' && SET_KEY.test(v) && !HAS_ID.test(v);
const stoneKey = (v: unknown): v is string => typeof v === 'string' && STONE_KEY.test(v) && !HAS_ID.test(v);

export interface GearDetail {
  answer: AnswerTable | `delivery:${string}`;
  delivery?: string;
  earnings?: string;
  deliveryStones?: string;
  earningsStones?: string;
  noTable?: boolean;
}

export function gearDetailOf(
  d: { answer: AnswerTable; deliveryUsed: string; kept: PlayerGear | null },
  agreed: boolean
): GearDetail {
  if (!agreed) return { answer: d.answer };
  const k = d.kept;
  return {
    answer: setKey(d.deliveryUsed) ? `delivery:${d.deliveryUsed}` : d.answer,
    ...(setKey(k?.delivery) ? { delivery: k.delivery } : {}),
    ...(setKey(k?.earnings) ? { earnings: k.earnings } : {}),
    ...(stoneKey(k?.deliveryStones) ? { deliveryStones: k.deliveryStones } : {}),
    ...(stoneKey(k?.earningsStones) ? { earningsStones: k.earningsStones } : {}),
    ...(typeof k?.noTable === 'boolean' ? { noTable: k.noTable } : {}),
  };
}
