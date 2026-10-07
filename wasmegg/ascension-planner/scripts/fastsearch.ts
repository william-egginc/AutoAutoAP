/**
 * Headless chain search - the planner's own simulator, no browser.
 *
 * The predecessor to this drove the real UI through Selenium at ~35s per chain.
 * This calls the same simulation functions the app calls (runUntilShift ->
 * runC3Variants -> runAscensionFromC3Variant, chosen with the app's own
 * pickVariant) directly in Node.
 *
 * MEASURED, so nobody repeats my mistake: one leg simulation costs about SIX
 * SECONDS here. Chrome was never the bottleneck - the simulator is. Removing the
 * browser alone buys very little. The speed comes from the two things below plus
 * --jobs, and a fair comparison against 4 parallel Selenium workers is a handful
 * of times faster, not orders of magnitude.
 *
 * Two wins fall out of being in-process:
 *
 *   - PREFIX SHARING. Chains form a trie: every chain starting 195/226/277
 *     shares the A1, A2 and A3 simulations. The Selenium driver recomputed all
 *     five legs for every combo; this walks the trie depth-first and simulates
 *     each distinct prefix exactly once.
 *
 *   - ONE PLAN START for the whole run, by construction. A plan's duration
 *     depends on (chain, plan_start) jointly, and that hidden variable is what
 *     made cross-batch comparisons in the CSV corpus invalid - it falsified both
 *     the "X4 = 0 mod 4" rule and the "X2 225-231 all tie" rule. Here the start
 *     is pinned once and shared by every chain in the run.
 *
 * THE SITE'S SEARCHES (scripts/siteRun.ts). Smart search (--effort), the Full sweep (--bands,
 * --suggest or a named Science --preset) and Highest TE by a date (--by-date / --egg-day) are the
 * planner's own chain-search store, run in Node with the browser's own worker module on worker
 * threads: one implementation, two front ends, so the command line cannot drift from the site.
 * --submit sends a result the way the site does.
 *
 * THIS SCRIPT'S OWN TOOLS. --stages/--grid name the chains and price all of them (what autoplan.py
 * drives), --exhaustive --range prices every route over one pool, and --direct runs --effort on
 * this script's evaluator. These are what the what-ifs and diagnostics work with; none of them is
 * something the site does.
 *
 * OFFLINE BRUTE FORCE. Nothing here needs the network except sending. A save as a JSON file
 * (--backup), a search with --out DIR, and a later `submit --from DIR` on a machine that is online:
 *
 *   1. offline PC, once: get the save's JSON onto it (the game's backup, or `--player-id EI...
 *      --save-backup me.json` on a machine that is online, then copy me.json across).
 *   2. offline PC: run the search with --out. It writes DIR/run.csv.gz (the table the site uploads)
 *      and DIR/submission.json (exactly what the site would POST, with the run's own save time and
 *      TE), and keeps a checkpoint in DIR so a killed run carries on when the same command is run
 *      again (pin the plan start with --start-date/--start-time, or let the directory pin it).
 *   3. copy DIR to a machine that is online and run `fastsearch submit --from DIR`.
 *
 * Fully offline with --backup: nothing is fetched. --player-id is the only flag that touches the
 * network for a search; `submit` and --submit are the only things that send.
 *
 * Usage (after `pnpm search:build`; --help has every flag):
 *   node dist-search/fastsearch.js --backup backup.json --effort thorough --find-seed --jobs 12
 *   node dist-search/fastsearch.js --backup backup.json --bands "185-200:5; 215-245:10" --out run1
 *   node dist-search/fastsearch.js --backup backup.json --preset F4 --out f4
 *   node dist-search/fastsearch.js submit --from run1
 *   node dist-search/fastsearch.js --backup backup.json --egg-day --out eggday
 *   node dist-search/fastsearch.js --backup backup.json --exhaustive --range 185:390:5 --prestiges 6-8
 *   node dist-search/fastsearch.js --player-id EI... --stages "195;225-231;270-290;310-330"
 *   node dist-search/fastsearch.js --backup backup.json --grid 195,226,277,317,362 --prestiges 5-8
 *
 * What-if flags (neither edits the player's save):
 *   --mod elr=1.05            colleggtible what-if   (see MODS below)
 *   --add-artifact compass:legendary
 *                             artifact what-if       (see ADDED_ARTIFACTS below)
 *   --show-loadout            print the chosen ELR loadout without injecting anything
 */
// MUST be first: installs localStorage/window/document before any store module
// whose top-level state() reads them (lib's eids store throws at import without it).
import { persistLocalStorage } from './node-shims';

import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
setActivePinia(createPinia());

import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { availableParallelism, homedir, totalmem } from 'node:os';
import { join } from 'node:path';
import { runSiteSearch, type SiteKind, type SiteRunOptions } from './siteRun';
import { useChainSearchStore } from '@/stores/chainSearch';
import { countBanded, formatBands, parseBands, suggestBands, SUGGESTION_CHAIN_BUDGET } from '@/search/exhaustive';
import { installFileIndexedDb } from './node-idb';
import { CHECKPOINT_DIR, planOutDir, readRunRecord, writeRunRecord, type RunStatus } from './outDir';
import {
  bandCheckLines, checkSendAllowed, chooseEffort, cleanNickname, fitPreset, readOfflineSubmission, runSignature,
  suggestDeadlineChain, SUBMISSION_FILE, type SuggestedChain,
} from '@/search/offline';
import { eggDayYearOf } from '@/lib/eggDay';
import { sentence } from '@/utils/errors';
import type { FullSweep } from './siteRun';
import { parseChainText, parseStopBox } from '@/search/deadline';
import { nextEggDayYear } from '@/lib/eggDay';

import { requestFirstContact, resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { resetAllStores } from '@/lib/modes/reset';
import { getSimulationContext, createBaseEngineState } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { getThresholdForTE } from '@/lib/truthEggs';
import { countUnavailable, describeAvailability, isConstrained, nextAvailable,
         type Availability } from '@/search/availability';
import { meetsAll, usableMilestones, type LegArrival, type Milestone } from '@/search/milestones';
import { createChainEvaluator } from '@/search/chain';
import { CONTINUE_MAX_SECONDS, CONTINUE_PIN_MAX_SECONDS, CONTINUE_WARN_SECONDS, LAST_DATEABLE_SECONDS, integrityWaitSeconds } from '@/search/leg';
import { INTEGRITY_BLOCK_SECONDS, INTEGRITY_WARN_SECONDS, describeDuration, integrityMessage, longContinueMessage } from '@/search/rules';
import { describeTimeOff, timeOffWindows, usableTimeOff, type TimeOffDates } from '@/search/timeOff';
import { describeSaveAge, siloSeconds } from '@/lib/saveAge';
import { runChainSearch, type CacheEntry, type EvaluateBatch } from '@/search/driver';
import { findStartingChain } from '@/search/coarse';
import { EFFORT, EFFORT_ORDER, estimateChains } from '@/search/effort';
import { splitByPrefix, workersForBatch } from '@/search/batch';
import { exhaustiveChains } from '@/search/exhaustive';
import { buildChainsCsv, describeVirtueInventory } from '@/search/csv';
import type { ChainResult, EffortTier, SearchInputs, TimeOffWindow } from '@/search/types';
import {
  runUntilShift,
  deriveNextStartState,
  runContinueCurrent,
  runAscensionFromC3Variant,
} from '@/auto/ascension';
import { runC3Variants } from '@/auto/shifts/c3';
import { pickVariant, type VariantKey, type VariantResult } from '@/stores/autoPlanner';
import { useActionsStore } from '@/stores/actions';
import { useInitialStateStore } from '@/stores/initialState';
import { useVirtueStore } from '@/stores/virtue';
import { getArtifact, getArtifactLoadoutFromBackup, getOptimalEarningsSet, getOptimalELRSet } from '@/lib/artifacts';
import { allPossibleTiers } from 'lib/artifacts/data';
import { ei } from 'lib/proto';
import type { AscensionSummary } from '@/auto/types';
import type { VirtueEgg } from '@/types';

// Mirrors useAscensionGenerator's own constant: below this starting TE a Tier 13
// unlock can't realistically land inside one build phase, so those variants are
// skipped outright rather than simulated and thrown away.
const TIER_13_MIN_STARTING_TE = 190;

// Backup egg enum (50..54) -> EngineState's egg name, same table the generator
// keeps as VIRTUE_EGGS_MAP.
const VIRTUE_EGGS_MAP: Record<number, VirtueEgg> = {
  50: 'curiosity',
  51: 'integrity',
  52: 'humility',
  53: 'resilience',
  54: 'kindness',
};

// ---------------------------------------------------------------- arg parsing
function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const has = (name: string) => process.argv.includes('--' + name);

/** "195" | "225-231" | "270-290:2" | "312,316,320" -> number[] */
function parseGroup(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d+)-(\d+)(?::(\d+))?$/);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      const s = +(m[3] ?? 1);
      for (let v = a; v <= b; v += s) out.add(v);
    } else if (part.trim()) {
      out.add(+part);
    }
  }
  return [...out].sort((x, y) => x - y);
}

// ------------------------------------------- synthetic artifact injection
/**
 * `--add-artifact "compass:legendary"` answers "what if I owned ONE more artifact?"
 * WITHOUT editing the player's save.
 *
 * SYNTAX (positional, colon-separated, case-insensitive):
 *
 *     family[:rarity[:tier[:count]]]
 *
 *   family  a family id, a family name, or any unambiguous substring of either -
 *           "compass", "interstellar-compass", "quantum metronome", "gusset".
 *           Ambiguous or unknown tokens are a hard error listing the candidates.
 *   rarity  common | rare | epic | legendary   (or c / r / e / l, or 0..3)
 *           default: legendary
 *   tier    1..4                               default: 4
 *   count   how many copies to add             default: 1
 *
 * Repeatable and/or comma-separated - these are equivalent:
 *     --add-artifact "compass:legendary:4" --add-artifact "gusset:epic:2"
 *     --add-artifact "compass:legendary:4,gusset:epic:2"
 *
 * The two what-ifs this was built for (identifiers verified against
 * wasmegg/_common/eiafx/eiafx-data.json, NOT guessed):
 *
 *   main account   --add-artifact "compass:legendary"
 *                  T4L "Clairvoyant interstellar compass", family interstellar-compass,
 *                  afx name 27 / level 3 / rarity 3, +50% shipping rate, 2 stone slots,
 *                  planner artifact id `interstellar-compass-4-3`
 *
 *   alt account    --add-artifact "metronome:legendary"
 *                  T4L "Reggference quantum metronome", family quantum-metronome,
 *                  afx name 24 / level 3 / rarity 3, +35% egg laying rate, 3 stone slots,
 *                  planner artifact id `quantum-metronome-4-3`
 *
 * WHY IT GOES IN THE INVENTORY, NOT THE EQUIPPED SLOTS. `getOptimalELRSet`
 * (src/lib/artifacts/virtue.ts) searches `new Inventory(backup.artifactsDb, { virtue: true })`,
 * which reads `backup.artifactsDb.virtueAfxDb.inventoryItems` - the OWNED list. Appending a
 * row there is exactly "the player owns one more of these", and the optimizer stays free to
 * pick it or ignore it. `activeArtifacts.slots` is deliberately NOT touched, so
 * `getArtifactLoadoutFromBackup` (the currently-EQUIPPED set) is unchanged and we never
 * fake having the thing equipped. An injected artifact that does not get picked is a real
 * answer, which is why the chosen loadout is printed at startup (see reportChosenLoadout).
 *
 * With no --add-artifact flag nothing here runs and no extra output is produced.
 */
type InjectedArtifact = {
  request: string;
  familyId: string;
  tierId: string;
  tierName: string;
  artifactId: string; // planner id, `${familyId}-${tierNumber}-${rarity}`
  afxName: number;
  afxLevel: number;
  rarity: number;
  tierNumber: number;
  effect: string;
  slots: number;
  count: number;
};

const RARITY_TOKENS: Record<string, number> = {
  c: 0, common: 0, '0': 0,
  r: 1, rare: 1, '1': 1,
  e: 2, epic: 2, '2': 2,
  l: 3, legendary: 3, '3': 3,
};
const RARITY_CODE = ['C', 'R', 'E', 'L'];
const RARITY_WORD = ['common', 'rare', 'epic', 'legendary'];

/** Every occurrence of a repeatable flag, in command-line order. */
function argAll(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === '--' + name) out.push(process.argv[i + 1]);
  }
  return out;
}

const normToken = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Resolve one "family[:rarity[:tier[:count]]]" token against the real artifact data. */
function parseAddArtifact(spec: string): InjectedArtifact {
  const parts = spec.split(':').map(s => s.trim());
  const familyToken = normToken(parts[0] ?? '');
  if (!familyToken) throw new Error('--add-artifact: empty family in "' + spec + '"');

  // Artifacts AND stones. Stones are not equippable on their own, but they are what
  // getOptimalELRSet sockets into the artifacts it picks, and a missing stone is a real
  // ceiling: the alt owns NO Brilliant (level 2) tachyon stones at all, only Regular x8
  // and Eggsquisite x2, and tachyon is the egg-laying-rate stone. Ingredients stay out -
  // nothing equips or sockets them.
  //
  // Stones have no rarities (has_rarities is false on every tier) and top out at
  // afx_level 2, i.e. what the game calls T3. There is no T4 stone, so "all stones at
  // max" means level 2, and asking for a higher tier is rejected below rather than
  // silently rounded down.
  //
  // Families are keyed by family.afx_id, NOT family.id, because family.id is not actually
  // constant across a family's own tiers: the gusset's T1 reports `ornate-gusset` while its
  // T2-T4 report `gusset` (this is why virtue.ts builds ids from the TIER's props.family.id).
  // afx_id and family.name were both verified constant per family in eiafx-data.json.
  const artifactTiers = allPossibleTiers.filter(
    t => t.afx_type === ei.ArtifactSpec.Type.ARTIFACT || t.afx_type === ei.ArtifactSpec.Type.STONE
  );
  const families = new Map<number, { afxId: number; name: string; ids: string[] }>();
  for (const t of artifactTiers) {
    let f = families.get(t.family.afx_id);
    if (!f) {
      f = { afxId: t.family.afx_id, name: t.family.name, ids: [] };
      families.set(t.family.afx_id, f);
    }
    if (!f.ids.includes(t.family.id)) f.ids.push(t.family.id);
  }

  const all = [...families.values()];
  const keys = (f: { name: string; ids: string[] }) => [normToken(f.name), ...f.ids.map(normToken)];
  const exact = all.filter(f => keys(f).includes(familyToken));
  const fuzzy = all.filter(f => keys(f).some(k => k.includes(familyToken)));
  const matches = exact.length ? exact : fuzzy;
  if (matches.length !== 1) {
    throw new Error(
      '--add-artifact: family "' + parts[0] + '" ' +
      (matches.length ? 'is ambiguous (' + matches.map(f => f.ids[0]).join(', ') + ')' : 'is unknown') +
      '. Known families: ' + all.map(f => f.ids[0]).sort().join(', ')
    );
  }
  const family = matches[0];

  const rarityToken = (parts[1] ?? 'legendary').toLowerCase();
  const rarity = RARITY_TOKENS[rarityToken];
  if (rarity === undefined) {
    throw new Error('--add-artifact: bad rarity "' + parts[1] + '" in "' + spec +
      '" (use common|rare|epic|legendary, c|r|e|l, or 0..3)');
  }

  const tierNumber = parts[2] ? +parts[2] : 4;
  if (!Number.isInteger(tierNumber) || tierNumber < 1 || tierNumber > 4) {
    throw new Error('--add-artifact: bad tier "' + parts[2] + '" in "' + spec + '" (use 1..4)');
  }

  const count = parts[3] ? +parts[3] : 1;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('--add-artifact: bad count "' + parts[3] + '" in "' + spec + '" (use a positive integer)');
  }

  const tier = artifactTiers.find(t => t.family.afx_id === family.afxId && t.tier_number === tierNumber);
  if (!tier) {
    throw new Error('--add-artifact: ' + family.ids[0] + ' has no tier ' + tierNumber);
  }

  // A rarity the tier cannot have would make InventoryItem.stoneSlotCount/effectDelta throw
  // deep inside the optimizer ("the impossible happened"), so reject it here with a real message.
  const effect = (tier.effects ?? []).find(e => e.afx_rarity === rarity);
  if (!effect) {
    const possible = (tier.effects ?? []).map(e => RARITY_WORD[e.afx_rarity]).join(', ');
    throw new Error('--add-artifact: T' + tierNumber + ' ' + family.ids[0] + ' cannot be ' +
      RARITY_WORD[rarity] + ' (possible rarities: ' + (possible || 'none') + ')');
  }

  return {
    request: spec,
    familyId: tier.family.id,
    tierId: tier.id,
    tierName: tier.name,
    // Must be built from the TIER's own family.id - the same expression virtue.ts and
    // src/lib/artifacts/data.ts use - or the gusset's id would come out wrong.
    artifactId: tier.family.id + '-' + tierNumber + '-' + rarity,
    afxName: tier.afx_id,
    afxLevel: tier.afx_level,
    rarity,
    tierNumber,
    effect: effect.effect,
    slots: effect.slots || 0,
    count,
  };
}

