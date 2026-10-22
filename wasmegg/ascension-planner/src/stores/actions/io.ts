/**
 * @module ActionIO
 * @description Import/Export logic for Ascension Plans.
 */

import { downloadFile } from '@/utils/export';
import { useInitialStateStore } from '@/stores/initialState';
import { useVirtueStore } from '@/stores/virtue';
import { useFuelTankStore } from '@/stores/fuelTank';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { useNotesStore } from '@/stores/notes';
import { useSilosStore } from '@/stores/silos';
import { createEmptySnapshot, generateActionId, type VirtueEgg, type Action, type CalculationsSnapshot } from '@/types';
import { isKnownActionType } from '@/lib/actions/executor';
import { parseJsonStrict } from '@/lib/uploadGuard';
import { MAX_TE, clampTECount, countTEThresholdsPassed, teGainedOf } from '@/lib/truthEggs';
import { redactBackupForStorage } from '@/lib/artifacts';

export function exportPlanData(actions: Action[], initialSnapshot?: CalculationsSnapshot, activePlanId: string | null = null) {
  const initialStateStore = useInitialStateStore();
  const virtueStore = useVirtueStore();
  const fuelTankStore = useFuelTankStore();
  const truthEggsStore = useTruthEggsStore();
  const notesStore = useNotesStore();

  const silosStore = useSilosStore();

  const baseSoulEggs = initialSnapshot ? initialSnapshot.soulEggs : initialStateStore.soulEggs;
  const baseLoadout = initialSnapshot ? initialSnapshot.artifactLoadout : initialStateStore.artifactLoadout;
  const baseSets = initialSnapshot ? initialSnapshot.artifactSets : initialStateStore.artifactSets;
  const baseActiveSet = initialSnapshot ? initialSnapshot.activeArtifactSet : initialStateStore.activeArtifactSet;
  const baseSiloCount = initialSnapshot ? initialSnapshot.siloCount : silosStore.siloCount;
  const baseTankLevel = initialSnapshot ? (initialSnapshot.tankLevel ?? fuelTankStore.tankLevel) : fuelTankStore.tankLevel;
  const baseFuelAmounts = initialSnapshot ? initialSnapshot.fuelTankAmounts : fuelTankStore.fuelAmounts;
  const baseEggsDelivered = initialSnapshot ? initialSnapshot.eggsDelivered : truthEggsStore.eggsDelivered;
  const baseTeEarned = initialSnapshot ? initialSnapshot.teEarned : truthEggsStore.teEarned;

  // Redacted backup (virtue artifact inventory only — no username, contracts,
  // missions, or serverId) stored as `initialState.rawBackup`, the same field
  // `initialStateStore.hydrate()` already reads on import. Lets artifact
  // recalculation (optimal set search, beam search) work after reloading a
  // saved plan without re-fetching the player's full backup. TEMPORARY:
  // logged to console so the shape/content can be reviewed before we rely on
  // it long-term.
  const redactedBackup = initialStateStore.rawBackup ? redactBackupForStorage(initialStateStore.rawBackup) : null;

  return {
    version: 1,
    timestamp: Date.now(),
    initialState: {
      playerId: 'EIxxxxxxxxxx',
      nickname: 'Redacted',
      lastBackupTime: 0,
      soulEggs: baseSoulEggs,
      epicResearchLevels: initialStateStore.epicResearchLevels,
      colleggtibleTiers: initialStateStore.colleggtibleTiers,
      artifactLoadout: baseLoadout,
      artifactSets: baseSets,
      activeArtifactSet: baseActiveSet,
      currentFarmState: initialStateStore.currentFarmState,
      assumeDoubleEarnings: initialStateStore.assumeDoubleEarnings,
      initialSiloCount: baseSiloCount,
      initialTankLevel: baseTankLevel,
      initialFuelAmounts: baseFuelAmounts,
      initialEggsDelivered: baseEggsDelivered,
      initialTeEarned: baseTeEarned,
      rawBackup: redactedBackup,
    },
    virtueState: {
      shiftCount: virtueStore.initialShiftCount,
      initialTE: virtueStore.initialTE,
      ascensionDate: virtueStore.ascensionDate,
      ascensionTime: virtueStore.ascensionTime,
      ascensionTimezone: virtueStore.ascensionTimezone,
    },
    fuelTankState: {
      tankLevel: baseTankLevel,
      fuelAmounts: baseFuelAmounts,
    },
    truthEggsState: {
      eggsDelivered: baseEggsDelivered,
      teEarned: baseTeEarned,
    },
    notesState: {
      notes: notesStore.notes,
    },
    actions: actions,
    activePlanId: activePlanId,
  };
}

