// The mission optimizer card's own words. Kept apart from the card so a spec can pin
// them and the loot-heavy panel need not be imported to read them.

/** What the Low/Medium/High/Max buttons set: how often the player will relaunch, which the game does not ask for. */
export const CADENCE_HEADING = 'How often I will launch';
export const CADENCE_NOTE = 'Your preference, not a game rule: how often you are willing to relaunch.';

export const bestAlternativeTitle = 'Best';
export const fitsAlternativeTitle = 'Fits your awake hours';

/** The launches a plan sends up in an hour the player is off. */
export function nightLaunchesText(count: number): string {
  if (count === 0) return 'Every launch is in your awake hours';
  return `${count} ${count === 1 ? 'launch' : 'launches'} in your hours off`;
}

/** The save the optimizer already uses is the loaded one; `when` is its time as the player reads it. */
export function loadedSaveLine(when: string): string {
  return `Using your loaded save${when ? ` from ${when}` : ''} for your ship levels, inventory and crafting level.`;
}

/** Under the hours when the plan starts in them: "Your plan starts at 1:04 AM, in your hours off. The Fits answer's first launch is at 7:00 AM, when you are next awake." */
export function startsInHoursOffLine(startsAt: string, firstLaunch: string): string {
  return `Your plan starts at ${startsAt}, in your hours off. The Fits answer's first launch is at ${firstLaunch}, when you are next awake.`;
}

/** On the Fits card when its chance reads the same as Best's. */
export const SAME_CHANCE_AS_BEST = 'Same chance as Best';

/** Whether two chances, as the card prints them, are the same. False while Best is not there yet. */
export function sameChanceAsBest(bestChance: string | null, fitsChance: string): boolean {
  return bestChance !== null && bestChance === fitsChance;
}
