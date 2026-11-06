/**
 * What the planner says about what goes online (Jordan, 6 Nov 2026: "correct the wording, with a '?' or something
 * explaining that"). The old lines said the player ID and save are "never sent" and that choices are "kept in this
 * browser"; the code also saves the followed route, Setup and sharing choices (with the credit name) and the newest
 * instant answers online, under a SHA-256 hash of the player ID (src/lib/followCloud.ts). Wording only (a *Words.ts
 * file is out of the result code hash, lib/resultCodeHash.ts `isWordingOnly`).
 */

/** The short line beside the Leaderboard choices: true of a shared run, and nothing else is claimed. */
export const NEVER_WITH_A_RUN = 'Your player ID and save are never sent with a shared run.';

/** The "?" control: its label for screen readers and the tip's lines, one fact each. */
export const PRIVACY_TIP_LABEL = 'What goes online, and what never does';
export const PRIVACY_TIP_LINES = [
  'Saved online, under a code made from your player ID: the route you follow, your Setup and sharing choices (with the name you are credited as), and your newest instant answers. The same code on another device shows them.',
  'The code is a SHA-256 hash of your ID. It is scrambled, not anonymous: it is not salted yet, so anyone who knows an ID can work out its code, and read or change what is saved under it. A salted code is planned.',
  'On the Leaderboard: only what you tick. Never your player ID or your save.',
  "Never leaves your browser: your full save, with your ID. To load it, your ID goes to the game's server through the planner's relay; the planner's server never gets the save.",
];

/** Science's "The leaderboard, and what is sent": the two sentences that said "Nothing is sent unless you tick it". */
export const SCIENCE_NOTHING_UNLESS = 'Nothing goes to the Leaderboard unless you tick it.';
export const SCIENCE_CREDIT_NAME =
  'Your player ID and your save are never sent with it. You can send anonymously or under a name: the "Credit me as" name is one per account, kept in this browser and saved online with your Setup, so a name typed on one screen is already there on the others.';

/** Consent box, "Remember my choice for this account": where the choice is kept. */
export const REMEMBER_KEPT = ' (kept in this browser and saved online until you withdraw it)';