export function exportPlanLogic(actions: Action[], initialSnapshot?: CalculationsSnapshot) {
  const exportData = exportPlanData(actions, initialSnapshot);

  // Sanitization: Ensure any internal mapping IDs or partitions are NOT in the export
  // (In this case, EIxxxxxxxxxx is already a placeholder, and we don't include storage keys)

  const jsonString = JSON.stringify(exportData, null, 2);
  const now = new Date();
  const filename = `ascension-plan-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;
  downloadFile(filename, jsonString, 'application/json');
}

const LOOSE = { maxDepth: 64, maxString: Infinity, maxArray: Infinity, maxKeys: Infinity };

/** A plan file that cannot be read in. Thrown before any store is touched, so the current plan stays. */
export class PlanImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanImportError';
  }
}

/**
 * The checks a file passes before anything is changed: JSON, the plan shape, and only action types this
 * planner knows (an unknown one threw "reading 'getDisplayName'" while the list drew).
 */
export function parsePlanFile(jsonString: string, upload = false): any {
  let data: any;
  try {
    // No __proto__-style keys and finite numbers always (lib/uploadGuard.ts); the size limits only for an
    // upload, so a draft or library plan saved here with a long note still opens.
    data = parseJsonStrict(jsonString, 'This plan file', upload ? {} : LOOSE);
  } catch (e) {
    throw new PlanImportError(e instanceof Error ? e.message : 'This file is not a plan file (it is not JSON).');
  }
  const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isObj(data) || !data.version || !Array.isArray(data.actions) || !isObj(data.initialState)) {
    throw new PlanImportError('This file is not a plan file (no version, actions or initial state).');
  }
  for (const a of data.actions) {
    if (!isObj(a) || !isKnownActionType(a.type)) {
      throw new PlanImportError(`This plan has a step this planner doesn't know (${String(a?.type).slice(0, 40)}).`);
    }
    if (a.payload !== undefined && !isObj(a.payload)) {
      throw new PlanImportError(`This plan has a damaged ${a.type} step.`);
    }
    if (a.payload === undefined) a.payload = {};
    if (!Array.isArray(a.dependsOn)) a.dependsOn = [];
    if (!Array.isArray(a.dependents)) a.dependents = [];
    if (typeof a.id !== 'string' || !a.id) a.id = generateActionId();
  }
  return data;
}

/**
 * A plan from a file with its results dropped, so it is recalculated rather than trusted (red team 21 Oct
 * 2026, data-inputs #7: a file's last `endState.te` of 99999 showed "TE GAINED +-9972"). Own saves (the
 * library's, the draft) keep theirs; a file never does. Returns the same object, changed.
 */
export function dropFileResults<T>(data: T): T {
  const actions = (data as { actions?: unknown } | null)?.actions;
  if (Array.isArray(actions)) for (const a of actions) if (a && typeof a === 'object') delete (a as { endState?: unknown }).endState;
  return data;
}

/** Per-egg TE (or eggs delivered) from a file: finite, whole and within 0..max, egg by egg. */
function clampPerEgg(v: unknown, max: number): Record<string, number> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [egg, n] of Object.entries(v as Record<string, unknown>)) {
    if (egg === '__proto__' || egg === 'constructor' || egg === 'prototype') continue;
    out[egg] = max === Infinity ? (typeof n === 'number' && isFinite(n) && n >= 0 ? n : 0) : clampTECount(n, max, 0);
  }
  return out;
}