/** All --add-artifact requests, parsed once. Empty unless the flag was passed. */
const ADDED_ARTIFACTS: InjectedArtifact[] = argAll('add-artifact')
  .flatMap(v => v.split(','))
  .map(s => s.trim())
  .filter(Boolean)
  .map(parseAddArtifact);

/** Planner artifact ids that were injected, for highlighting in the loadout printout. */
const ADDED_ARTIFACT_IDS = new Set(ADDED_ARTIFACTS.map(a => a.artifactId));

/**
 * Append the requested artifacts to the parsed backup's virtue inventory. Called on the
 * raw parsed object BEFORE markRaw/loadAndSyncBackup, so every consumer of
 * `initialStateStore.rawBackup` - getArtifactLoadoutFromBackup, getOptimalEarningsSet and
 * getOptimalELRSet alike - sees the same object.
 */
function injectSyntheticArtifacts(backup: any): void {
  if (!ADDED_ARTIFACTS.length) return;
  const db = backup?.artifactsDb?.virtueAfxDb;
  if (!db) throw new Error('--add-artifact: backup has no artifactsDb.virtueAfxDb to inject into');
  if (!db.inventoryItems) db.inventoryItems = [];

  ADDED_ARTIFACTS.forEach((a, i) => {
    db.inventoryItems.push({
      // Real itemIds in a backup are protobuf Longs ({low,high,unsigned}) in the low tens of
      // thousands. A plain number far above that range can never collide with one, and can
      // never be `===` an activeArtifacts slot's Long object either, so injecting cannot
      // change which artifacts are reported as currently equipped.
      itemId: 900000000 + i,
      artifact: { spec: { name: a.afxName, level: a.afxLevel, rarity: a.rarity, egg: 1000 } },
      quantity: a.count,
      serverId: '',
    });
    console.log(
      'injected artifact: ' + a.count + 'x T' + a.tierNumber + RARITY_CODE[a.rarity] + ' ' + a.tierName +
      ' (' + a.effect + ', ' + a.slots + ' stone slot' + (a.slots === 1 ? '' : 's') + ')' +
      '  [afx name=' + a.afxName + ' level=' + a.afxLevel + ' rarity=' + a.rarity +
      ', planner id ' + a.artifactId + ']  <- from "' + a.request + '"'
    );
  });
}

/** One line per occupied slot of an ELR loadout, marking anything that came from --add-artifact. */
function describeLoadout(set: any[]): string[] {
  const lines: string[] = [];
  for (const slot of set || []) {
    if (!slot?.artifactId) continue;
    const a = getArtifact(slot.artifactId);
    const stones = (slot.stones || []).filter(Boolean);
    lines.push(
      '    ' + (a ? a.label : slot.artifactId).padEnd(34) +
      (a ? a.effect : '').padEnd(26) +
      (stones.length ? 'stones: ' + stones.join(', ') : 'no stones') +
      (ADDED_ARTIFACT_IDS.has(slot.artifactId) ? '   <== INJECTED, USED' : '')
    );
  }
  if (!lines.length) lines.push('    (empty loadout)');
  return lines;
}

/**
 * Print the ELR loadout the optimizer actually picks, so an injected artifact that is NOT
 * worth equipping is visible rather than silent. Two probes because the sim re-solves the
 * loadout at several points with different assumptions: the "continue current ascension"
 * leg uses the account's real habs/vehicles, while H1 (src/auto/shifts/h1.ts) assumes maxed
 * habs and vehicles. Both use the account's CURRENT research levels, so these are
 * representative probes, not a transcript of every in-sim re-solve.
 */
function reportChosenLoadout(): void {
  const iss: any = useInitialStateStore();
  const raw = iss.rawBackup;
  if (!raw) {
    console.log('chosen ELR loadout: unavailable (no raw backup)');
    return;
  }
  const farmState: any = iss.currentFarmState;
  const probes: [string, boolean][] = [
    ['current habs/vehicles (the "continue" leg)', false],
    ['max habs/vehicles (the H1 leg near ascension end)', true],
  ];
  const usedIn = new Map<string, string[]>();
  for (const [label, assumeMax] of probes) {
    const set = getOptimalELRSet(raw, {
      commonResearch: farmState?.commonResearches,
      epicResearchLevels: iss.epicResearchLevels,
      colleggtibleModifiers: iss.colleggtibleModifiers,
      assumeMaxHabsVehicles: assumeMax,
    });
    console.log('chosen ELR loadout @ ' + label + ':');
    for (const line of describeLoadout(set)) console.log(line);
    for (const slot of set || []) {
      if (!slot?.artifactId || !ADDED_ARTIFACT_IDS.has(slot.artifactId)) continue;
      if (!usedIn.has(slot.artifactId)) usedIn.set(slot.artifactId, []);
      usedIn.get(slot.artifactId)!.push(label);
    }
  }
  // Say the quiet part out loud: an injected artifact the optimizer declines to equip is a
  // legitimate answer to the what-if, and must not look like the flag silently did nothing.
  for (const a of ADDED_ARTIFACTS) {
    const where = usedIn.get(a.artifactId);
    console.log('verdict: ' + a.artifactId + ' was ' +
      (where ? 'EQUIPPED in ' + where.length + '/' + probes.length + ' probe(s) - ' + where.join('; ')
             : 'NOT equipped in either probe (the player already owns something at least as good; ' +
               'the plan below is therefore unchanged by this injection)'));
  }
}

/** Every flag, grouped the way the browser panel groups them, so the two can be read side by
 *  side. Printed by --help; nothing else runs. */
function printHelp(): void {
  console.log(`
fastsearch - the Ascension Planner's searches, headless.

  Finds the fastest route of ascension checkpoints to a Truth Egg target, or the highest TE you can
  reach by a date, scoring every candidate with the planner's own simulator. Runs offline with
  --backup. The site's three searches run through the site's own code, so a result here and one in
  the browser, from the same save and settings, are the same result, and sending it (--submit, or
  later with \`submit --from\`) is the same send.

ACCOUNT  (one is required)
  --backup FILE.json        A saved backup. Nothing is fetched.
  --player-id EI...         Fetch the backup from the game's API.
  --save-backup FILE        With --player-id, write the fetched backup for offline reuse.

THE SITE'S SEARCHES  (Auto Planner > Fastest route and Highest TE by a date)
  --effort TIER             Smart search: homes in from a starting route. fast, exact or thorough
                            (the slider's Fast / Exact / Very high; quick|normal work too). Default
                            exact. 'balanced' was retired on the site (it ran the same steps as
                            Exact) and runs Exact here, with a note. Needs --seed or --find-seed.
  --bands "a-b:s; c-d:s"    Full sweep: prices every route with one checkpoint in each band, as
                            the Full sweep's box (4 bands = 5 ascensions). A band that reads wrong
                            (reversed, below your TE, out of order...) is explained with fixed text.
  --suggest [N]             Full sweep over the space Suggest a space picks for your TE: N
                            ascensions (default the usual 6, working down), with the count one lower
                            and one higher queued at half the size, as the site does.
  --preset ID               Full sweep of a Science preset (M1-M4, F2, F4, F5, E7-E9), its bands
                            fitted to your save's TE as the Science tab fits them, filed under the
                            preset's name. Says so and stops when the preset does not fit your TE.
                            These fill gaps in the shared data; they are not tuned to find your route.
  --by-date "YYYY-MM-DD HH:MM"
                            Highest TE by a date, in --timezone.
  --egg-day [YEAR]          The same, by Egg Day: 14 July, 9:00 AM Pacific, the next one by default.

  Smart search
  --seed "195 219 248"      Starting route; the final target is added for you.
  --find-seed               Find a starting route first (the panel's "Find a starting chain for me").
  --min-prestiges N         Fewest ascensions, counting the last.     (default 5)
  --max-prestiges N         Most ascensions.                          (default 8)
  --pin N                   Hold the first N checkpoints fixed.
  --final TE                Final target.                             (default 490)

  Full sweep
  --min-gap N               Checkpoints at least N TE apart.          (default 0)
  --neighbours              With --bands: also queue the count one lower and one higher (suggested,
                            half size). --suggest does this itself; --no-neighbours turns it off.
  --budget CHAINS           --suggest's size ceiling.                 (default 75,000)
  --widen [N]               When the best sits on a band's edge, widen that band and run again, up to
                            N times (default 3). Without it the warning prints the wider bands.
  --tag NAME                File the result under a Science sweep's name (e.g. M2), as the site does
                            for a sweep run from Science. Only for that sweep's own bands.

  Highest TE by a date  ("I'll set the stops", the site's only mode)
  --chain "a-b:s; c-d:s"    One box per chain, one band per stop before the last; repeat for several
                            chains ("1" for no early stop). Needs --last.
  --last lo-hi              Where to start looking for the last stop; it looks beyond if it must.
  --asc 3,4,5               Without --chain: suggest a chain for each count the way the panel's
                            Suggest a space does (default 4), with --last picked around your TE.
  --width TE --step N       How far either side of each suggested stop (default 10), and the step for
                            every stop after the first (default 2).
  --ascend-needed           Reach the last stop in time to ascend at it in your hours.
  (The retired "Pick them for me" still runs if you give --min-stops/--max-stops/--thoroughness/
  --last-hi/--step, to reproduce an old run.)

OFFLINE: FILES, CHECKPOINTS, SENDING LATER
  --out DIR                 Write DIR/run.csv.gz (the table the site uploads) and DIR/submission.json
                            (exactly what Share would send) and keep a checkpoint in DIR. A queue of
                            chains gets DIR/chain-K-Nasc/. Run the SAME command again after a kill,
                            a restart or Ctrl+C and it carries on: Smart search from its checkpoint,
                            the Full sweep replaying every chain it priced, By a date from its saved
                            routes. The first run pins its plan start in DIR, so the run is the same
                            one; a different command in the same DIR is refused.
  --fresh                   With --out: throw away DIR's checkpoint and start again.
  --dry-run                 Say what would run (spaces, chain counts, about how long) and stop.
  --plain-csv               With --out: also write run.csv, uncompressed.
  --no-submit-csv           With --out/--submit: leave the table out of the send.
  --jobs N                  Worker threads. Default: your cores minus one (this machine: see the
                            line printed at the start). Each worker holds roughly 0.1-0.25 GB of
                            simulator memory, and a long sweep keeps every priced chain in the main
                            process too: watch the 'rss' in the progress lines, and lift Node's heap
                            limit for a very big space with NODE_OPTIONS=--max-old-space-size=8192.

  fastsearch submit --from DIR [--collector URL] [--nickname NAME | --anonymous] [--dry-run] [--yes]
                            Send what --out left (DIR, or every chain-K-Nasc/ inside it): the same
                            summary POST and CSV upload the site does, with the run's own save time
                            and TE, so it is not filed as a what-if. --dry-run posts nothing and
                            says what would go. A result sent once is not sent again without --again.
                            It prints where it is sending and what first; to any collector that is
                            not on this machine (the build's own included) it stops, "Not sent. Add
                            --yes to send this to <url>.", unless you add --yes.

  Sending the result  (the site's Share / Find and submit)
  --submit                  Send it to the board when the search finishes (stopped early with
                            Ctrl+C, it still sends what it has, marked partial). Includes the CSV and
                            the re-checks of your earlier plans, which need the network.
  --nickname NAME           Credit a name (up to 40 characters). Anonymous without it. Also with --out.
  --collector URL           Where to send (default: the collector this build was made with).
  --yes                     Needed to send to any collector that is not localhost/127.0.0.1, with
                            --submit or \`submit\`. Without it the send is refused (non-zero exit,
                            before a search starts) and nothing leaves this machine.
  --state FILE              Where the account's owner code is kept between runs, so your sends
                            fold together and can be renamed later, as a browser keeps it.
                            (default ~/.config/autoautoap/cli-state.json). Send from one machine, or
                            copy this file with you, or each machine files as a new player.

  Ctrl+C stops a site search and keeps its best so far; Ctrl+C again quits at once. Without --out
  there are no checkpoints: a stopped run starts again from the top.

THIS SCRIPT'S OWN TOOLS  (not on the site; their own evaluator)
  --exhaustive --range lo:hi[:step] --prestiges lo-hi
                            Every route over one pool of values (the Full sweep's old "One range").
                            --prestiges defaults to 5-8; --yes goes past the 5000-chain cap.
  --stages "a;b,c;d-e"      Explicit candidates: one pick per group, in order.
  --grid a,b,c --prestiges 5-8
                            Every subset of a pool at those route lengths.
  --direct                  Run --effort on this evaluator instead of the site's, for the
                            what-ifs and diagnostics below.

WHEN YOU CAN PLAY  (changes which route wins, not just the display)
  Picking hours is the site's "Let me pick my hours": the egg shifts wait for them inside the
  simulation, and the farm keeps laying (TE keeps collecting) while it waits.
  --available-from H --available-to H
                            Hours you are around, in --timezone (the panel's "Plan around my schedule").
  --sleep-from H --sleep-until H
                            The same thing inverted.
  --available-days sat,sun  Only those days.                          (default every day)
  --no-hold-shifts          Legacy: the site no longer offers it. Shifts are not held, for reproducing
                            an old result only; refused with --submit and --out.
  --milestone "248@2027-06-01"
                            Be at that TE by the end of that day; repeatable.
  --time-off DATE[:DATE]    Days off the virtue farm, repeatable (2027-07-14, or 2027-08-01:2027-08-07).
                            The ascension in progress ends; coming back is a complete rebuild.
                            Not with --stages or --grid.

WHEN THE PLAN STARTS
  --start-date YYYY-MM-DD   (default today)
  --start-time HH:MM        (default the current hour)
  --timezone IANA           (default this machine's)
  --no-force-continue       Leg 1 does NOT default to finishing the ascension in progress. By
                            default it does, as on the site: taken outright when it finishes
                            within a week, kept up to six months unless a 1/2/3-sale fresh start is
                            strictly faster, dropped past six months. (--force-continue is accepted
                            and is the default.)

OUTPUT
  --jobs N                  Worker threads (site searches; default cores-1) or processes (this
                            script's tools; default 1).
  --csv FILE                Where the plain CSV of every route priced goes. Defaults to
                            fastsearch-<timestamp>.csv (without --out); --no-csv writes none. For the
                            tools, --out FILE is the same thing.
  --top N                   Runners-up to print.                      (default 10)

WHAT-IF  (neither edits the save; never with --submit)
  --add-artifact compass:legendary
                            Pretend you own one more artifact.
  --mod elr=1.05            Scale a colleggtible dimension. --direct, --stages, --grid or --exhaustive.
  --show-loadout            Print the delivery set the simulator picks (with --stages or --grid).

DIAGNOSTICS  (for working on the search itself; --direct, --stages or --grid)
  --integrity-only          Print how long a fresh ascension sits on Integrity, in seconds, and stop.
  --debug                   Verbose tracing.
  --dump-state              Print the parsed farm state and stop.
  --prune                   Branch and bound over --stages / --grid, cutting routes a bound says
                            cannot win. For checking the bound against an unpruned run.
  --max-elr N               The bound's peak delivery, q/hr.          (default 11.585)
  --continue-pin-days N     Continue is taken without comparison under N days. (default 7)
  --continue-max-days N     Continue is not a candidate past N days.  (default 183)
  --allow-stall             Run an account whose first fresh ascension stalls on Integrity for over
                            a week (refused by default, as on the site).
  --leg-variants / --leg1-variants
                            Print every candidate for each leg / the first leg as JSON lines. Use
                            --no-force-continue, or continue is the only first-leg candidate.
  --override-ascension N --override-days D --override-hours H
                            Force one leg's length instead of simulating it.
  --reactive-backup         Hand the backup to Pinia reactively (much slower).

EXAMPLES
  node dist-search/fastsearch.js --backup me.json --effort thorough --find-seed --jobs 12
  node dist-search/fastsearch.js --backup me.json --bands "185-200:5; 215-245:10; 260-300:10" --out run1
  node dist-search/fastsearch.js --backup me.json --preset F4 --out f4        # fitted to your TE
  node dist-search/fastsearch.js --backup me.json --suggest 5 --widen --out sweep
  node dist-search/fastsearch.js --backup me.json --egg-day --chain "138-176:1; 167-187:3" --last 200-240 --out eggday
  node dist-search/fastsearch.js submit --from run1 --nickname Me --yes       # online, later
  node dist-search/fastsearch.js --backup me.json --exhaustive --range 185:390:15 --prestiges 6-7 --jobs 12

OFFLINE BRUTE FORCE, IN SHORT
  1. Get the save's JSON onto the offline PC (once per save).
  2. Run with --out DIR, the same command again after any interruption.
  3. Copy DIR back to an online machine and run: fastsearch submit --from DIR --yes
`);
}

