/**
 * The Setup PIN card: Words' draft (21 Nov 2026) over UI's placeholders; Jordan's OK is needed before it ships. Wording only, so never
 * part of the result hash. No clock times here (a reset date is shown through the shared formatter, 12-hour).
 */
import type { PinFail } from '@/lib/pinCloud';

export const PIN_TITLE = 'PIN';
/** Pending label: the words only; PinCard draws the moving dots after it (AnimatedDots, Jordan 1 Nov 2026). */
export const PIN_WORKING = 'Checking your PIN, which takes a moment';
export const PIN_OFF_LINE = 'No PIN is set. Anyone who knows your player ID can change what is saved online for you.';
export const PIN_OPEN_LINE = 'Your PIN is on, and this browser is signed in.';
export const PIN_LOCKED_LINE = 'Your PIN is on, and this browser is signed out. What is saved online is not read or changed from here until you enter the PIN. Everything else still works.';
export const PIN_PRIVATE_NOTE = 'A private window, or clearing this browser\'s site data, signs you out.';

export const PIN_SET = 'Set a PIN';
export const PIN_CHANGE = 'Change PIN';
export const PIN_REMOVE = 'Remove PIN';
export const PIN_LOCK = 'Sign out of this browser';
export const PIN_ENTER = 'Enter PIN';
export const PIN_FORGOT = 'Forgot it';
export const PIN_CANCEL = 'Cancel';
export const PIN_SAVE = 'Save PIN';
export const PIN_UNLOCK = 'Unlock';

export const PIN_FIELD = '6-digit PIN';
export const PIN_AGAIN = 'The same PIN again';
export const PIN_NEW = 'New 6-digit PIN';
export const PIN_MISMATCH = 'The two PINs are not the same.';
export const PIN_SIX = 'A PIN is exactly 6 digits.';

export const PIN_REMOVE_ASK = 'Remove your PIN? Anyone who knows your player ID will be able to change what is saved online for you.';
export const PIN_REMOVE_YES = 'Remove';
export const PIN_REMOVE_NO = 'Keep it';

export const PIN_RECOVERY_TITLE = 'Your recovery code';
export const PIN_RECOVERY_LINE = 'Keep this code somewhere safe. It is shown only once, and it is the only way back in if you forget your PIN.';
export const PIN_RECOVERY_COPY = 'Copy';
export const PIN_RECOVERY_COPIED = 'Copied';
export const PIN_RECOVERY_DOWNLOAD = 'Download';
export const PIN_RECOVERY_SAVED = 'I saved it';
export const PIN_RECOVERY_DONE = 'Done';

export const PIN_FORGOT_TITLE = 'Forgot the PIN';
export const PIN_RECOVERY_FIELD = 'Recovery code';
export const PIN_RECOVER = 'Set a new PIN';
export const PIN_RESET_LINK = 'No code? Ask to delete what is saved online instead';
export const PIN_RESET_ASK = 'In 7 days, what is saved online for you will be deleted and you can start again. Until then, you can cancel from a browser that is signed in. Ask for the reset?';
export const PIN_RESET_YES = 'Ask for the reset';

export const pinResetBanner = (when: string): string =>
  `Someone asked to reset this account. What is saved online will be deleted on ${when}.`;
export const PIN_RESET_CANCEL = 'Cancel the reset';
export const PIN_RESET_CANCEL_HINT = 'Enter the PIN to cancel it.';

export const pinRevokedNote = (n: number): string =>
  n === 1 ? 'Your calendar link was turned off. You can make a new one when you are ready.' : `${n} calendar links were turned off. You can make new ones when you are ready.`;

/** How long to wait, from seconds: no clock time. */
export function pinWait(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return 'a while';
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} minutes`;
  const h = Math.round(seconds / 3600);
  return h === 1 ? '1 hour' : `${h} hours`;
}

/** A refused call in plain words; '' for none. */
export function pinErrorLine(error: '' | PinFail, retryAfter: number | null): string {
  switch (error) {
    case '':
      return '';
    case 'wrong':
      return 'That PIN is not right.';
    case 'limit':
      return `Too many tries. Wait ${pinWait(retryAfter)} and try again.`;
    case 'cooldown':
      return `A reset was cancelled a moment ago. Try again in ${pinWait(retryAfter)}.`;
    case 'exists':
      return 'This account already has a PIN. Choose Enter PIN instead.';
    case 'nopin':
      return 'This account has no PIN.';
    case 'session':
      return 'This browser is signed out. Enter your PIN again.';
    case 'rejected':
      return PIN_SIX;
    case 'off':
      return 'PINs are switched off right now. Try again later.';
    case 'offline':
      return 'No connection. Check it and try again.';
    default:
      return 'That did not work. Try again.';
  }
}
