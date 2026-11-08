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
  SAVE_ONLINE_LABEL,
  SAVE_ONLINE_LINE_OFF,
  SAVE_ONLINE_LINE_ON,
  SAVE_ONLINE_OFF_AFTER_DELETE,
  startTeBannerShort,
  startTeBannerWords,
} from './syncWords';
import { isWordingOnly } from './resultCodeHash';

describe('sync words', () => {
  it('the master Save online switch: label, on and off lines, and after a delete', () => {
    expect(SAVE_ONLINE_LABEL).toBe('Save online');
    expect(SAVE_ONLINE_LINE_ON).toBe(
      'Saved online, under a code made from your player ID, so every device shows the same: your followed routes, Setup and sharing choices, saved answers, starting TE, and Build-up tracker ticks and plan. Anyone who knows your player ID can see them.'
    );
    expect(SAVE_ONLINE_LINE_OFF).toBe('Off: this device saves nothing new online. What is already saved online stays until you delete it.');
    expect(SAVE_ONLINE_OFF_AFTER_DELETE).toBe('Save online is off on this device. Turn it on to start saving again.');
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
    expect(SYNC_DELETED).toBe('Deleted. Nothing is saved online for this account now, and Save online is off on this device.');
    expect(SYNC_DELETED_OTHER_DEVICES).toBe('Other devices will stop showing it once they reload.');
  });
  it('no player ID, and a wording-only file (out of the result code hash)', () => {
    expect(JSON.stringify([SAVE_ONLINE_LINE_ON, SYNC_DELETE_CONFIRM])).not.toMatch(/EI\d{16}/);
    expect(isWordingOnly('src/lib/syncWords.ts')).toBe(true);
  });
});