// ------------------------------------------------------------------ bootstrap
async function loadPlayer(): Promise<void> {
  const backupFile = arg('backup');
  const playerId = arg('player-id');
  let backup: any;

  if (backupFile) {
    backup = JSON.parse(readFileSync(backupFile, 'utf8'));
  } else if (playerId) {
    const data = await requestFirstContact(playerId);
    if (!data.backup) throw new Error('no backup returned for ' + playerId);
    backup = data.backup;
    if (has('save-backup')) {
      writeFileSync(arg('save-backup', 'backup.json')!, JSON.stringify(backup));
    }
  } else {
    throw new Error('need --player-id EI... or --backup file.json');
  }

  // "What if I owned one more artifact?" - append to the parsed backup's OWNED inventory
  // before anything reads it. No-op (and silent) without --add-artifact.
  injectSyntheticArtifacts(backup);

  resolveColleggtibleContracts(backup);

  // The backup is handed to Pinia, which wraps it in a reactive Proxy. The
  // simulator reads the artifact inventory out of it constantly (getOptimalELRSet
  // -> evaluateStones walks every stone on every call), so each of those reads
  // pays for a proxy trap. A CPU profile put get/createReactiveObject/isRef at
  // ~14% of total runtime. Nothing here is reactive - there is no UI - so mark it
  // raw and Vue leaves it as a plain object.
  // --reactive-backup restores the old behaviour so the two can be timed head to head.
  if (!has('reactive-backup')) backup = markRaw(backup);

  // This mirrors initPlanFuture (src/lib/modes/planFuture.ts) step for step,
  // because that is what the Auto Planner tab actually runs - NOT App.vue's
  // generic 'default' load. The differences matter:
  //   - mode 'plan_next', not 'default'
  //   - rollUpPendingTE straight after the load, so pending TE is claimed
  //     (without it the harness starts from 159 TE instead of 174)
  //   - the virtue store is explicitly reset to now / zero bank / curiosity
  //   - the start action is stripped of any farm state
  // Loading the 'default' way instead leaves the farm and soul-egg state in a
  // shape the simulator cannot make progress from, and every leg runs for
  // decades of simulated time before giving up.
  await resetAllStores();
  loadAndSyncBackup(playerId ?? 'file', backup, 'plan_next');
  rollUpPendingTE();

  const virtueStore = useVirtueStore();
  virtueStore.resetToCurrentDateTime();
  virtueStore.setBankValue(0);
  virtueStore.setCurrentEgg('curiosity');

  const actionsStore = useActionsStore();
  const startAction: any = actionsStore.getStartAction();
  if (startAction) {
    startAction.payload.initialFarmState = undefined;
    startAction.payload.isQuickContinue = false;
    startAction.payload.initialEgg = 'curiosity';
  }

  const ctx = simContext();
  const base = createBaseEngineState(null);
  await actionsStore.setInitialSnapshot(computeSnapshot(base, ctx));
}

// -------------------------------------------------------------- one ascension
// --------------------------------------------------- colleggtible what-if
// `--mod elr=1.05,shippingCap=1.05` multiplies the colleggtible modifier for those
// dimensions. Colleggtibles enter the simulation at exactly one point -
// `context.colleggtibleModifiers` (engine/adapter.ts) - so scaling it here is
// equivalent to owning a new colleggtible granting that bonus, WITHOUT editing the
// player's save. Dimensions: earnings, awayEarnings, ihr, elr, shippingCap, habCap,
// vehicleCost, habCost, researchCost. Cost dimensions are multipliers where LOWER is
// better (0.95 = 5% cheaper).
const MODS: Record<string, number> = {};
for (const kv of (arg('mod', '') || '').split(',')) {
  if (!kv) continue;
  const [k, v] = kv.split('=');
  if (!k || !v || !isFinite(+v)) throw new Error('bad --mod entry: ' + kv);
  MODS[k.trim()] = +v;
}
function simContext(): any {
  const c: any = getSimulationContext();
  if (Object.keys(MODS).length) {
    const base = c.colleggtibleModifiers || {};
    const next: any = { ...base };
    for (const [k, f] of Object.entries(MODS)) {
      if (!(k in next)) throw new Error('unknown --mod dimension: ' + k);
      next[k] = (next[k] ?? 1) * f;
    }
    c.colleggtibleModifiers = next;
  }
  return c;
}

interface LegResult {
  summary: AscensionSummary;
  key: VariantKey;
  nextState: any;
  // Absolute instants of this leg's twelve shifts, for availability reporting.
  // NOT Action.timestamp: runAscension sets that only on the synthetic
  // start action (and in ms), so the real clock is startTime + endState.lastStepTime,
  // the same expression useResearchViews derives absolute time from.
  shiftTimes: number[];
}

function shiftInstants(actions: any[], legStart: number): number[] {
  const out: number[] = [];
  for (const a of actions ?? []) {
    if (a?.type !== 'shift') continue;
    const step = a?.endState?.lastStepTime;
    if (typeof step === 'number' && Number.isFinite(step)) out.push(legStart + step);
  }
  return out;
}

/**
 * Simulate one ascension and return the variant the app itself would pick.
 *
 * `allowContinue` is only true for A1: "continue current ascension" is a claim
 * about the farm as it stands right now, so it has no meaning further down a
 * chain, and the app only offers it there for the same reason.
 */
/** `--continue-pin-days N` / `--continue-max-days N`: the continue rule to run under, for comparing
 *  one rule with another. Defaults are the shipped rule in src/search/leg.ts. */
const PIN_SECONDS = arg('continue-pin-days') !== undefined ? Number(arg('continue-pin-days')) * 86400 : CONTINUE_PIN_MAX_SECONDS;
if (!Number.isFinite(PIN_SECONDS) || PIN_SECONDS < 0) throw new Error('--continue-pin-days must be a number of days');
const MAX_CONTINUE_SECONDS = arg('continue-max-days') !== undefined ? Number(arg('continue-max-days')) * 86400 : CONTINUE_MAX_SECONDS;
if (!Number.isFinite(MAX_CONTINUE_SECONDS) || MAX_CONTINUE_SECONDS < 0) throw new Error('--continue-max-days must be a number of days');

/** Leg 1 continues the ascension in progress (the continue rule above). ON by default, as on the
 *  site (chainSearch.ts `forceContinue`); `--no-force-continue` turns it off. `--force-continue` is
 *  still accepted, and is now what happens anyway. */
const FORCE_CONTINUE = !has('no-force-continue');

/** Set once in main() from --time-off; read by planInputs and the CSV header. */
let TIME_OFF_DATES: TimeOffDates[] = [];
let TIME_OFF_WINDOWS: TimeOffWindow[] = [];

/** `runLeg`'s no-farm notice, printed once per process. */
let warnedNoContinue = false;

function runLeg(
  baseState: any,
  startTime: number,
  targetTE: number,
  allowContinue: boolean,
  startTE: number,
  idx: number,
  endOverride?: number
): LegResult | null {
  // An end-time override supersedes the TE goal entirely: runAscensionFromC3Variant
  // and runContinueCurrent only consult targetEndTime when targetTE is absent, so
  // leaving the TE goal set here would silently ignore the pin (the same trap the
  // app documents in useAscensionGenerator).
  const goalTE = endOverride !== undefined ? undefined : targetTE;
  const ctx = simContext();
  ctx.ascensionStartTime = startTime;
  ctx.planStartOffset = 0;

  // --force-continue: A1 is the ascension you are already part-way through, so
  // "prestige now" means throwing that progress away. The planner will sometimes
  // pick it anyway when the maths narrowly favours it; this pins A1 to Continue
  // Current Ascension instead.
  //
  // It is also the single cheapest speedup available. Every build variant costs a
  // full C3 (runC3Variants is the CPU hotspot - evaluateStones inside it is 20% of
  // runtime), and this skips all of them for A1, simulating one variant instead of
  // up to six.
  // THE CONTINUE RULE, the same as src/search/leg.ts (see CONTINUE_PIN_MAX_SECONDS there): pinned
  // under a week; compared with the fresh starts up to six months, continue winning unless a fresh
  // start is strictly better; never a candidate past six months.
  const byDeadline = endOverride !== undefined;
  const asLeg = (v: any, key: VariantKey): LegResult => ({
    summary: v.summary,
    key,
    nextState: deriveNextStartState(v.summary, createBaseEngineState(null)),
    shiftTimes: shiftInstants(v.actions, startTime),
  });
  let cont: any = allowContinue ? buildContinueVariant(baseState, startTime, goalTE as number, idx, endOverride) : null;
  if (cont && !(cont.summary.totalDurationSeconds <= MAX_CONTINUE_SECONDS)) cont = null;
  if (allowContinue && FORCE_CONTINUE) {
    if (cont && !byDeadline && cont.summary.totalDurationSeconds <= PIN_SECONDS) return asLeg(cont, 'continue' as VariantKey);
    // Usually not a fault: a save whose last sync was on the home farm or a contract has no
    // virtue ascension to finish, so leg 1 is a fresh one -- what the player would do. Warned once
    // per process rather than per chain, and worded so it does not read as an error.
    if (!cont && !warnedNoContinue) {
      warnedNoContinue = true;
      console.warn(
        '  note: no current virtue ascension to finish within six months (the save is on the home farm or a ' +
          'contract, or its farm is too bare), so leg 1 is a fresh virtue ascension.'
      );
    }
  }

  // Single C1->R1 precompute shared by every build variant, exactly as the app
  // does it - K3..H2 is the expensive part and must not be repeated per variant.
  const pre = runUntilShift(baseState, ctx, 'C3');
  const preC3 = { actions: pre.actions, state: pre.state, elapsedSeconds: pre.elapsedSeconds };

  const c3 = runC3Variants(pre.state, ctx, 3, startTE < TIER_13_MIN_STARTING_TE);
  let surviving = c3.filter(x => !x.impossible);
  if (byDeadline) {
    // K3's mandatory wait to buildPhaseEnd cannot be truncated, so a variant whose
    // build phase ends after the deadline is not merely slower - it is unevaluable.
    surviving = surviving.filter((v: any) => v.buildPhaseEnd <= endOverride!);
  }
  const variants: Record<string, VariantResult> = {};
  for (const v of surviving) {
    const key = (v.attemptTier13Unlock
      ? v.saleCount + '-sale-tier13'
      : v.saleCount + '-sale') as VariantKey;
    variants[key] = runAscensionFromC3Variant(
      baseState, preC3, v, ctx, startTime, 'asc_' + idx, goalTE, endOverride
    );
  }
  if (!Object.keys(variants).length && !cont) return null;

  // --leg1-variants: every candidate for the first leg, not just the winner, so "would continuing
  // have been faster than a 1/2/3-sale fresh start?" has an answer. One JSON line per leg-1 target.
  if ((idx === 0 && has('leg1-variants')) || has('leg-variants')) {
    const d = (s: number) => +(s / 86400).toFixed(3);
    const all: Record<string, any> = cont ? { ...variants, continue: cont } : variants;
    console.log((idx === 0 ? 'LEG1_VARIANTS ' : 'LEG_VARIANTS ') + JSON.stringify({
      leg: idx + 1,
      startTE,
      target: goalTE,
      variants: Object.fromEntries(Object.entries(all).map(([k, v]: [string, any]) => [k, {
        days: d(v.summary.totalDurationSeconds),
        buildDays: d(v.summary.buildDurationSeconds ?? 0),
        endTE: v.summary.endTE,
        peakQph: +((v.summary.maxELR * 3600) / 1e15).toFixed(3),
      }])),
    }));
  }

  const freshKeys = Object.keys(variants);
  const freshBest = freshKeys.length ? pickVariant(variants as any, undefined, byDeadline) : null;
  if (cont) {
    const contWins = !freshBest
      ? true
      : FORCE_CONTINUE
        ? byDeadline
          ? cont.summary.endTE >= freshBest.summary.endTE
          : cont.summary.totalDurationSeconds <= freshBest.summary.totalDurationSeconds
        : pickVariant({ ...variants, continue: cont } as any, undefined, byDeadline) === cont;
    if (contWins) return asLeg(cont, 'continue' as VariantKey);
  }
  if (!freshBest) return null;
  const entry = Object.entries(variants).find(([, v]) => v === freshBest);
  return asLeg(freshBest, (entry ? entry[0] : '?') as VariantKey);
}

/** A1-only "continue current ascension" variant, mirroring the generator's setup. */
function buildContinueVariant(
  baseState: any,
  startTime: number,
  targetTE: number | undefined,
  idx: number,
  endOverride?: number
): VariantResult | null {
  const initialStateStore = useInitialStateStore();
  const farmState: any = initialStateStore.currentFarmState;
  const raw = initialStateStore.rawBackup;
  if (!farmState || !raw) return null;

  const rawLoadout = getArtifactLoadoutFromBackup(raw);
  const optimalEarnings = getOptimalEarningsSet(raw);
  // The ELR set is recomputed rather than reusing the equipped (earnings) loadout.
  // Filing the earnings set under artifactSets.elr was the bug that made the
  // "continue" variant report 1.580q/hr instead of 3.574q/hr.
  const elr =
    getOptimalELRSet(raw, {
      commonResearch: farmState.commonResearches,
      epicResearchLevels: initialStateStore.epicResearchLevels,
      colleggtibleModifiers: initialStateStore.colleggtibleModifiers,
      currentSet: rawLoadout,
      assumeMaxHabsVehicles: false,
    }) ?? rawLoadout;

  const state: any = {
    ...JSON.parse(JSON.stringify(baseState)),
    // eggType is the raw backup enum (50..54); EngineState wants the name.
    // Passing the number through left currentEgg as 53 and quietly corrupted
    // every rate calculation downstream.
    currentEgg: VIRTUE_EGGS_MAP[farmState.eggType] ?? 'curiosity',
    researchLevels: { ...farmState.commonResearches },
    // EngineState's field is habIds, NOT habs. Writing `habs` here was ignored,
    // so habIds fell back to [0,null,null,null] - a single starter hab. With no
    // capacity the farm can never afford research, and buyResearch recursed until
    // the stack blew on the third leg.
    habIds: farmState.habs || [0, null, null, null],
    vehicles: farmState.vehicles || [{ vehicleId: 0, trainLength: 1 }],
    siloCount: farmState.numSilos || 1,
    tankLevel: baseState.tankLevel,
    artifactLoadout: elr.map((s: any) => ({ artifactId: s.artifactId, stones: [...s.stones] })),
    activeArtifactSet: 'elr',
    artifactSets: {
      earnings: optimalEarnings ? JSON.parse(JSON.stringify(optimalEarnings)) : null,
      elr: JSON.parse(JSON.stringify(elr)),
    },
    fuelTankAmounts: { ...baseState.fuelTankAmounts },
    eggsDelivered: { ...baseState.eggsDelivered },
    teEarned: { ...baseState.teEarned },
    population: farmState.population || 0,
    lastStepTime: farmState.lastStepTime || 0,
    bankValue: farmState.cash || 0,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
  };

  const ctx = simContext();
  ctx.ascensionStartTime = startTime;
  ctx.planStartOffset = 0;
  const elrNow = computeSnapshot(state, ctx, { skipGrowth: true }).elr;
  if (!(elrNow > 0)) return null;
  return runContinueCurrent(state, ctx, startTime, elrNow, targetTE, 'asc_' + idx + '_continue', endOverride);
}

