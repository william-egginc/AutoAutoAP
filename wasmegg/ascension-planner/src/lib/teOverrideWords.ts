/**
 * The starting-TE override banner's words (components/auto/TeOverrideBanner.vue; spec-overridebanner, 7 Nov 2026).
 * DRAFT from Words (7 Nov 2026), Jordan's OK still to come; the "higher" line is a placeholder Words may replace.
 * Players never read the word "override" (Words): the setting is "a typed starting TE" to them.
 * Wording only, so never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 */

/**
 * The banner's line. `typedTE` is the typed starting TE (the five eggs' claimed TE summed); `saveTE` the save's own TE,
 * or null when the save holds no virtue progress. Lower than the save: the answers start behind the player. Higher:
 * a deliberate what-if, said neutrally. The same, or the save's unknown: no comparison.
 */
export function teOverrideBannerLine(typedTE: number, saveTE: number | null): string {
  if (saveTE !== null && typedTE < saveTE)
    return `Your typed starting TE (${typedTE}) is lower than your save's TE (${saveTE}), so the answers here start behind where you are.`;
  if (saveTE !== null && typedTE > saveTE)
    return `Your answers start from a typed TE (${typedTE}), not your save's (${saveTE}).`;
  return `Your answers start from a typed TE (${typedTE}).`;
}

/** The banner's button: does what Virtue Progress's Remove Override does. */
export const TE_OVERRIDE_REMOVE = "Use my save's TE";
