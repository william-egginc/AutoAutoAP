/** The words for saving the starting TE, tracker ticks and plan online (7 Nov 2026), pinned word for word. */
import { describe, expect, it } from 'vitest';
import {
  START_TE_USE_SAVE,
  SYNC_DELETED,
  SYNC_DELETED_OTHER_DEVICES,
  SYNC_DELETE_CONFIRM,
  SYNC_DELETE_LABEL,
  SYNC_DELETE_NO,
  SYNC_DELETE_YES,
  SYNC_KEPT,
  SYNC_SETUP_CLAUSE,
  startTeBannerShort,
  startTeBannerWords,
} from './syncWords';
import { isWordingOnly } from './resultCodeHash';

describe('sync words', () => {
  it('the Setup clause and retention', () => {
    expect(SYNC_SETUP_CLAUSE).toBe(
      'Also saved online: the starting TE you typed, your Build-up tracker ticks and its plan (what to buy and when), so every device shows the same. Anyone who knows your player ID can see them.'
    );
    expect(SYNC_KEPT).toBe('Kept until you delete it.');
  });
  it('the banner counts the TE not yet claimed, and says nothing about it when there is none', () => {
    expect(startTeBannerWords(197, 198, 1)).toBe(
      "Your typed starting TE (197) is lower than your save's TE (198, counting 1 not yet claimed), so the answers here start behind where you are."
    );
    expect(startTeBannerWords(197, 198, 0)).toBe(
      "Your typed starting TE (197) is lower than your save's TE (198), so the answers here start behind where you are."
    );
    expect(startTeBannerShort(197, 198, 2)).toBe("Your typed starting TE (197) is lower than your save's (198, counting 2 not yet claimed).");
    expect(START_TE_USE_SAVE).toBe("Use my save's TE");
    expect(startTeBannerWords(1, 2, 0)).not.toContain('override');
  });
  it('the delete button says it deletes everything saved online, and what stays', () => {
    expect(SYNC_DELETE_LABEL).toBe('Delete everything saved online for this account');
    expect(SYNC_DELETE_CONFIRM).toBe(
      "This deletes your followed routes, Setup and sharing choices, instant answers, starting TE, tracker ticks and plan from the planner's server. Your save and what is kept in this browser stay. It cannot be undone."
    );
    expect([SYNC_DELETE_YES, SYNC_DELETE_NO]).toEqual(['Delete', 'Keep it']);
    expect(SYNC_DELETED).toBe('Deleted. Nothing is saved online for this account now.');
    expect(SYNC_DELETED_OTHER_DEVICES).toBe('Other devices will stop showing it once they reload.');
  });
  it('no player ID, and a wording-only file (out of the result code hash)', () => {
    expect(JSON.stringify([SYNC_SETUP_CLAUSE, SYNC_DELETE_CONFIRM])).not.toMatch(/EI\d{16}/);
    expect(isWordingOnly('src/lib/syncWords.ts')).toBe(true);
  });
});