// -------------------------------------------------------- branch-and-bound
/**
 * Lower bound, in seconds, on the time still needed to climb from a per-egg TE
 * distribution to `targetTotal` total TE, assuming delivery never exceeds
 * `maxElr` eggs/second.
 *
 * WHY THIS IS SAFE. A prefix is never pruned because a sibling leaf was bad - it
 * is pruned because its own elapsed time is already measured, and even a
 * mathematically perfect completion cannot catch up. For prefix P, every leaf L
 * beneath it obeys total(L) >= elapsed(P) + thisBound. So if elapsed + bound
 * already loses to the incumbent, every leaf in that subtree loses, the best one
 * included. Nothing is lost.
 *
 * THE BOUND MUST UNDERESTIMATE. If it ever overstates the remaining time it
 * stops being a bound and starts being a heuristic that can discard the true
 * optimum. Two deliberate choices keep it conservative:
 *   - eggs already delivered toward the next threshold are subtracted, so the
 *     first TE on each egg is charged only for what is genuinely left;
 *   - TE is taken greedily from whichever egg is cheapest next, which is the
 *     cheapest distribution any real plan could possibly achieve.
 * Neither can make the answer larger than reality.
 *
 * The one remaining assumption is maxElr itself. If some leg can actually beat
 * it the bound is invalid, so runLeg's observed peak is checked against it and
 * the run warns loudly rather than silently returning a non-exhaustive answer.
 */
function minSecondsToReach(
  finalTE: Record<string, number>,
  delivered: Record<string, number>,
  targetTotal: number,
  maxElr: number
): number {
  const eggs = Object.keys(finalTE);
  const teIdx: Record<string, number> = { ...finalTE };
  const got: Record<string, number> = { ...delivered };
  let need = targetTotal - eggs.reduce((a, e) => a + teIdx[e], 0);
  if (need <= 0) return 0;

  let eggsNeeded = 0;
  while (need-- > 0) {
    let bestEgg = eggs[0];
    let bestCost = Infinity;
    for (const e of eggs) {
      const cost = Math.max(0, getThresholdForTE(teIdx[e] + 1) - (got[e] ?? 0));
      if (cost < bestCost) {
        bestCost = cost;
        bestEgg = e;
      }
    }
    eggsNeeded += bestCost;
    got[bestEgg] = getThresholdForTE(teIdx[bestEgg] + 1);
    teIdx[bestEgg]++;
  }
  return maxElr > 0 ? eggsNeeded / maxElr : 0;
}

// ----------------------------------------------------------------- the search
interface Row {
  chain: number[];
  seconds: number;
  legs: { key: string; te: number; dur: number; elr: number;
           bdur: number; bend: number; bsale: number; lastte: number;
           t13: number; se0: number; shift: number;
           // Schedule columns. `wait` is seconds this leg's prestige was delayed to
           // reach an available hour (charged); `nsh` is how many of the leg's twelve
           // shifts land outside the schedule (reported only - the simulator places
           // shifts itself and they are not moved).
           wait: number; nsh: number }[];
  pinDate?: string;
  pinTime?: string;
}

/**
 * Fan the run out over N child processes and merge their CSVs.
 *
 * Child processes rather than worker_threads: each child needs its own Pinia
 * instance and its own copy of the store graph, which is exactly what a fresh
 * process gives for free. Every child re-fetches the backup, so pass
 * --backup file.json to avoid N identical API calls.
 */
// ============================================================ GUI-parity search
//
// The browser panel and this share `src/search/driver.ts` and `src/search/chain.ts`
// outright. Only the three things the driver deliberately abstracts differ: where the
// chains get evaluated, how progress is reported, and where the answer is written.
//
// The alternative -- a second staged search written in Python -- is what
// `scripts/autoplan.py` is, and it is exactly how the `resolve_last` bug survived: the
// same defect existed in both copies and had to be found and fixed twice. One driver
// cannot drift from itself.

/** Build the evaluator inputs the driver needs. Mirrors `collectInputs()` in
 *  stores/chainSearch.ts field for field -- if one gains a field, so must the other. */
function planInputs(o: {
  planStart: number;
  currentTE: number;
  final: number;
  availability: Availability | null;
  milestones: Milestone[];
  deferShifts: boolean;
}): SearchInputs {
  return {
    context: simContext(),
    baseState: createBaseEngineState(null),
    currentFarmState: (useInitialStateStore() as any).currentFarmState,
    planStart: o.planStart,
    currentTE: o.currentTE,
    final: o.final,
    forceContinue: FORCE_CONTINUE,
    continuePinSeconds: PIN_SECONDS,
    continueMaxSeconds: MAX_CONTINUE_SECONDS,
    availability: o.availability,
    milestones: o.milestones,
    deferShifts: o.deferShifts,
    timeOff: TIME_OFF_WINDOWS,
  };
}

/**
 * A PERSISTENT pool of child processes, each holding a loaded player and a warm prefix memo.
 *
 * Child processes rather than worker_threads for the same reason `runSharded` uses them: every
 * evaluator needs its own Pinia instance and its own store graph, which a fresh process gives
 * for free. The difference from `runSharded` is that these are forked ONCE and then fed batches
 * over IPC, because the driver's batches are decided as it goes and re-forking per batch would
 * pay the ~2 s load cost hundreds of times.
 *
 * Chains are dealt to workers by PREFIX, never round-robin. The evaluator memoises per leg, so
 * two chains sharing `195,226,277` cost one simulation if they land on the same worker and two
 * if they do not. Round-robin would silently double the work of the widest stages.
 */
async function makeWorkerPool(jobs: number): Promise<{
  evaluate: EvaluateBatch;
  legSims: () => number;
  close: () => void;
}> {
  const { fork } = await import('node:child_process');
  // Everything except --jobs, plus --worker. The child must not itself try to shard.
  const base = process.argv.slice(2).filter((a, i, arr) => a !== '--jobs' && arr[i - 1] !== '--jobs');

  type Child = ReturnType<typeof fork>;
  const kids: Child[] = [];
  let legSimTotal = 0;

  await Promise.all(
    Array.from({ length: jobs }, (_, i) =>
      new Promise<void>((res, rej) => {
        const c = fork(process.argv[1], [...base, '--worker'], {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        // Workers are silent on stdout by design; anything they do print is a problem worth
        // seeing, so it is forwarded rather than swallowed.
        c.stderr?.on('data', d => process.stderr.write('[w' + i + '] ' + d));
        c.once('message', (m: any) => (m?.ready ? res() : rej(new Error('worker ' + i + ': ' + JSON.stringify(m)))));
        c.once('exit', code => rej(new Error('worker ' + i + ' exited ' + code + ' during startup')));
        kids.push(c);
      })
    )
  );
  // Startup listeners would otherwise reject the pool the moment we close it.
  for (const c of kids) c.removeAllListeners('exit');

  const evaluate: EvaluateBatch = async chains => {
    if (!chains.length) return { results: [], legSims: 0, workersUsed: 0 };

    // `workersForBatch` and `splitByPrefix` are the browser pool's own splitter, reused verbatim
    // rather than re-derived here. Both encode measurements -- a floor of MIN_CHAINS_PER_WORKER
    // chains each because spreading a 13-chain batch over 12 shards is mostly overhead, and a cut
    // on whole prefix subtrees because splitting destroys the per-leg memo (a 17-value sweep costs
    // 2 + 17x4 = 70 leg sims in one worker and 17x6 = 102 across seventeen). Writing a second
    // splitter here would be the same mistake as a second driver.
    const wanted = workersForBatch(chains.length, jobs);
    const groups = splitByPrefix(chains, wanted);
    const buckets: number[][][] = Array.from({ length: jobs }, () => []);
    groups.forEach((g, i) => buckets[i % jobs].push(...g));

    const replies = await Promise.all(
      buckets.map((bucket, i) =>
        new Promise<{ results: ChainResult[]; legSims: number }>((res, rej) => {
          if (!bucket.length) return res({ results: [], legSims: 0 });
          const c = kids[i];
          const onMessage = (m: any) => {
            c.off('message', onMessage);
            if (m?.error) return rej(new Error('worker ' + i + ': ' + m.error));
            res({ results: m.results as ChainResult[], legSims: m.legSims as number });
          };
          c.on('message', onMessage);
          c.send({ chains: bucket });
        })
      )
    );

    const results: ChainResult[] = [];
    let legSims = 0;
    for (const r of replies) {
      results.push(...r.results);
      legSims += r.legSims;
    }
    legSimTotal += legSims;
    return { results, legSims, workersUsed: buckets.filter(b => b.length).length };
  };

  return { evaluate, legSims: () => legSimTotal, close: () => kids.forEach(c => c.kill()) };
}

/** `--worker`: load the player once, then price whatever arrives over IPC. Never returns. */
async function runWorker(inputs: SearchInputs): Promise<void> {
  const evaluator = createChainEvaluator(inputs);
  let last = 0;
  process.on('message', (m: any) => {
    try {
      const results: ChainResult[] = [];
      for (const chain of m.chains as number[][]) {
        const r = evaluator.evaluate(chain);
        // A null is a chain some leg could not simulate, or one a milestone rejected. The driver
        // treats an absent result as "not a candidate", which is the correct reading of both.
        if (r) results.push(r);
      }
      const legSims = evaluator.legSims - last;
      last = evaluator.legSims;
      process.send!({ results, legSims });
    } catch (e: any) {
      process.send!({ error: String(e?.stack || e) });
    }
  });
  process.send!({ ready: true });
  // Hold the event loop open; the parent kills us when the run ends.
  await new Promise(() => {});
}

/**
 * Every strictly-increasing chain over a pool, priced. No staged search, no pruning, no
 * heuristics -- the answer is the true optimum of whatever space the pool describes.
 *
 * This is `--exhaustive`. It is the only mode that can PROVE anything: the staged search returns
 * a strong local optimum and says so, and the 4913-chain exhaustive is what established that it
 * had found rank 1 on the main account. It is also the mode that gets away from you fastest --
 * C(206,6) is 8.2e10 chains at ~15 s each -- so the count is printed before anything is
 * simulated and a large one needs --yes.
 */
// `exhaustiveChains` lives in src/search/exhaustive.ts, shared with the browser's Insane mode so
// the two cannot drift into enumerating different spaces. Imported at the top of this file.

/**
 * `--exhaustive`: price every strictly-increasing chain over a pool. No staged search, no
 * descent, no pruning of any kind -- the winner is the true optimum of the space described,
 * not a local one.
 *
 * This is the only mode that can prove anything, and the reason the README can say "rank 1 of
 * 4913" about one account at all. It is also the mode that runs away from you fastest: choosing
 * 6 checkpoints from 185..390 at step 1 is C(206,6) = 8.2e10 chains, which at ~15 s each is
 * longer than the age of the universe divided by nothing helpful. So the count and a wall-clock
 * estimate are printed BEFORE anything is simulated, and anything over the cap needs --yes.
 *
 * Pool comes from --range lo:hi:step (step defaults to 1) or --grid a,b,c. Length comes from
 * --prestiges lo-hi, the same flag the grid mode uses.
 */
async function runExhaustive(
  inputs: SearchInputs,
  o: {
    jobs: number;
    tz: string;
    planStart: number;
    currentTE: number;
    final: number;
    availability: Availability | null;
    deferShifts: boolean;
    t0: number;
  }
): Promise<void> {
  const { jobs, currentTE, final } = o;

  let pool: number[];
  if (arg('grid')) {
    pool = parseGroup(arg('grid')!);
  } else {
    const spec = arg('range');
    if (!spec) throw new Error('--exhaustive needs --range lo:hi[:step] or --grid a,b,c');
    const [lo, hi, step] = spec.split(':').map(Number);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('--range must look like 185:390 or 185:390:5');
    const by = Number.isFinite(step) && step > 0 ? step : 1;
    pool = [];
    for (let v = lo; v <= hi; v += by) pool.push(v);
  }
  pool = [...new Set(pool)].filter(v => v > currentTE && v < final).sort((a, b) => a - b);
  if (!pool.length) throw new Error('the pool is empty once values outside (' + currentTE + ', ' + final + ') are dropped');

  const parts = (arg('prestiges', '5-8')!).split('-').map(Number);
  const lo = parts[0];
  const hi = parts[1] ?? parts[0];

  const chains = exhaustiveChains(pool, lo, hi, final, currentTE);
  // ~15 s per chain is the measured floor with a warm prefix memo; sharing makes the real figure
  // lower, so this over-estimates, which is the direction an "are you sure" wants to err.
  const hours = (chains.length * 15) / 3600 / Math.max(1, jobs);
  console.log(
    '\n--- exhaustive: ' + pool.length + ' pool values, ' + lo + '-' + hi + ' prestiges' +
    '\n    ' + chains.length.toLocaleString() + ' chains, no pruning' +
    '\n    rough upper bound ' + (hours < 1 ? (hours * 60).toFixed(0) + ' min' : hours.toFixed(1) + ' h') +
    ' across ' + jobs + ' process(es)' +
    // Said BEFORE the run, not after. A run this long is routinely left overnight, and finding out
    // where the results went should not require it to finish successfully first.
    '\n    results -> ' + (resolveCsvPath() ?? '(nowhere: --no-csv)')
  );
  const CAP = 5000;
  if (chains.length > CAP && !has('yes')) {
    throw new Error(
      chains.length.toLocaleString() + ' chains is over the ' + CAP.toLocaleString() + ' safety cap. ' +
      'Coarsen --range, narrow --prestiges, or pass --yes if you mean it.'
    );
  }
  if (!chains.length) throw new Error('no chains: check --range against --prestiges');

  const csvPath = resolveCsvPath();
  const workers = jobs > 1 ? await makeWorkerPool(jobs) : null;
  const inline = workers ? null : createChainEvaluator(inputs);
  let inlineLegSims = 0;
  const evaluate: EvaluateBatch = workers
    ? workers.evaluate
    : async cs => {
        const results: ChainResult[] = [];
        for (const c of cs) {
          const r = inline!.evaluate(c);
          if (r) results.push(r);
        }
        const legSims = inline!.legSims - inlineLegSims;
        inlineLegSims = inline!.legSims;
        return { results, legSims, workersUsed: 1 };
      };

  try {
    // Chunked so progress is visible and the pool re-deals by prefix each time. Sorted first so
    // chains sharing a prefix land in the same chunk and the memo actually pays.
    chains.sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    });
    const CHUNK = Math.max(jobs * 8, 64);
    const cache: CacheEntry[] = [];
    let legSims = 0;
    for (let i = 0; i < chains.length; i += CHUNK) {
      const { results, legSims: n } = await evaluate(chains.slice(i, i + CHUNK));
      legSims += n;
      for (const r of results) cache.push({ key: r.chain.join(','), seconds: r.seconds, legs: r.legs });
      const done = Math.min(i + CHUNK, chains.length);
      const best = cache.reduce((m, e) => (e.seconds > 0 && e.seconds < m ? e.seconds : m), Infinity);
      // Flush what is priced so far. Rewriting the file each chunk is wasteful in principle, but a
      // chunk is minutes of pricing and the write is milliseconds, so the waste is not measurable.
      if (csvPath) {
        const sofar = cache.filter(e => e.seconds > 0).sort((a, b) => a.seconds - b.seconds);
        if (sofar.length) {
          writeCsv(csvPath, sofar, sofar[0].key.split(',').map(Number), { ...o, effort: 'exhaustive' });
        }
      }
      console.log('  ' + done + '/' + chains.length +
        (Number.isFinite(best) ? '   best ' + (best / 86400).toFixed(3) + ' d' : ''));
    }

    const ranked = cache.filter(e => e.seconds > 0).sort((a, b) => a.seconds - b.seconds);
    if (!ranked.length) throw new Error('every chain was rejected -- check --milestone and the TE bounds');
    report(ranked[0].key.split(',').map(Number), ranked[0].seconds, cache, chains.length, legSims, {
      ...o,
      note: 'EXHAUSTIVE over ' + chains.length.toLocaleString() + ' chains: this is the true optimum of that space, not a local one',
      effort: 'exhaustive',
    });
  } finally {
    workers?.close();
  }
}

