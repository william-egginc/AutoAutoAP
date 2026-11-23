// The mission optimizer card's own words (DRAFT: Words owns the final text). Kept apart from the card so a spec can pin
// them and the loot-heavy panel need not be imported to read them.

/** What the Low/Medium/High/Max buttons set: how often the player will relaunch, which the game does not ask for. */
export const CADENCE_HEADING = 'How often I will launch';
export const CADENCE_NOTE = 'Your preference, not a game rule: how often you are willing to relaunch a slot.';

/** Shown to a Standard permit save: the optimizer plans for Pro and does not model Standard. */
export const STANDARD_PERMIT_NOTE =
  'This save has the Standard permit. The optimizer plans as if you had the Pro permit (three slots, every ship), so some ships here may not be open to you.';

export const bestAlternativeTitle = 'Best';
export const fitsAlternativeTitle = 'Fits your awake hours';

/** The launches a plan sends up in an hour the player is off. */
export function nightLaunchesText(count: number): string {
  if (count === 0) return 'Every launch is in your awake hours';
  return `${count} ${count === 1 ? 'launch' : 'launches'} in your hours off`;
}