export function importPlanLogic(jsonString: string) {
  const data = parsePlanFile(jsonString);
  // TE from a file is held to what the game allows (0..98 per egg), as everywhere else.
  if (data.initialState.initialTeEarned) data.initialState.initialTeEarned = clampPerEgg(data.initialState.initialTeEarned, MAX_TE);
  if (data.initialState.initialEggsDelivered)
    data.initialState.initialEggsDelivered = clampPerEgg(data.initialState.initialEggsDelivered, Infinity);
  if (data.truthEggsState && typeof data.truthEggsState === 'object') {
    if (data.truthEggsState.teEarned) data.truthEggsState.teEarned = clampPerEgg(data.truthEggsState.teEarned, MAX_TE);
    if (data.truthEggsState.eggsDelivered)
      data.truthEggsState.eggsDelivered = clampPerEgg(data.truthEggsState.eggsDelivered, Infinity);
  }

  const initialStateStore = useInitialStateStore();
  const virtueStore = useVirtueStore();
  const fuelTankStore = useFuelTankStore();
  const truthEggsStore = useTruthEggsStore();
  const notesStore = useNotesStore();

  initialStateStore.hydrate(data.initialState);

  if (data.virtueState) {
    virtueStore.setInitialState(data.virtueState.shiftCount || 0, data.virtueState.initialTE || 0);
    if (data.virtueState.ascensionDate) virtueStore.setAscensionDate(data.virtueState.ascensionDate);
    if (data.virtueState.ascensionTime) virtueStore.setAscensionTime(data.virtueState.ascensionTime);
    if (data.virtueState.ascensionTimezone) virtueStore.setAscensionTimezone(data.virtueState.ascensionTimezone);
  }

  if (data.fuelTankState) {
    fuelTankStore.setTankLevel(data.fuelTankState.tankLevel || 0);
    for (const [egg, amount] of Object.entries((data.fuelTankState.fuelAmounts || {}) as Record<string, number>)) {
      fuelTankStore.setFuelAmount(egg as VirtueEgg, amount);
    }
  }

  if (data.truthEggsState) {
    for (const [egg, amount] of Object.entries((data.truthEggsState.eggsDelivered || {}) as Record<string, number>)) {
      truthEggsStore.setEggsDelivered(egg as VirtueEgg, amount);
    }
    for (const [egg, count] of Object.entries((data.truthEggsState.teEarned || {}) as Record<string, number>)) {
      truthEggsStore.setTEEarned(egg as VirtueEgg, count);
    }
  }

  if (data.notesState) {
    notesStore.setNotes(data.notesState.notes || []);
  } else {
    notesStore.$reset();
  }

  // Merge simple wait_for_time actions into subsequent purchases to reduce clutter
  if (data.actions && data.actions.length > 0) {
    const mergedActions: any[] = [];
    for (let i = 0; i < data.actions.length; i++) {
      const action = data.actions[i];
      if (action.type === 'wait_for_time') {
        const nextAction = data.actions[i + 1];
        if (nextAction && ['buy_research', 'buy_hab', 'buy_vehicle', 'buy_train_car', 'buy_silo'].includes(nextAction.type)) {
          nextAction.totalTimeSeconds = (nextAction.totalTimeSeconds || 0) + (action.totalTimeSeconds || 0);
          nextAction.bankDelta = (nextAction.bankDelta || 0) + (action.bankDelta || 0);
          continue; // Skip adding the wait_for_time action
        }
      }
      mergedActions.push(action);
    }
    data.actions = mergedActions;
  }

  // Safeguard: Ensure a start_ascension action is present for the UI Action History
  if (data.actions && data.actions.length > 0 && data.actions[0].type !== 'start_ascension') {
    const startAction = {
      id: 'start_' + Math.random().toString(36).substring(2, 9),
      index: 0,
      timestamp: data.actions[0].timestamp || Date.now(),
      type: 'start_ascension',
      payload: { initialEgg: 'curiosity' },
      cost: 0, elrDelta: 0, offlineEarningsDelta: 0, eggValueDelta: 0,
      habCapacityDelta: 0, layRateDelta: 0, shippingCapacityDelta: 0,
      ihrDelta: 0, bankDelta: 0, populationDelta: 0, totalTimeSeconds: 0,
      endState: {
        ...createEmptySnapshot(),
        currentEgg: 'curiosity',
        eggsDelivered: { ...(data.truthEggsState?.eggsDelivered || {}) },
        teEarned: { ...(data.truthEggsState?.teEarned || {}) },
      },
      dependsOn: [], dependents: []
    };
    data.actions = [startAction, ...data.actions];
  }

  if (data.actions) {
    data.actions.forEach((a: any, i: number) => a.index = i);
    // Every plan read in (a file import, a Plan Library load or restore, a reconcile, the saved draft) keeps
    // Wait for TE within 98 per egg, as the Wait for TE box does (prelive, 21 Oct 2026).
    data.actions.forEach(capWaitForTE);
  }

  return data;
}

/**
 * A `wait_for_te` from a file held to the same bounds as one made with the box: a whole target from 0 to 98,
 * a start from 0 to 98, and a gain of at most target minus start (`teGainedOf`). A file can carry
 * `targetTE: 9999` (listed as "Wait for TE #9999") or a gain like 3.48e45.
 */
export function capWaitForTE(a: any): void {
  if (!a || a.type !== 'wait_for_te' || !a.payload || typeof a.payload !== 'object') return;
  const p = a.payload;
  p.targetTE = clampTECount(p.targetTE, MAX_TE, 0);
  p.startTE = clampTECount(p.startTE, MAX_TE, 0);
  p.teGained = teGainedOf(p);
}