/**
 * The browser panel's search, on the command line.
 *
 * Same driver, same evaluator, same effort tiers, same coarse scan, same CSV. What differs is
 * only the plumbing the driver already abstracts: `evaluateBatch` is a process pool instead of a
 * Web Worker pool, progress goes to stdout instead of a progress bar, and the answer is printed
 * and optionally written rather than rendered.
 */
async function runPlanSearch(
  inputs: SearchInputs,
  o: {
    jobs: number;
    tz: string;
    planStart: number;
    currentTE: number;
    final: number;
    availability: Availability | null;
    deferShifts: boolean;
    t0: number;
  }
): Promise<void> {
  const { jobs, tz, currentTE, final } = o;

  if (has('exhaustive')) return runExhaustive(inputs, o);

  const effort = effortTier();

  // Seed. `--seed "195 219 248"` matches the panel's Starting chain box, final target appended
  // for you either way. Without one there is nothing to descend from, so --find-seed is required.
  const seedArg = arg('seed');
  const seedFromArg = seedArg
    ? [...new Set(seedArg.trim().split(/\s+/).map(Number).filter(v => v > currentTE && v < final))].sort((a, b) => a - b)
    : [];

  // The site's defaults (chainSearch.ts minPrestiges/maxPrestiges); these were 4 and 9 here.
  const minPrestiges = +(arg('min-prestiges', '5')!);
  const maxPrestiges = +(arg('max-prestiges', '8')!);
  const pin = +(arg('pin', '0')!);

  if (!seedFromArg.length && !has('find-seed')) {
    throw new Error('--effort needs a starting point: pass --seed "195 219 248" or --find-seed');
  }

  const pool = jobs > 1 ? await makeWorkerPool(jobs) : null;
  // Single-process: evaluate inline. Same evaluator the workers hold, so a --jobs 1 run and a
  // --jobs 12 run differ only in wall clock, never in the answer.
  const inline = pool ? null : createChainEvaluator(inputs);
  let inlineLegSims = 0;
  const evaluate: EvaluateBatch = pool
    ? pool.evaluate
    : async chains => {
        const results: ChainResult[] = [];
        for (const c of chains) {
          const r = inline!.evaluate(c);
          if (r) results.push(r);
        }
        const legSims = inline!.legSims - inlineLegSims;
        inlineLegSims = inline!.legSims;
        return { results, legSims, workersUsed: 1 };
      };

  // Everything priced, for the CSV and for the final ranking. The driver hands back its whole
  // cache on every batch; keeping the last one is enough and avoids duplicating the bookkeeping.
  let cache: CacheEntry[] = [];

  try {
    let seed = seedFromArg.length ? [...seedFromArg, final] : [];

    if (has('find-seed')) {
      console.log('\n--- coarse scan: finding a starting chain');
      const coarse = await findStartingChain({
        currentTE,
        final,
        minPrestiges,
        maxPrestiges,
        evaluateBatch: evaluate,
      });
      for (const line of coarse.log) console.log('  ' + line);
      seed = coarse.seed;
      console.log('  seed -> ' + seed.join(' '));
    }

    const est = estimateChains(Math.max(1, seed.length - 1), EFFORT[effort]);
    console.log(
      '\n--- ' + effort + ': up to ~' + est + ' chains, ' +
      (jobs > 1 ? jobs + ' worker processes' : 'single process') +
      '\n    seed ' + seed.join(' ') + '  (prestige counts ' + minPrestiges + '-' + maxPrestiges +
      (pin ? ', first ' + pin + ' pinned' : '') + ')'
    );

    let lastStage = '';
    const outcome = await runChainSearch({
      seedChain: seed,
      final,
      currentTE,
      effort,
      pin: pin || undefined,
      minCheckpoints: minPrestiges,
      maxCheckpoints: maxPrestiges,
      evaluateBatch: evaluate,
      onCache: entries => (cache = entries),
      onProgress: p => {
        if (p.stage !== lastStage) {
          lastStage = p.stage;
          console.log('\n--- ' + p.stage);
        }
        if (p.detail) {
          console.log('  ' + p.detail +
            (p.bestSeconds > 0 ? '   ' + (p.bestSeconds / 86400).toFixed(3) + ' d  ' + p.bestChain.join(' ') : ''));
        }
      },
    });

    report(outcome.chain, outcome.seconds, cache, outcome.chainsEvaluated, outcome.legSims, {
      ...o,
      note: outcome.stoppedEarly
        ? 'stopped early; answer is what "' + outcome.lastCompletedStage + '" guarantees'
        : 'completed through ' + outcome.lastCompletedStage,
      effort,
    });
  } finally {
    pool?.close();
  }
}

/**
 * Where this run's CSV goes. Defaults to a timestamped file rather than nowhere.
 *
 * It used to write only when `--csv` was passed, and `--csv` is one line in a usage block nobody
 * re-reads. A 245-minute exhaustive over 6,006 chains finished, printed its top ten, and discarded
 * every other row: the cost of an unwanted 2 MB file is nothing next to that. `--no-csv` opts out.
 */
function resolveCsvPath(): string | null {
  if (has('no-csv')) return null;
  const explicit = arg('csv');
  if (explicit) return explicit;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `fastsearch-${stamp}.csv`;
}

/**
 * Write the panel's CSV. Separate from report() so the exhaustive loop can flush a partial file as
 * it goes: report() only ran on success, so a run still in progress -- or one that died, or whose
 * machine restarted -- left nothing on disk at all. A two-day exhaustive is unattended by
 * definition, which is exactly when that matters.
 */
function writeCsv(
  path: string,
  ranked: CacheEntry[],
  chain: number[],
  o: {
    tz: string;
    planStart: number;
    currentTE: number;
    final: number;
    availability: Availability | null;
    effort: string;
  }
): void {
  const raw = (simContext() as any).rawBackup ?? null;
  writeFileSync(
    path,
    buildChainsCsv(ranked, {
      planStart: o.planStart,
      timezone: o.tz,
      currentTE: o.currentTE,
      final: o.final,
      effort: o.effort,
      forceContinue: FORCE_CONTINUE,
    continuePinSeconds: PIN_SECONDS,
    continueMaxSeconds: MAX_CONTINUE_SECONDS,
      availability: o.availability,
      timeOff: TIME_OFF_DATES,
      seedChain: chain,
      inventory: raw ? describeVirtueInventory(raw) : undefined,
      loadouts: [],
    })
  );
}

/** Print the answer, and write the panel's own CSV. Shared by both new modes. */
function report(
  chain: number[],
  seconds: number,
  cache: CacheEntry[],
  chainsEvaluated: number,
  legSims: number,
  o: {
    tz: string;
    planStart: number;
    currentTE: number;
    final: number;
    availability: Availability | null;
    deferShifts: boolean;
    t0: number;
    note: string;
    effort: string;
  }
): void {
  const mins = (Date.now() - o.t0) / 60000;
  console.log('\n=== done  (' + mins.toFixed(1) + ' min, ' + chainsEvaluated + ' chains, ' + legSims + ' leg sims)');
  console.log('    ' + o.note);
  console.log('\n  ' + (seconds / 86400).toFixed(3) + ' d   ' + chain.join(' '));
  console.log('    ends ' + new Date((o.planStart + seconds) * 1000).toLocaleString('en-US', { timeZone: o.tz }));
  // The three-month continue warning (search/rules.ts), on the chain being reported.
  const firstLeg = cache.find(e => e.key === chain.join(','))?.legs?.[0];
  if (firstLeg?.key === 'continue' && firstLeg.durationSeconds > CONTINUE_WARN_SECONDS) {
    console.warn('\n  warning: ' + longContinueMessage(firstLeg.durationSeconds / 86400));
  }

  const ranked = [...cache].filter(e => e.seconds > 0).sort((a, b) => a.seconds - b.seconds);
  const top = +(arg('top', '10')!);
  if (top > 0 && ranked.length > 1) {
    console.log('\n  next best:');
    for (const e of ranked.slice(1, top + 1)) {
      console.log('    ' + (e.seconds / 86400).toFixed(3) + ' d  +' +
        ((e.seconds - seconds) / 86400).toFixed(3) + ' d   ' + e.key.split(',').join(' '));
    }
  }

  const csv = resolveCsvPath();
  if (csv) {
    writeCsv(csv, ranked, chain, o);
    console.log('\n  ' + ranked.length + ' chains -> ' + csv);
  }
}

