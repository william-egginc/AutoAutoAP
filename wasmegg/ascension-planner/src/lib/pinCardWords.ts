/**
 * The Setup PIN card: PLACEHOLDER strings (UI, 21 Nov 2026), every one for Words to write or replace. Wording only, so never
 * part of the result hash. No clock times here (a reset date is shown through the shared formatter, 12-hour).
 */
import type { PinFail } from '@/lib/pinCloud';

export const PIN_TITLE = 'PIN';
export const PIN_CHECKING = 'Checking…';
export const PIN_WORKING = 'Checking… this takes a moment.';
export const PIN_OFF_LINE = 'No PIN. Anyone with your player ID can change what is saved online for it.';
export const PIN_OPEN_LINE = 'A PIN is on. This browser is signed in.';
export const PIN_LOCKED_LINE = 'A PIN is on. This browser is signed out, so what is saved online is not read or changed here. Everything else still works.';
export const PIN_PRIVATE_NOTE = 'A private window, or cleared site data, signs you out.';

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

export const PIN_REMOVE_ASK = 'Remove the PIN? Anyone with your player ID can then change what is saved online.';
export const PIN_REMOVE_YES = 'Remove';
export const PIN_REMOVE_NO = 'Keep it';

export const PIN_RECOVERY_TITLE = 'Your recovery code';
export const PIN_RECOVERY_LINE = 'Keep this somewhere safe. It is shown once. It is the only way back in if you forget the PIN.';
export const PIN_RECOVERY_COPY = 'Copy';
export const PIN_RECOVERY_COPIED = 'Copied';
export const PIN_RECOVERY_DOWNLOAD = 'Download';
export const PIN_RECOVERY_SAVED = 'I saved it';
export const PIN_RECOVERY_DONE = 'Done';

export const PIN_FORGOT_TITLE = 'Forgot the PIN';
export const PIN_RECOVERY_FIELD = 'Recovery code';
export const PIN_RECOVER = 'Set a new PIN';
export const PIN_RESET_LINK = 'No code? Ask to delete what is saved online instead';
export const PIN_RESET_ASK = 'In 7 days what is saved online for this account is deleted, and you can start again. You can cancel in that time from a browser that is signed in. Ask?';
export const PIN_RESET_YES = 'Ask for the reset';

export const pinResetBanner = (when: string): string =>
  `Someone asked to reset this account. What is saved online will be deleted on ${when}.`;
export const PIN_RESET_CANCEL = 'Cancel the reset';
export const PIN_RESET_CANCEL_HINT = 'Enter the PIN to cancel it.';

export const pinRevokedNote = (n: number): string =>
  n === 1 ? 'Your calendar link was turned off. You can make a new one.' : `${n} calendar links were turned off. You can make a new one.`;

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
      return 'This account already has a PIN. Enter it instead.';
    case 'nopin':
      return 'This account has no PIN.';
    case 'session':
      return 'You are signed out. Enter the PIN again.';
    case 'rejected':
      return PIN_SIX;
    case 'off':
      return 'PINs are off on the server right now.';
    case 'offline':
      return 'No connection. Try again.';
    default:
      return 'That did not work. Try again.';
  }
}
