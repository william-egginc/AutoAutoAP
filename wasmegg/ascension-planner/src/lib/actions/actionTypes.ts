/**
 * Every action type a plan can hold, as plain data: what a plan file is checked against (lib/uploadGuard.ts)
 * without loading the executors and the stores behind them. actionTypes.spec.ts keeps it equal to the
 * executor registry (executor.ts).
 */
export const ACTION_TYPES = [
  'start_ascension',
  'buy_vehicle',
  'buy_hab',
  'buy_research',
  'shift',
  'buy_train_car',
  'change_artifacts',
  'buy_silo',
  'store_fuel',
  'remove_fuel',
  'wait_for_te',
  'launch_missions',
  'toggle_sale',
  'equip_artifact_set',
  'update_artifact_set',
  'wait_for_missions',
  'wait_for_time',
  'wait_for_full_habs',
  'wait_for_research_sale',
  'wait_for_earnings_boost',
  'wait_for_gems',
  'wait_for_no_earnings',
  'toggle_earnings_boost',
  'notification',
  'modify_bank',
] as const;

const KNOWN = new Set<string>(ACTION_TYPES);
export const isActionTypeName = (t: unknown): boolean => typeof t === 'string' && KNOWN.has(t);
