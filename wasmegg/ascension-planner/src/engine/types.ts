import type { CalculationsSnapshot, VehicleSlot, ResearchLevels, ArtifactSlotPayload, VirtueEgg } from '@/types';
import type { Modifiers as ColleggtibleModifiers } from 'lib/collegtibles';

/**
 * The minimal mutable state required to compute the next state.
 * This corresponds to the "input" fields of CalculationsSnapshot.
 */
export interface EngineState {
  // Virtue State
  currentEgg: VirtueEgg;
  shiftCount: number;
  te: number;
  soulEggs: number;
  bankValue: number;

  // Farm State
  habIds: (number | null)[];
  vehicles: VehicleSlot[];
  researchLevels: ResearchLevels;
  siloCount: number;
  tankLevel: number;

  // Artifacts
  artifactLoadout: ArtifactSlotPayload[];
  activeArtifactSet: import('@/types').ArtifactSetName | null;
  artifactSets: Record<import('@/types').ArtifactSetName, ArtifactSlotPayload[] | null>;

  // Progress State
  fuelTankAmounts: Record<VirtueEgg, number>;
  eggsDelivered: Record<VirtueEgg, number>;
  teEarned: Record<VirtueEgg, number>;

  population: number;
  lastStepTime: number;

  activeSales: {
    research: boolean;
    hab: boolean;
    vehicle: boolean;
  };
  earningsBoost: {
    active: boolean;
    multiplier: number;
  };
  maxELR?: number;
  /** LOW-TE GATE (temporary until Joo's PR 717 merges): set (to its round count) only when this
   *  ascension's build took the low-TE opening (auto/lowTeOpening.ts); absent everywhere else. */
  lowTeOpening?: number;
}

/**
 * Context that remains constant during a simulation run.
 */
export interface SimulationContext {
  epicResearchLevels: ResearchLevels;
  colleggtibleModifiers: ColleggtibleModifiers;
  ascensionStartTime: number; // Unix timestamp in seconds
  planStartOffset: number; // Seconds since ascension start at which planning begins
  assumeDoubleEarnings: boolean;
  rawBackup?: any; // ei.IBackup
  deferForEarningsMode: boolean;
  /**
   * The player's hours (auto/hold.ts): given a unix second, the first instant at or after it when
   * they can make an egg shift. Set only by the search when hours are picked; absent everywhere
   * else, which leaves every other path exactly as it was.
   */
  holdUntil?: (unixSeconds: number) => number;
  /** LOW-TE GATE (temporary until Joo's PR 717 merges): force the low-TE opening on ('force') or
   *  off ('never') for tests and probes. Absent everywhere else: the gate decides
   *  (auto/lowTeOpening.ts `wantsLowTeOpening`). */
  lowTeOpening?: 'force' | 'never';
  // TODO: Add any other global context needed (e.g. events?)
}

/**
 * Result of a simulation step.
 * Using existing types to minimize friction.
 */
export type SimulationResult = CalculationsSnapshot;