async function runSharded(jobs: number): Promise<void> {
  const { fork } = await import('node:child_process');
  // --csv is the documented flag; --out is what the shards are handed. Reading only --out here made
  // every sharded run ignore --csv and overwrite the same fastsearch.csv.
  const out = arg('out') ?? arg('csv');
  const base = process.argv.slice(2).filter((a, i, arr) =>
    !['--jobs', '--out', '--csv'].includes(a) && !['--jobs', '--out', '--csv'].includes(arr[i - 1]));
  const parts: string[] = [];
  const t0 = Date.now();

  await Promise.all(
    Array.from({ length: jobs }, (_, i) => {
      const part = (out ?? 'fastsearch.csv').replace(/\.csv$/, '') + '.part' + i + '.csv';
      parts.push(part);
      return new Promise<void>((res, rej) => {
        const c = fork(process.argv[1], [...base, '--shard', i + '/' + jobs, '--out', part, '--top', '0'],
          { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        c.stdout?.on('data', d => process.stdout.write('[' + i + '] ' + d));
        c.stderr?.on('data', d => process.stderr.write('[' + i + '!] ' + d));
        c.on('exit', code => (code === 0 ? res() : rej(new Error('shard ' + i + ' exited ' + code))));
      });
    })
  );

  // Merge: keep one header, re-sort by days, recompute gap against the global best.
  let header = '';
  const body: string[] = [];
  for (const p of parts) {
    // A shard with no chains assigned writes no file; that is not an error.
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
    header = lines[0];
    body.push(...lines.slice(1));
  }
  if (!header) throw new Error('no shard produced any output');
  const daysIdx = header.split(',').indexOf('days');
  body.sort((a, b) => +a.split(',')[daysIdx] - +b.split(',')[daysIdx]);
  const bestDays = body.length ? +body[0].split(',')[daysIdx] : 0;
  const gapIdx = header.split(',').indexOf('gap_hours');
  const merged = body.map(l => {
    const c = l.split(',');
    c[gapIdx] = (((+c[daysIdx] - bestDays) * 24)).toFixed(1);
    return c.join(',');
  });
  writeFileSync(out ?? 'fastsearch.csv', [header, ...merged].join('\n'));
  for (const p of parts) { try { unlinkSync(p); } catch { /* already gone */ } }

  console.log('\n' + merged.length + ' chains in ' + ((Date.now() - t0) / 1000).toFixed(1) +
    's across ' + jobs + ' processes -> ' + (out ?? 'fastsearch.csv'));
  for (const l of merged.slice(0, +(arg('top', '15')!))) {
    const c = l.split(',');
    console.log('  ' + c[0].replace(/"/g, '').padEnd(30) + c[2].padStart(10) + c[gapIdx].padStart(7) + 'h');
  }
}

/**
 * `--effort` as a tier (src/search/offline.ts `chooseEffort`): Fast / Exact / Very high as the slider
 * says them, or the keys quick / normal / thorough. Balanced was retired on the site and runs Exact,
 * with a note. Exact by default, as on the site.
 */
function effortTier(): EffortTier {
  const choice = chooseEffort(arg('effort'));
  if (choice.note) console.log('effort: ' + choice.note);
  return choice.tier;
}

/**
 * The site's three searches run as the site runs them (scripts/siteRun.ts): Smart search (--effort),
 * the Full sweep (--bands) and Highest TE by a date (--by-date / --egg-day). `--direct` keeps --effort
 * on this script's own evaluator, which is what the what-ifs and diagnostics need.
 */
function isSiteMode(): boolean {
  if (has('bands') || has('suggest') || has('preset') || has('by-date') || has('egg-day')) return true;
  return has('effort') && !has('direct');
}

/** Flags only this script's own evaluator understands; the site's searches would ignore them. */
const DIRECT_ONLY = [
  'mod', 'continue-pin-days', 'continue-max-days', 'max-elr', 'prune', 'override-ascension',
  'override-days', 'override-hours', 'leg-variants', 'leg1-variants', 'dump-state', 'show-loadout',
  'debug', 'allow-stall',
];

/** The value after a flag that may also stand alone (`--suggest`, `--suggest 5`): '' for the bare flag. */
function optValue(name: string): string {
  const i = process.argv.indexOf('--' + name);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next !== undefined && !next.startsWith('--') ? next : '';
}

/** Checks that need nothing but argv, run before the save is loaded (see main). */
function checkSiteFlags(siteMode: boolean): void {
  if (has('submit') && !siteMode) {
    throw new Error('--submit sends a Smart search (--effort), Full sweep (--bands, --suggest, --preset) or By a date (--by-date) result');
  }
  if ((has('submit') || (siteMode && has('out'))) && (has('mod') || has('add-artifact'))) {
    throw new Error(
      `${has('submit') ? '--submit' : '--out'} with a what-if (--mod, --add-artifact) would leave something for the board that is not your gear`
    );
  }
  if (!siteMode) return;
  const direct = DIRECT_ONLY.filter(f => has(f));
  if (direct.length) {
    throw new Error(
      '--' + direct.join(', --') + (direct.length === 1 ? ' only works' : ' only work') +
        ' on this script\'s own evaluator: add --direct (with --effort), ' +
        'or use --stages / --grid / --exhaustive --range'
    );
  }
  const full = ['bands', 'suggest', 'preset'].filter(f => has(f));
  if (full.length > 1) throw new Error('--' + full.join(' and --') + ' each pick the Full sweep\'s space: use one');
  if (full.length && (has('by-date') || has('egg-day'))) throw new Error('--' + full[0] + ' is the Full sweep; By a date takes --chain');
  if (has('preset') && has('min-gap')) throw new Error('--preset has its own minimum gap (it is part of what the preset is): drop --min-gap');
  if (has('preset') && has('tag')) throw new Error('--preset files the run under its own name: drop --tag');
  if (has('nickname') && !has('submit') && !has('out')) {
    throw new Error('--nickname is the name a result is sent under: add --submit, or --out to send it later with `submit --from`');
  }
  if (has('no-hold-shifts') && (has('submit') || has('out'))) {
    throw new Error(
      '--no-hold-shifts is not something the site offers any more (picking hours holds the shifts): ' +
        'its results would not be comparable with the board, so it cannot go with --submit or --out'
    );
  }
  if (has('fresh') && !has('out')) throw new Error('--fresh clears an --out directory: add --out DIR');
  if (has('plain-csv') && !has('out')) throw new Error('--plain-csv adds run.csv to an --out directory: add --out DIR');
  if (has('widen') && !(has('bands') || has('suggest'))) throw new Error('--widen reruns a Full sweep whose best sits on a band edge: use it with --bands or --suggest');
  if (has('neighbours') && !has('bands')) throw new Error('--neighbours adds the counts either side to --bands (--suggest does it itself)');
  if (has('asc') && (has('chain') || !(has('by-date') || has('egg-day')))) {
    throw new Error('--asc suggests By a date chains: use it with --by-date or --egg-day, without --chain');
  }
}

/** The next Egg Day (14 July, 09:00 Pacific) that has not passed, or `--egg-day YEAR`'s. */
function eggDayDeadline(): number {
  const i = process.argv.indexOf('--egg-day');
  const next = process.argv[i + 1];
  const year = next && /^\d{4}$/.test(next) ? +next : nextEggDayYear();
  return getLocalTimestampInTimezone(`${year}-07-14`, '09:00', 'America/Los_Angeles');
}

/** The spaces a Full sweep will run: a named preset fitted to the save, the space Suggest a space picks,
 *  or the bands typed, then (for the last two, as the site queues them) the counts either side. */
function fullSweeps(o: { currentTE: number; final: number }): FullSweep[] {
  const minGap = Math.max(0, Math.floor(+(arg('min-gap', '0')!)));
  const budget = has('budget') ? Math.max(100, Math.floor(+arg('budget')!)) : SUGGESTION_CHAIN_BUDGET;
  const one = (asc: number, text: string, gap: number, tag: string | null, auto: boolean): FullSweep => ({
    asc, bandsText: text, bands: asc > 1 ? parseBands(text) : [], minGap: gap, tag, auto,
  });
  /** The count one lower and one higher, suggested at half the size (the panel's `queueNeighbours`). */
  const neighbours = (asc: number, taken: number[]): FullSweep[] => {
    const out: FullSweep[] = [];
    for (const n of [asc - 1, asc + 1]) {
      if (n < 1 || n > 12 || taken.includes(n)) continue;
      if (n === 1) { out.push(one(1, '', 0, null, true)); continue; }
      const sug = suggestBands(o.currentTE, o.final, n, { maxChains: Math.floor(budget / 2) });
      if (sug) out.push(one(n, sug.text, minGap, null, true));
    }
    return out;
  };

  if (has('preset')) {
    const fit = fitPreset(arg('preset') ?? '', o.currentTE, o.final);
    if (!fit.ok) throw new Error('--preset: ' + fit.reason);
    console.log(`preset ${fit.id}: ${fit.label}`);
    console.log(`  fitted to your TE (${Math.floor(o.currentTE)}): ${fit.bands}   minimum gap ${fit.minGap}`);
    console.log(`  ${fit.chains.toLocaleString()} chains, ${fit.ascensions} ascensions. ${fit.note}`);
    return [one(fit.ascensions, fit.bands, fit.minGap, fit.id, false)];
  }

  if (has('suggest')) {
    const asked = optValue('suggest');
    const tries = asked ? [Math.floor(+asked)] : [6, 5, 4, 3, 2];
    if (asked && !(tries[0] >= 2 && tries[0] <= 12)) throw new Error('--suggest: a count of ascensions from 2 to 12');
    for (const n of tries) {
      const sug = suggestBands(o.currentTE, o.final, n, { maxChains: budget });
      if (!sug) continue;
      console.log(
        `suggested for ${n} ascensions (${sug.kind === 'complete' ? (sug.exact ? 'every reachable TE, a complete sweep' : 'every 2nd TE') : 'the measured shape'}, ` +
          `${sug.chains.toLocaleString()} chains): ${sug.text}`
      );
      const list = [one(n, sug.text, minGap, null, false)];
      if (!has('no-neighbours')) list.push(...neighbours(n, [n]));
      return list.sort((x, y) => x.asc - y.asc);
    }
    throw new Error(`--suggest: no space to suggest ${asked ? `for ${asked} ascensions` : 'at this TE'} (try --bands, or --budget with a larger size)`);
  }

  const text = (arg('bands') ?? '').trim();
  const bands = text ? parseBands(text) : [];
  if (!bands.length) throw new Error('--bands: nothing readable, e.g. "185-200:5; 215-245:10"');
  // What the band checker would say in the site's box: said, never acted on.
  for (const line of bandCheckLines(text, { currentTE: o.currentTE, finalTE: o.final })) console.log(line);
  const tag = arg('tag') ?? null;
  // The site's own rule for a sweep tag (search/sweepRequest.ts): it is shown on the board.
  if (tag !== null && !/^[A-Za-z0-9-]{1,16}$/.test(tag)) throw new Error('--tag: up to 16 letters, digits or dashes');
  const list = [one(bands.length + 1, text, minGap, tag, false)];
  if (has('neighbours')) list.push(...neighbours(bands.length + 1, [bands.length + 1]));
  return list.sort((x, y) => x.asc - y.asc);
}

/** By a date's chains: the ones typed with --chain, else suggested the way the panel's Suggest a space
 *  does (--asc, default 4). The last-stop range comes with them. */
function dateChains(o: { currentTE: number }): {
  chains: { asc: number; bands: number[][] }[] | null;
  lastRange: [number, number] | null;
} {
  const chainTexts = argAll('chain');
  const picked = ['min-stops', 'max-stops', 'thoroughness', 'last-hi', 'step'].some(f => has(f));
  if (!chainTexts.length && picked && !has('asc')) {
    console.log('by a date: "Pick them for me" was retired on the site; running it as asked (to reproduce an old run)');
    return { chains: null, lastRange: null };
  }
  let chains: { asc: number; bands: number[][] }[];
  let lastRange: [number, number] | null = null;
  if (chainTexts.length) {
    chains = chainTexts.map(text => {
      const t = text.trim();
      if (t === '1' || t === 'none') return { asc: 1, bands: [] };
      const b = parseChainText(t);
      if (!b.length) throw new Error('--chain: nothing readable in "' + t + '" (one band per early stop, ; between)');
      return { asc: b.length + 1, bands: b };
    });
    const v = parseStopBox(arg('last') ?? '', 1);
    if (!v.length) throw new Error('--chain needs --last lo-hi: where to start looking for the last stop');
    lastRange = [Math.max(v[0], Math.floor(o.currentTE) + 1), Math.min(490, v[v.length - 1])];
    // The same check the panel's box gets: said, never acted on.
    chainTexts.forEach((text, k) => {
      if (chains[k].asc > 1) {
        for (const line of bandCheckLines(text, { currentTE: o.currentTE, finalTE: 490 }, '--chain')) {
          console.log(`  chain ${k + 1}: ${line.trim()}`);
        }
      }
    });
  } else {
    const counts = [...new Set((arg('asc', '4') ?? '4').split(',').map(t => Math.floor(+t.trim())))].filter(n => n >= 1 && n <= 8);
    if (!counts.length) throw new Error('--asc: ascension counts from 1 to 8, e.g. 3,4,5');
    const halfWidth = +(arg('width', '10')!);
    const step = +(arg('step', '2')!);
    chains = [];
    for (const n of counts.sort((a, b) => a - b)) {
      const sug = suggestDeadlineChain(o.currentTE, n, { halfWidth, step });
      if (!sug) throw new Error(`--asc ${n}: the stops do not fit between your TE and the last stop; try fewer ascensions`);
      const parsed: SuggestedChain = sug.chain;
      chains.push({ asc: parsed.asc, bands: parsed.asc > 1 ? parseChainText(parsed.text) : [] });
      console.log(`suggested chain for ${n} ascension${n === 1 ? '' : 's'}: ${parsed.text || '(no early stop: keep going on this farm)'}`);
      lastRange = lastRange ?? sug.lastRange;
    }
    if (has('last')) {
      const v = parseStopBox(arg('last')!, 1);
      if (!v.length) throw new Error('--last: lo-hi, e.g. 200-240');
      lastRange = [Math.max(v[0], Math.floor(o.currentTE) + 1), Math.min(490, v[v.length - 1])];
    }
  }
  return { chains, lastRange };
}

/** Everything scripts/siteRun.ts needs, from the flags and the loaded save. */
function siteOptions(o: {
  jobs: number;
  tz: string;
  startDate: string;
  startTime: string;
  final: number;
  availability: Availability | null;
  deferShifts: boolean;
  milestones: Milestone[];
  currentTE: number;
}): SiteRunOptions {
  const kind: SiteKind = has('by-date') || has('egg-day') ? 'by-date' : has('bands') || has('suggest') || has('preset') ? 'full' : 'smart';

  const seedArg = arg('seed');
  const seed = seedArg
    ? [...new Set(seedArg.trim().split(/\s+/).map(Number).filter(v => v > o.currentTE && v < o.final))].sort((a, b) => a - b)
    : [];
  if (kind === 'smart' && !seed.length && !has('find-seed')) {
    throw new Error('--effort needs a starting point: pass --seed "195 219 248" or --find-seed');
  }

  const sweeps = kind === 'full' ? fullSweeps({ currentTE: o.currentTE, final: o.final }) : [];
  const widenArg = optValue('widen');
  const widen = has('widen') ? (widenArg ? Math.max(0, Math.floor(+widenArg)) : 3) : 0;

  let deadline = 0;
  if (has('egg-day')) deadline = eggDayDeadline();
  else if (has('by-date')) {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec((arg('by-date') ?? '').trim());
    if (!m) throw new Error('--by-date must look like "2027-03-01 18:00" (in --timezone), or use --egg-day');
    deadline = getLocalTimestampInTimezone(m[1], m[2], o.tz);
  }
  const { chains, lastRange } = kind === 'by-date' ? dateChains({ currentTE: o.currentTE }) : { chains: null, lastRange: null };
  const THOROUGH: Record<string, number> = { quick: 500, light: 1500, standard: 3000, thorough: 6000, very: 12000 };
  const thorough = (arg('thoroughness', 'standard') ?? 'standard').toLowerCase();
  if (!(thorough in THOROUGH)) throw new Error('--thoroughness: quick, light, standard, thorough or very');

  const nickname = cleanNickname(arg('nickname') ?? '');
  const withCsv = !has('no-submit-csv');
  return {
    kind,
    account: arg('player-id') ?? (useInitialStateStore() as any).rawBackup?.eiUserId ?? 'file',
    jobs: o.jobs,
    tz: o.tz,
    startDate: o.startDate,
    startTime: o.startTime,
    final: o.final,
    availability: o.availability,
    deferShifts: o.deferShifts,
    milestones: o.milestones,
    timeOff: TIME_OFF_DATES,
    forceContinue: FORCE_CONTINUE,
    effort: effortTier(),
    seed,
    findSeed: has('find-seed'),
    minPrestiges: +(arg('min-prestiges', '5')!),
    maxPrestiges: +(arg('max-prestiges', '8')!),
    pin: +(arg('pin', '0')!),
    sweeps,
    widen,
    deadline,
    chains,
    lastRange,
    minStops: +(arg('min-stops', '3')!),
    maxStops: +(arg('max-stops', '5')!),
    lastHi: +(arg('last-hi', String(Math.min(490, Math.floor(o.currentTE) + 200)))!),
    step: +(arg('step', '5')!),
    maxShapes: THOROUGH[thorough],
    ascendNeeded: has('ascend-needed'),
    submit: has('submit') ? { nickname, csv: withCsv, yes: has('yes') } : null,
    out: has('out') && !has('dry-run') ? { dir: arg('out')!, nickname, csv: withCsv, plainCsv: has('plain-csv') } : null,
    csvPath: has('out') ? (has('csv') ? arg('csv')! : null) : resolveCsvPath(),
    top: +(arg('top', '10')!),
    resume: has('out') && !has('dry-run'),
    dryRun: has('dry-run'),
    onStatus: has('dry-run') ? undefined : outStatus,
  };
}

/** Set by main when --out is given: records how the run is going in DIR/run.json. */
let outStatus: ((status: RunStatus) => void) | undefined;

// ------------------------------------------------------------------ submit --from

/** The folders under `dir` (or `dir` itself) that hold a submission file, in name order. */
function submissionDirs(dir: string): string[] {
  if (existsSync(join(dir, SUBMISSION_FILE))) return [dir];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .sort()
    .map(name => join(dir, name))
    .filter(d => statSync(d).isDirectory() && existsSync(join(d, SUBMISSION_FILE)));
}

/**
 * `fastsearch submit --from DIR`: send what `--out` left, the way the site's Share sends it. The
 * summary is the file's payload as it was built when the run finished (so it carries the run's own
 * save time, TE and plan start, and is not filed as a what-if); the table is run.csv.gz, uncompressed
 * and sent through the same upload the site uses. Returns the exit code.
 */
async function submitCommand(): Promise<number> {
  const from = arg('from');
  if (!from) throw new Error('submit needs --from DIR (the --out directory of a run)');
  const dirs = submissionDirs(from);
  if (!dirs.length) throw new Error(`no ${SUBMISSION_FILE} in ${from} (or in its chain-K folders): run with --out first`);

  // Before the store is first used: it reads the collector once, and the owner code from storage.
  const collector = arg('collector');
  if (collector) (globalThis as any).__AAP_SUBMIT_URL__ = collector.replace(/\/?$/, '').replace(/(\/submit)?$/, '/submit');
  const dry = has('dry-run');
  if (has('anonymous') && has('nickname')) throw new Error('--anonymous and --nickname together: pick one');
  persistLocalStorage(arg('state') ?? join(homedir(), '.config', 'autoautoap', 'cli-state.json'));

  const store = useChainSearchStore();
  if (!store.submitUrl) {
    throw new Error('no collector configured in this build: pass --collector URL (the board\'s /submit address)');
  }
  // The one place a stray run could post to the real board: a destination that is not this machine
  // is only used when the person said --yes. (What goes is listed per result just below.)
  const allowed = checkSendAllowed(store.submitUrl, has('yes'));
  console.log(`${dry ? 'dry run: nothing is sent. Would send' : allowed.ok ? 'sending' : 'would send'} ${dirs.length} result${dirs.length === 1 ? '' : 's'} to ${store.submitUrl}`);
  if (!dry && !allowed.ok) {
    for (const dir of dirs) {
      try {
        const f = readOfflineSubmission(readFileSync(join(dir, SUBMISSION_FILE), 'utf8'));
        if (f.ok) {
          const p = f.value.payload;
          console.log(`  ${dirs.length > 1 ? dir : from}: ${f.value.kind} result ${p.chain.join(' ')}, ${p.nickname ? `as "${p.nickname}"` : 'anonymously'}`);
        }
      } catch {
        /* the listing is a courtesy; the refusal below is the point */
      }
    }
    console.error(allowed.message);
    return 1;
  }

  let failed = 0;
  for (const dir of dirs) {
    const name = dirs.length > 1 ? dir : from;
    const sent = join(dir, 'submitted.json');
    if (existsSync(sent) && !has('again')) {
      console.log(`${name}: already sent (${JSON.parse(readFileSync(sent, 'utf8')).at ?? 'earlier'}); --again sends it once more`);
      continue;
    }
    const read = readOfflineSubmission(readFileSync(join(dir, SUBMISSION_FILE), 'utf8'));
    if (!read.ok) {
      console.error(`${name}: ${SUBMISSION_FILE} is not usable: ${read.error}`);
      failed++;
      continue;
    }
    const file = read.value;
    let payload = file.payload;
    if (has('anonymous')) {
      const { nickname: _drop, ...rest } = payload;
      payload = rest as typeof payload;
    } else if (has('nickname')) {
      payload = { ...payload, nickname: cleanNickname(arg('nickname') ?? '') || undefined };
    }

    let csv: string | undefined;
    if (file.csv && !has('no-submit-csv')) {
      const csvFile = join(dir, file.csv);
      if (!existsSync(csvFile)) {
        console.error(`${name}: ${file.csv} is missing next to ${SUBMISSION_FILE}. Copy it too, or add --no-submit-csv to send the summary alone.`);
        failed++;
        continue;
      }
      const raw = readFileSync(csvFile);
      try {
        csv = (/\.gz$/.test(file.csv) ? gunzipSync(raw) : raw).toString('utf8');
      } catch {
        console.error(`${name}: ${file.csv} could not be read (damaged in the copy?)`);
        failed++;
        continue;
      }
    }
    const what = `${payload.chain.join(' ')}, ${payload.durationDays} d, ${payload.nickname ? `as "${payload.nickname}"` : 'anonymously'}${file.stoppedEarly ? ', partial' : ''}${csv ? `, table ${csv.length < 102400 ? `${Math.max(1, Math.round(csv.length / 1024))} KB` : `${(csv.length / 1048576).toFixed(1)} MB`}` : ', no table'}`;
    if (dry) {
      console.log(`${name}: would send ${file.kind} result ${what}`);
      continue;
    }
    console.log(`${name}: sending ${what}`);
    const res = await store.sendSubmission(payload, csv, { partition: file.partition, resultKey: file.resultKey });
    const year = payload.deadline !== undefined ? eggDayYearOf(payload.deadline) : null;
    const tail = file.kind === 'by-date' ? ` It's on Compare > ${year ? `Egg Day ${year}` : 'By a date'}.` : '';
    console.log(`  ${res.ok ? (res.duplicate === 'exact' ? res.message : `Thanks! ${sentence(res.message)}`) + tail : `Not sent: ${res.message}`}`);
    if (res.ok) writeFileSync(sent, JSON.stringify({ at: new Date().toISOString(), message: res.message }, null, 2));
    else failed++;
  }
  return failed ? 1 : 0;
}

async function main() {
  if (has('help') || process.argv.length <= 2) return printHelp();
  // `submit` is a command, not a search: it sends what an earlier --out left, and needs no save.
  if (process.argv[2] === 'submit') {
    process.exitCode = await submitCommand();
    return;
  }

  const t0 = Date.now();
  // `runSharded` forks one child per shard of a FIXED candidate list and merges their CSVs. The
  // staged search has no fixed list -- it decides the next batch from the last one's answer -- so
  // it does its own parallelism with a persistent pool instead. A worker must never re-shard.
  // The site's searches (scripts/siteRun.ts) run on worker threads of their own, sized by --jobs.
  const siteMode = isSiteMode();
  // Worker threads for the site's searches: every core but one by default, as the site's own pool
  // does (search/batch.ts `maxPoolSize`). The script's own tools fork processes and stay at 1.
  const jobs = has('jobs') ? +arg('jobs')! : siteMode ? Math.max(1, availableParallelism() - 1) : 1;
  if (!Number.isFinite(jobs) || jobs < 1) throw new Error('--jobs must be a whole number of at least 1');
  const planMode = has('effort') || has('exhaustive') || siteMode;
  checkSiteFlags(siteMode);
  let pinned: ReturnType<typeof readRunRecord> = null;
  let outRecord: (() => void) | undefined;
  if (siteMode) {
    // Before the store is first used: it reads the collector once, and the owner code from storage.
    const collector = arg('collector');
    if (collector) (globalThis as any).__AAP_SUBMIT_URL__ = collector.replace(/\/?$/, '').replace(/(\/submit)?$/, '/submit');
    if (has('submit') || has('state') || (has('out') && !has('dry-run'))) {
      persistLocalStorage(arg('state') ?? join(homedir(), '.config', 'autoautoap', 'cli-state.json'));
    }
    if (has('out') && !has('dry-run')) {
      const dir = arg('out');
      if (!dir || dir.startsWith('--')) throw new Error('--out needs a directory');
      const signature = runSignature(process.argv.slice(2));
      const plan = planOutDir(dir, signature, has('fresh'));
      if (plan.action === 'finished') {
        console.log(`${dir} already holds a finished run of this command (${plan.record.updatedAt}).`);
        console.log(`  send it: fastsearch submit --from ${dir}      run it again: add --fresh`);
        return;
      }
      pinned = plan.record;
      // The store's own checkpoints and saved runs, as files in the directory.
      installFileIndexedDb(join(dir, CHECKPOINT_DIR));
      console.log(
        plan.action === 'resume'
          ? `--out ${dir}: carrying on a run that was ${plan.record.status === 'running' ? 'interrupted' : plan.record.status} (plan start ${plan.record.startDate} ${plan.record.startTime} ${plan.record.timezone}, from the directory)`
          : `--out ${dir}: a new run; its checkpoint is kept in ${join(dir, CHECKPOINT_DIR)}`
      );
      outRecord = () => {};
    }
  }
  if (jobs > 1 && !arg('shard') && !planMode && !has('worker')) return runSharded(jobs);
  if (siteMode) {
    const cores = availableParallelism();
    const mb = Math.round(totalmem() / 1048576);
    console.log(
      `workers: ${jobs} of ${cores} cores${has('jobs') ? '' : ' (the default is cores minus one; --jobs N changes it)'}. ` +
        `Each holds roughly 0.1-0.25 GB of simulator memory, so about ${(jobs * 0.25).toFixed(1)} GB at most, of this machine's ${(mb / 1024).toFixed(0)} GB, ` +
        `plus the priced chains in the main process.`
    );
    if (jobs > cores) console.warn(`  warning: --jobs ${jobs} is more than the ${cores} cores here; it is held to ${cores}.`);
    if (jobs * 0.25 * 1024 > mb * 0.8) {
      console.warn('  warning: that may be more memory than this machine has free. Use fewer workers if it starts swapping or is killed.');
    }
  }

  // Argument parsing and validation runs BEFORE the backup is touched. Every check in here is
  // pure -- it reads argv and nothing else -- and leaving it below `loadPlayer()` meant a typo'd
  // hour was reported only after a file read, or after a --player-id round trip to the API. Fail
  // on the flags first; the account is the expensive part.
  const tz = arg('timezone') ?? pinned?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // When the player can act, in `tz`. Two spellings of the same thing:
  //   --available-from 7 --available-to 23 [--available-days sat,sun]
  //   --sleep-from 23 --sleep-until 7           (the inverse, for the common case)
  // Each inter-leg PRESTIGE that would land outside the schedule is moved to the next
  // available hour and the delay is charged, which shifts every downstream sale
  // boundary - so this changes which chain is fastest and is not a display option.
  // Measured on the main account's proven optimum with 23:00-07:00 America/Denver:
  // 741.965 d -> 745.789 d on that FIXED chain (9.5 h of waiting plus a sale-boundary
  // flip on the final leg). Re-optimising under the constraint is the point of putting
  // it in the objective. See src/search/availability.ts for what it does not model.
  const DAY_TOKENS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const sleepFrom = arg('sleep-from');
  const sleepUntil = arg('sleep-until');
  const availFrom = arg('available-from');
  const availTo = arg('available-to');
  const availDays = arg('available-days');

  if ((sleepFrom === undefined) !== (sleepUntil === undefined)) {
    throw new Error('--sleep-from and --sleep-until must be given together');
  }
  if ((availFrom === undefined) !== (availTo === undefined)) {
    throw new Error('--available-from and --available-to must be given together');
  }
  if (sleepFrom !== undefined && availFrom !== undefined) {
    throw new Error('use --sleep-from/--sleep-until OR --available-from/--available-to, not both');
  }

  // Hold each SHIFT for the schedule too, not just the prestige between ascensions. Always, with hours,
  // on the site: picking hours means the shifts wait for them inside the simulation and the farm keeps
  // laying while it waits (the old "hold shifts" checkbox is gone). `--no-hold-shifts` is kept only to
  // reproduce a result from before that, and the flag checks refuse it with --submit and --out.
  const deferShifts = !has('no-hold-shifts');

  let availability: Availability | null = null;
  if (sleepFrom !== undefined || availFrom !== undefined || availDays !== undefined) {
    // Hours default to all-day so --available-days works on its own ("weekends only").
    const fromHour = availFrom !== undefined ? +availFrom : sleepFrom !== undefined ? +sleepUntil! : 0;
    const toHour = availTo !== undefined ? +availTo : sleepFrom !== undefined ? +sleepFrom : 0;
    const days = (availDays ?? '')
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .map(t => {
        const i = /^[0-6]$/.test(t) ? +t : DAY_TOKENS.indexOf(t.slice(0, 3));
        if (i < 0 || i > 6) throw new Error('--available-days: unrecognised day "' + t + '"');
        return i;
      });
    // Range-check before `isConstrained`, which answers only "does this rule anything out" and
    // returns false for a malformed hour as well as for an empty one. Sharing one message
    // between the two meant `--available-from 25` was reported as "rules nothing out" -- a
    // description of the opposite mistake, sending you to widen a window that was never read.
    for (const [flag, h] of [['from', fromHour], ['to', toHour]] as const) {
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        throw new Error(`--available-${flag}: expected a whole hour 0-23, got "${h}"`);
      }
    }
    availability = { days, fromHour, toHour, timezone: tz };
    if (!isConstrained(availability)) {
      throw new Error('the schedule given rules nothing out (every day, all hours); ' +
                      'drop the flags or narrow it');
    }
    // Say what is actually happening, which depends on --no-hold-shifts. This line used to
    // claim "shifts are reported only" unconditionally, while `deferShifts` defaults to TRUE --
    // so the default run held and charged every shift and then told you it had not. The whole
    // point of putting the schedule in the objective is that the number moves; a banner that
    // misreports which model produced it undermines every duration printed after it.
    console.log(
      'available: ' + describeAvailability(availability) +
        (deferShifts
          ? '  (prestiges AND the twelve per-ascension shifts wait for it inside the simulation, and the farm keeps laying while it waits)'
          : '  (prestiges wait for it; shifts do not, as the legacy --no-hold-shifts asks: the site no longer offers this)')
    );
  }


  await loadPlayer();

  const final = +(arg('final', '490')!);
  // Both defaults read the clock in --timezone. toISOString() is UTC, so pairing it with the local
  // hour put an evening run a day into the future (22:00 Denver on the 22nd became "the 23rd 22:00").
  const nowParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map(p => [p.type, p.value])
  );
  // With --out, the first run's start is kept in the directory, so running the same command again
  // prices against the same clock and finds its checkpoint.
  const startDate = arg('start-date') ?? pinned?.startDate ?? `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const startTime = arg('start-time') ?? pinned?.startTime ?? nowParts.hour + ':00';
  if (outRecord) {
    const dir = arg('out')!;
    const first = pinned?.createdAt ?? new Date().toISOString();
    outStatus = status =>
      writeRunRecord(dir, {
        format: 1,
        signature: runSignature(process.argv.slice(2)),
        status,
        startDate,
        startTime,
        timezone: tz,
        createdAt: first,
        updatedAt: new Date().toISOString(),
      });
  }
  const planStart = getLocalTimestampInTimezone(startDate, startTime, tz);

  // --milestone "248@2027-06-01", repeatable. A chain that misses one is not a candidate at all -
  // it is dropped the same way a chain whose simulation failed is dropped. Stated as a TE value
  // rather than an ascension number because the count probe reshapes the chain, so "A3" would mean
  // a different thing before and after stage 7. See src/search/milestones.ts, including why a
  // milestone on the final target cannot improve the answer.
  const milestones: Milestone[] = argAll('milestone').map(spec => {
    const m = /^(\d+)@(\d{4}-\d{2}-\d{2})$/.exec(spec.trim());
    if (!m) throw new Error('--milestone must look like "248@2027-06-01" (got "' + spec + '")');
    return { te: +m[1], by: getLocalTimestampInTimezone(m[2], '23:59', tz) };
  });
  const usable = usableMilestones(milestones, final);
  if (usable.length !== milestones.length) {
    throw new Error('--milestone: a TE must be between 1 and --final (' + final + ')');
  }
  for (const ms of usable) {
    // Formatted in `tz`, not UTC: `by` is 23:59 local, which is the NEXT day in UTC for any
    // western zone, and printing that back reads as an off-by-one.
    const shown = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ms.by * 1000));
    console.log('milestone: reach ' + ms.te + ' TE by end of ' + shown + ' (chains that miss it are dropped)');
  }

  const snap: any = useActionsStore().effectiveSnapshot;
  const currentTE = snap?.teEarned
    ? (Object.values(snap.teEarned as Record<VirtueEgg, number>) as number[]).reduce((a, b) => a + b, 0)
    : 0;

  // --time-off: whole local dates away from the virtue farm (src/search/timeOff.ts). Handled by the
  // shared chain evaluator, so only the modes that use it (--exhaustive, --effort, and the workers
  // they fork) accept it; the --stages/--grid path has its own leg loop and would silently ignore it.
  TIME_OFF_DATES = argAll('time-off').flatMap(v => v.split(',')).filter(Boolean).map(spec => {
    const [from, to = from] = spec.trim().split(':');
    return { from, to };
  });
  if (TIME_OFF_DATES.length) {
    if (usableTimeOff(TIME_OFF_DATES).length !== TIME_OFF_DATES.length) {
      throw new Error('--time-off must look like 2027-07-14 or 2027-07-14:2027-07-16');
    }
    if (!planMode && !has('worker')) throw new Error('--time-off needs --exhaustive or --effort (the shared evaluator)');
    TIME_OFF_WINDOWS = timeOffWindows(TIME_OFF_DATES, tz);
    console.log('time off from virtue: ' + describeTimeOff(TIME_OFF_DATES) + ' (each ends the ascension in progress; a rebuild follows)');
  }
  const inputs = planInputs({ planStart, currentTE, final, availability, milestones: usable, deferShifts });

  // `--worker`: a pool member. Loads the player above like anyone else, then serves chains over
  // IPC forever. Must come before every other mode, and never returns.
  if (has('worker')) return runWorker(inputs);

  // THE INTEGRITY CHECK (thresholds and wording in src/search/rules.ts): how long a fresh ascension
  // from here sits on its first Integrity shift. Printed every run; past an hour it is a warning,
  // past a week the run is refused -- the browser refuses too -- unless --allow-stall asks for the
  // numbers anyway, which is what studying a stalled account needs.
  // The save's age against the plan start (src/lib/saveAge.ts): caught up at the current rate up to
  // what the silos hold; past that the sync is old or something was missed.
  {
    const iss: any = useInitialStateStore();
    const farm = iss.currentFarmState;
    const sync = farm?.lastStepTime > 1e9 ? farm.lastStepTime : iss.rawBackup?.approxTime;
    const note = describeSaveAge(sync, planStart, siloSeconds(farm?.numSilos, iss.epicResearchLevels?.silo_capacity), !!farm);
    if (note) (note.level === 'warning' ? console.warn : console.log)((note.level === 'warning' ? '\n  warning: ' : 'save: ') + note.text);
  }

  const integrityWait = integrityWaitSeconds(inputs);
  // --integrity-only: print the check as seconds and stop (for sampling it across plan starts).
  if (has('integrity-only')) {
    console.log('INTEGRITY_SECONDS ' + (integrityWait ?? 'null'));
    return;
  }
  if (integrityWait === null) {
    console.log('integrity check: could not simulate a fresh ascension from this save');
  } else if (integrityWait <= INTEGRITY_WARN_SECONDS) {
    console.log('integrity check: a fresh ascension clears Integrity in ' + describeDuration(integrityWait));
  } else {
    console.warn('\n  integrity check: ' + integrityMessage(integrityWait) + '\n');
    if (integrityWait > INTEGRITY_BLOCK_SECONDS && !has('allow-stall')) {
      throw new Error('refusing to run: a fresh ascension stalls on Integrity for ' + describeDuration(integrityWait) +
        '. Pass --allow-stall to run it anyway.');
    }
  }

  if (siteMode) {
    process.exitCode = await runSiteSearch(
      siteOptions({ jobs, tz, startDate, startTime, final, availability, deferShifts, milestones: usable, currentTE })
    );
    return;
  }

  if (planMode) return runPlanSearch(inputs, { jobs, tz, planStart, currentTE, final, availability, deferShifts, t0 });

  // Build the candidate list. --stages is a Cartesian product (one pick per
  // group, in order); --grid + --prestiges enumerates subsets of a shared pool.
  let chains: number[][] = [];
  const stages = arg('stages');
  if (stages) {
    const groups = stages.split(';').map(parseGroup);
    const walk = (i: number, acc: number[]) => {
      if (i === groups.length) {
        chains.push([...acc, final]);
        return;
      }
      for (const v of groups[i]) {
        if (!acc.length || v > acc[acc.length - 1]) walk(i + 1, [...acc, v]);
      }
    };
    walk(0, []);
  } else if (arg('grid')) {
    const pool = parseGroup(arg('grid')!);
    const parts = (arg('prestiges', '5-5')!).split('-').map(Number);
    const lo = parts[0];
    const hi = parts[1] ?? parts[0];
    const sub = (i: number, acc: number[]) => {
      if (acc.length && acc.length >= lo - 1 && acc.length <= hi - 1) chains.push([...acc, final]);
      if (acc.length >= hi - 1) return;
      for (let j = i; j < pool.length; j++) sub(j + 1, [...acc, pool[j]]);
    };
    sub(0, []);
  } else {
    throw new Error('need --stages "a;b;c" or --grid a,b,c --prestiges 5-8');
  }

  chains = chains.filter(c => c.every((v, i) => (i === 0 ? v > currentTE : v > c[i - 1])));

  // Sharding. A leg simulation costs seconds, so a large grid only finishes
  // quickly by using more than one core.
  //
  // Shards are cut on whole prefix subtrees, never round-robin over chains, so a
  // shared prefix is still simulated once instead of once per shard. The cut
  // depth is the SHALLOWEST one that yields at least `jobs` groups: shallower
  // means bigger subtrees and more sharing retained, but too shallow cannot fill
  // the cores. Fixing this at depth 1 (the old behaviour) silently wasted every
  // extra process on a grid like "195;231;280;313-321", where the second
  // checkpoint has a single value and every chain lands in one shard.
  const shard = arg('shard');
  if (shard && !arg('override-ascension')) {
    const [si, sn] = shard.split('/').map(Number);
    const keyAt = (c: number[], L: number) => c.slice(0, L).join(',');
    let depth = 1;
    for (let L = 1; L <= (chains[0]?.length ?? 1); L++) {
      depth = L;
      if (new Set(chains.map(c => keyAt(c, L))).size >= sn) break;
    }
    const groups = [...new Set(chains.map(c => keyAt(c, depth)))].sort();
    const mine = new Set(groups.filter((_, i) => i % sn === si));
    chains = chains.filter(c => mine.has(keyAt(c, depth)));
  }

  // --dump-state: print the account's farm inputs as JSON and exit. Everything a
  // plan depends on beyond the chain itself, so two accounts can be compared and a
  // stale backup is obvious at a glance.
  if (arg('dump-state') !== undefined) {
    const iss: any = useInitialStateStore();
    const equipped = (iss.artifactLoadout || [])
      .filter((s: any) => s && s.artifactId)
      .map((s: any) => ({ id: s.artifactId, stones: (s.stones || []).filter(Boolean).length }));
    console.log('===DUMP_STATE_JSON===');
    console.log(JSON.stringify({
      currentTE,
      colleggtibleTiers: iss.colleggtibleTiers,
      colleggtibleModifiers: iss.colleggtibleModifiers,
      equippedArtifacts: equipped,
      epicResearchLevels: iss.epicResearchLevels,
      soulEggs: (iss.rawBackup?.game?.soulEggsD ?? null),
      prophecyEggs: (iss.rawBackup?.game?.eggsOfProphecy ?? null),
      // Only present when --add-artifact was used, so an untouched dump stays untouched.
      ...(ADDED_ARTIFACTS.length ? { injectedArtifacts: ADDED_ARTIFACTS } : {}),
    }, null, 2));
    return;
  }

  // Only prints when the human asked for it, so a run with no --add-artifact is
  // byte-identical on stdout to before this feature existed.
  if (ADDED_ARTIFACTS.length || has('show-loadout')) reportChosenLoadout();

  console.log('player TE ' + currentTE + ' -> ' + final +
    ' | plan start ' + startDate + ' ' + startTime + ' ' + tz);
  console.log(chains.length + ' chains to evaluate' + (shard ? ' (shard ' + shard + ')' : ''));
  if (!chains.length) return;

  // Depth-first over the trie so each distinct prefix is simulated once. Sorting
  // groups sibling chains together, which is what makes the sharing pay off.
  chains.sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? -1) - (b[i] ?? -1);
      if (d) return d;
    }
    return 0;
  });

  // ---- end-time override sweep -------------------------------------------
  // Pins one ascension to END at a given instant instead of when it naturally
  // would, which is the "when should I prestige?" question rather than "at what
  // TE?". Each (chain, pin) pair becomes its own row.
  const ovAsc = arg('override-ascension');
  const ovIdx = ovAsc ? +ovAsc - 1 : -1;
  const pins: { t: number; date: string; time: string }[] = [];
  if (ovIdx >= 0) {
    const [d0, d1] = (arg('override-days') ?? startDate + ':' + startDate).split(':');
    const hrs = parseGroup((arg('override-hours') ?? '0-23').replace(/-/g, '-'));
    for (let d = new Date(d0 + 'T00:00:00Z'); d <= new Date(d1 + 'T00:00:00Z');
         d = new Date(d.getTime() + 86400000)) {
      const ds = d.toISOString().slice(0, 10);
      for (const h of hrs) {
        const ts = String(h).padStart(2, '0') + ':00';
        pins.push({ t: getLocalTimestampInTimezone(ds, ts, tz), date: ds, time: ts });
      }
    }
    // Shard on PINS, not on chains. With 15 chains over 14 workers the chain
    // sharder cuts at depth 4 - one chain per shard - and every shard then redoes
    // A1/A2/A3 for all 168 pins on its own. Splitting the pins instead keeps all
    // the chains together in each worker, so a pin's A2/A3 are simulated once and
    // reused across every chain sharing that prefix. Measured on this sweep:
    // 11,760 leg sims the old way versus 6,888 this way.
    if (shard) {
      const [si, sn] = shard.split('/').map(Number);
      const mine = pins.filter((_, i) => i % sn === si);
      pins.length = 0;
      pins.push(...mine);
    }
    console.log('override: pinning A' + ovAsc + ' end across ' + pins.length +
      ' slots x ' + chains.length + ' chains -> ' + chains.length * pins.length + ' evaluations');
  } else {
    pins.push({ t: 0, date: '', time: '' });
  }

  const memo = new Map<string, LegResult | null>();
  const rows: Row[] = [];
  let sims = 0;
  let failed = 0;

  // Branch and bound. Off unless --prune, so the pruned and unpruned runs can be
  // diffed against each other - an inadmissible bound shows up as a missing or
  // reordered result, which is exactly the failure worth catching empirically.
  const prune = has('prune');
  const maxElrQph = +(arg('max-elr', '11.585')!);
  const maxElr = (maxElrQph * 1e15) / 3600; // q/hr -> eggs/second
  let incumbent = Infinity;
  let pruned = 0;
  let capViolations = 0;
  let worstCapSeen = 0;

  // A tight incumbent early is what makes pruning bite, so evaluate a known-good
  // chain first when one is offered. Without it the first chains examined may all
  // be poor and nothing gets cut until late in the run.
  // The seed is evaluated FIRST in every shard, because an incumbent is only
  // useful if it exists before the chains it is meant to cut. But each shard
  // owns a disjoint slice of the grid, so only the shard that actually owns the
  // seed may RECORD it - otherwise the merged CSV carries one duplicate row per
  // shard (it carried 7 before this guard) and every other shard pays to
  // simulate a chain that is not its own.
  const seed = arg('seed');
  let seedKey = '';
  let missedMilestone = 0;
  let seedIsMine = true;
  if (prune && seed) {
    const s = seed.trim().split(/\s+/).map(Number);
    const target = s[s.length - 1] === final ? s : [...s, final];
    seedKey = target.join(',');
    seedIsMine = chains.some(c => c.join(',') === seedKey);
    chains = [target, ...chains.filter(c => c.join(',') !== seedKey)];
  }

  for (const pin of pins)
  for (const chain of chains) {
    let state: any = null;
    let time = planStart;
    let te = currentTE;
    const legs: Row['legs'] = [];
    // Absolute arrivals, for the milestone check. Row['legs'] carries `te`/`dur` and no absolute
    // instant at all, so it cannot answer "when did this plan reach 248".
    const arrivals: LegArrival[] = [];
    let ok = true;

    for (let i = 0; i < chain.length; i++) {
      // Legs BEFORE the pinned one are identical for every pin, so they stay on a
      // shared key and are simulated once for the whole sweep. From the pinned leg
      // onward the result depends on the deadline, so the key carries it.
      const key = chain.slice(0, i + 1).join(',') +
        (ovIdx >= 0 && i >= ovIdx ? '@' + pin.t : '');
      let leg = memo.get(key);
      if (leg === undefined) {
        if (i === 0) {
          const b = createBaseEngineState(null);
          b.currentEgg = 'curiosity';
          b.population = 1;
          b.bankValue = 0;
          b.researchLevels = {};
          state = b;
        }
        try {
          leg = runLeg(state, time, chain[i], i === 0, te, i,
                       i === ovIdx ? pin.t : undefined);
        } catch (e) {
          if (has('debug')) console.error('  leg ' + key + ' threw: ' + (e as Error).stack);
          leg = null;
        }
        // Same rule as src/search/chain.ts: a leg that never ends is a failure, not an Infinity.
        if (leg && !(leg.summary.endTime < LAST_DATEABLE_SECONDS)) leg = null;
        sims++;
        memo.set(key, leg);
      }
      if (!leg) {
        ok = false;
        failed++;
        break;
      }
      // Availability: the plan's next instruction after a leg ends is a prestige, so
      // a target reached at 03:14 is not acted on until the player is back. The FINAL
      // leg is exempt - reaching the final target is not an action.
      const wait = availability && i < chain.length - 1
        ? nextAvailable(leg.summary.endTime, availability) - leg.summary.endTime
        : 0;
      arrivals.push({ endTE: leg.summary.endTE, endTime: leg.summary.endTime });
      legs.push({
        wait,
        nsh: countUnavailable(leg.shiftTimes, availability),
        key: leg.key,
        te: leg.summary.endTE,
        dur: leg.summary.totalDurationSeconds,
        elr: leg.summary.maxELR,
        // Final-leg state for the phase-prediction experiment: the build phase
        // ends on a SALE BOUNDARY, so bend is a discrete quantity, not smooth.
        bdur: leg.summary.buildDurationSeconds,
        bend: leg.summary.buildPhaseEndTime - leg.summary.startTime,
        bsale: leg.summary.buildPhaseSaleCount,
        lastte: leg.summary.lastTEDurationSeconds,
        t13: leg.summary.tier13Unlocked ? 1 : 0,
        se0: leg.summary.startSoulEggs,
        shift: leg.summary.totalShiftCost,
      });
      state = leg.nextState;
      time = leg.summary.endTime + wait;
      te = leg.summary.endTE;

      // Self-check on the assumption the whole bound rests on.
      if (leg.summary.maxELR > maxElr) {
        capViolations++;
        worstCapSeen = Math.max(worstCapSeen, (leg.summary.maxELR * 3600) / 1e15);
      }

      // Cut the subtree if a perfect finish from here still loses. Checked after
      // every leg, so a hopeless prefix dies before paying for the long legs.
      if (prune && i < chain.length - 1) {
        const floor = minSecondsToReach(
          leg.summary.finalTE as any,
          leg.summary.eggsDelivered as any,
          final,
          maxElr
        );
        if (time - planStart + floor >= incumbent) {
          ok = false;
          pruned++;
          break;
        }
      }
    }

    // A chain that misses a dated milestone is not a candidate. Checked here rather than inside
    // the leg loop because the check needs the whole leg list, and it deliberately does NOT count
    // as `failed` - the simulation succeeded, the chain was simply ruled out.
    if (ok && usable.length && !meetsAll(arrivals, usable)) {
      ok = false;
      missedMilestone++;
    }

    if (ok) {
      // A foreign seed still tightens the incumbent; it just isn't ours to report.
      if (seedIsMine || chain.join(',') !== seedKey) {
        rows.push({ chain, seconds: time - planStart, legs, pinDate: pin.date, pinTime: pin.time });
      }
      if (time - planStart < incumbent) incumbent = time - planStart;
    }
    if (rows.length && rows.length % 250 === 0) {
      process.stdout.write('\r  ' + rows.length + '/' + chains.length + ' ...');
    }
  }

  rows.sort((a, b) => a.seconds - b.seconds);
  const secs = (Date.now() - t0) / 1000;
  const fmt = (s: number) => Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
  // Naive cost = every leg of every chain, for every pin (no sharing at all).
  const naive = chains.reduce((n, c) => n + c.length, 0) * pins.length;

  console.log('\n\n' + rows.length + ' chains in ' + secs.toFixed(1) + 's  (' +
    sims + ' leg sims, ' + failed + ' failed' + (prune ? ', ' + pruned + ' pruned' : '') + ')');
  if (capViolations) {
    console.log('\n  !! BOUND VIOLATED: ' + capViolations + ' leg(s) exceeded --max-elr ' +
      maxElrQph + 'q/hr (worst ' + worstCapSeen.toFixed(3) + 'q/hr).');
    console.log('     The pruning bound assumed that cap, so this run may have discarded valid');
    console.log('     chains. Re-run with --max-elr ' + (Math.ceil(worstCapSeen*1000)/1000) + ' or without --prune.');
  }
  console.log((secs / Math.max(rows.length, 1) * 1000).toFixed(1) + ' ms/chain  |  prefix sharing saved ' +
    (naive - sims).toLocaleString() + ' leg sims\n');

  if (missedMilestone) {
    console.log('  ' + missedMilestone + ' chains simulated fine but missed a --milestone (not failures)');
  }
  if (usable.length && !rows.length) {
    console.log('\nNo chain met the milestones. Nothing is reported because a rejected chain is ' +
                'never ranked - relax the tightest date to see how close the fastest plan gets.');
  }
  const best = rows.length ? rows[0].seconds : 0;
  for (const r of rows.slice(0, +(arg('top', '15')!))) {
    console.log('  ' + r.chain.join(' ').padEnd(26) +
      (r.pinDate ? (r.pinDate + ' ' + r.pinTime).padEnd(18) : '') +
      fmt(r.seconds).padStart(10) + ((r.seconds - best) / 3600).toFixed(0).padStart(6) + 'h   ' +
      r.legs.map(l => l.key).join(' / '));
  }
  if (rows.length && rows[0].legs[0]?.key === 'continue' && rows[0].legs[0].dur > CONTINUE_WARN_SECONDS) {
    console.warn('\n  warning: ' + longContinueMessage(rows[0].legs[0].dur / 86400));
  }

  // `--csv` as well, the same as runSharded: it is the flag every other mode documents, and with
  // `--jobs 1` this is the only writer, so honouring just `--out` here silently dropped the file.
  const out = arg('out') ?? arg('csv');
  if (out) {
    const head = ['chain', 'prestiges', 'duration', 'days', 'gap_hours', 'plan_start', 'pin_date', 'pin_time'];
    for (let i = 1; i <= 8; i++) head.push('A' + i + '_sale', 'A' + i + '_te', 'A' + i + '_days', 'A' + i + '_elr',
      'A' + i + '_bdur', 'A' + i + '_bend', 'A' + i + '_bsale', 'A' + i + '_lastte',
      'A' + i + '_t13', 'A' + i + '_se0', 'A' + i + '_shift',
      'A' + i + '_wait_h', 'A' + i + '_nightshifts');
    const lines = [head.join(',')];
    for (const r of rows) {
      const c: (string | number)[] = [
        '"' + r.chain.join(' ') + '"', r.chain.length, fmt(r.seconds),
        (r.seconds / 86400).toFixed(3), ((r.seconds - best) / 3600).toFixed(1),
        '"' + startDate + ' ' + startTime + '"',
        '"' + (r.pinDate ?? '') + '"', '"' + (r.pinTime ?? '') + '"',
      ];
      for (let i = 0; i < 8; i++) {
        const l = r.legs[i];
        c.push(l ? l.key : '', l ? l.te : '', l ? (l.dur / 86400).toFixed(3) : '', l ? l.elr.toFixed(4) : '',
          l ? (l.bdur / 86400).toFixed(5) : '', l ? (l.bend / 86400).toFixed(5) : '',
          l ? l.bsale : '', l ? (l.lastte / 86400).toFixed(5) : '',
          l ? l.t13 : '', l ? l.se0 : '', l ? l.shift : '',
          l ? (l.wait / 3600).toFixed(2) : '', l ? l.nsh : '');
      }
      lines.push(c.join(','));
    }
    writeFileSync(out, lines.join('\n'));
    console.log('\nwrote ' + out);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
