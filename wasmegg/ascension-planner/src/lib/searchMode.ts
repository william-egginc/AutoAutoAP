/**
 * Simple or Advanced, per search screen (batch 3): Fastest to 490 TE's "How thorough" cards (Simple is
 * Smart search, Advanced the Full sweep) and Highest TE by a date's (Simple picks the routes around the
 * instant answer, Advanced is the chain editor). Remembered in this browser once the player picks one;
 * `null` for a player who never has, so each screen can choose its own default.
 */
export type SearchMode = 'simple' | 'advanced';
export type ModeTab = 'fastest' | 'by-date';

const KEY = 'aap-search-mode';

function readAll(): Partial<Record<ModeTab, SearchMode>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Partial<Record<ModeTab, SearchMode>> = {};
    for (const tab of ['fastest', 'by-date'] as const)
      if (v[tab] === 'simple' || v[tab] === 'advanced') out[tab] = v[tab] as SearchMode;
    return out;
  } catch {
    return {};
  }
}

/** The mode the player last picked on this screen, or null if they never have. */
export function readSearchMode(tab: ModeTab): SearchMode | null {
  return readAll()[tab] ?? null;
}

/** Remember the player's pick (a card clicked, not a link or a carry-on that switched for them). */
export function writeSearchMode(tab: ModeTab, mode: SearchMode): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [tab]: mode }));
  } catch {
    // Private mode or storage full: the choice lasts for this visit only.
  }
}
