/**
 * The Setup PIN card (R10, UI 21 Nov 2026; contract ~/code/aaap-tools/notes/pin-ui-contract-2026-11-21.md): one card per account,
 * built on composables/usePinAccount. States: unavailable hides it; unknown/checking is quiet; off offers Set a PIN; locked offers Enter
 * PIN and Forgot it; open offers Change, Remove and Lock. The recovery code shows once behind an "I saved it" gate. A pending reset is
 * a banner. Specs draw it with a fake account (refs and spies), so no network and no PIN are involved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import PinCard from './PinCard.vue';
import * as W from '@/lib/pinCardWords';

const src = fs.readFileSync(path.resolve(__dirname, 'PinCard.vue'), 'utf8');

function fake(o: Partial<Record<'state' | 'error' | 'retryAfter' | 'busy' | 'resetAt' | 'recovery' | 'revokedLinks', unknown>> = {}) {
  const acts = Object.fromEntries(
    ['check', 'enter', 'setPin', 'changePin', 'removePin', 'recover', 'startReset', 'cancelReset', 'ackRecovery', 'lock'].map(k => [k, vi.fn(async () => true)])
  );
  return {
    state: ref(o.state ?? 'off'),
    error: ref(o.error ?? ''),
    retryAfter: ref(o.retryAfter ?? null),
    busy: ref(o.busy ?? false),
    resetAt: ref(o.resetAt ?? null),
    recovery: ref(o.recovery ?? null),
    revokedLinks: ref(o.revokedLinks ?? 0),
    ...acts,
  };
}
const tag = (h: string, id: string): string => (h.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`)) ?? [''])[0];
const draw = (acct: ReturnType<typeof fake>, props: Record<string, unknown> = {}) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  return renderHtml(PinCard, { account: acct, ...props }, {}, [pinia]);
};

describe('what the card shows for each state', () => {
  it('unavailable: nothing at all', async () => {
    expect(await draw(fake({ state: 'unavailable' }))).not.toContain('data-testid="pin-card"');
  });
  it('unknown and checking: nothing at all (a flaky connection leaves the account unknown, and no PIN service may be behind it)', async () => {
    for (const state of ['unknown', 'checking']) {
      const h = await draw(fake({ state }));
      expect(h, state).not.toContain('data-testid="pin-card"');
      expect(textOf(h), state).not.toContain(W.PIN_TITLE);
    }
  });
  it('it still asks once when it mounts, so an off/locked/open account then shows it, and it does not ask again by itself', () => {
    expect(src).toMatch(/onMounted\(\(\) => void acct\.check\(\)\)/);
    // The one check() is the mount's: no watch re-asks (a flaky connection would loop). The one watch is the recovery guard's.
    expect(src.match(/acct\.check\(\)/g)).toHaveLength(1);
  });
  it('off: Set a PIN', async () => {
    const h = await draw(fake({ state: 'off' }));
    expect(textOf(h)).toContain(W.PIN_OFF_LINE);
    expect(h).toContain('data-testid="pin-set-open"');
    expect(h).not.toContain('data-testid="pin-change-open"');
  });
  it('locked: Enter PIN with Forgot it, and the signed-out note, no Change or Remove', async () => {
    const h = await draw(fake({ state: 'locked' }));
    expect(textOf(h)).toContain(W.PIN_LOCKED_LINE);
    expect(h).toContain('data-testid="pin-enter"');
    expect(h).toContain('data-testid="pin-forgot-open"');
    expect(h).not.toContain('data-testid="pin-change-open"');
    expect(h).not.toContain('data-testid="pin-remove-open"');
    expect(textOf(h)).toContain(W.PIN_PRIVATE_NOTE);
  });
  it('open: Change, Remove and Sign out of this browser', async () => {
    const h = await draw(fake({ state: 'open' }));
    expect(h).toContain('data-testid="pin-change-open"');
    expect(h).toContain('data-testid="pin-remove-open"');
    expect(h).toContain('data-testid="pin-lock"');
    expect(h).not.toContain('data-testid="pin-set-open"');
  });
});

describe('the forms', () => {
  it('Set: two 6-digit boxes that are not saved, remembered or logged', async () => {
    const h = await draw(fake({ state: 'off' }), { startAt: 'set' });
    const boxes = h.match(/<input[^>]*data-testid="pin-box"[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(2);
    for (const b of boxes) {
      expect(b).toContain('type="password"');
      expect(b).toContain('inputmode="numeric"');
      expect(b).toContain('maxlength="6"');
      expect(b).toContain('autocomplete="new-password"');
    }
  });
  it('Enter: one box, current-password autocomplete off', async () => {
    const h = await draw(fake({ state: 'locked' }));
    const boxes = h.match(/<input[^>]*data-testid="pin-box"[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toContain('inputmode="numeric"');
    expect(boxes[0]).toMatch(/autocomplete="(current-password|off)"/);
  });
  it('Forgot: the recovery code box, a new PIN twice, and the 7-day reset way out', async () => {
    const h = await draw(fake({ state: 'locked' }), { startAt: 'forgot' });
    expect(h).toContain('data-testid="pin-recovery-box"');
    expect((h.match(/data-testid="pin-box"/g) ?? []).length).toBe(2);
    expect(textOf(h)).toContain(W.PIN_RESET_LINK);
  });
  it('Remove asks first', async () => {
    const h = await draw(fake({ state: 'open' }), { startAt: 'remove' });
    expect(textOf(h)).toContain(W.PIN_REMOVE_ASK);
    expect(h).toContain('data-testid="pin-remove-yes"');
  });
  it('every button is a 44 px target on a phone: the shared button classes carry it', () => {
    for (const k of ['BTN', 'PRIMARY', 'LINK']) expect(src).toMatch(new RegExp(`const ${k} =\\s*'[^']*min-h-\\[44px\\] sm:min-h-0`));
    for (const id of ['pin-set-open', 'pin-change-open', 'pin-remove-open', 'pin-lock', 'pin-forgot-open', 'pin-submit', 'pin-reset-yes', 'pin-recovery-done', 'pin-remove-yes']) {
      expect(src).toMatch(new RegExp(`:class="(BTN|PRIMARY|LINK)"[^>]*data-testid="${id}"|data-testid="${id}"[^>]*:class="(BTN|PRIMARY|LINK)"`));
    }
  });
});

describe('busy: the slow hash', () => {
  it('buttons are disabled and a "Checking…" status is read out while an action runs', async () => {
    const h = await draw(fake({ state: 'locked', busy: true }));
    expect(textOf(h)).toContain(W.PIN_WORKING);
    expect(tag(h, 'pin-submit')).toMatch(/\bdisabled\b/);
    expect(h).toMatch(/role="status"/);
  });
});

describe('errors', () => {
  it('a refusal is a line under the form, announced', async () => {
    const h = await draw(fake({ state: 'locked', error: 'wrong' }));
    expect(textOf(h)).toContain(W.pinErrorLine('wrong', null));
    expect(h).toMatch(/role="alert"[^>]*data-testid="pin-error"|data-testid="pin-error"[^>]*role="alert"/);
  });
  it('a limit names the wait', async () => {
    const h = await draw(fake({ state: 'locked', error: 'limit', retryAfter: 600 }));
    expect(textOf(h)).toContain('10 minutes');
  });
});

describe('the recovery code: once, behind a gate', () => {
  it('shows the code in its own step, with Copy and Download, and Done disabled until "I saved it"', async () => {
    const h = await draw(fake({ state: 'open', recovery: 'ABCD2345EFGH6723' }));
    expect(h).toContain('data-testid="pin-recovery"');
    expect(textOf(h)).toContain('ABCD 2345 EFGH 6723');
    expect(h).toContain('data-testid="pin-recovery-copy"');
    expect(h).toContain('data-testid="pin-recovery-download"');
    expect(h).toMatch(/<input[^>]*type="checkbox"[^>]*data-testid="pin-saved"/);
    expect(tag(h, 'pin-recovery-done')).toMatch(/\bdisabled\b/);
    expect(h).not.toContain('data-testid="pin-change-open"');
  });
  it('says how many calendar links were turned off, when any were', async () => {
    const h = await draw(fake({ state: 'open', recovery: 'ABCD2345EFGH6723', revokedLinks: 2 }));
    expect(textOf(h)).toContain(W.pinRevokedNote(2));
    const none = await draw(fake({ state: 'open', recovery: 'ABCD2345EFGH6723', revokedLinks: 0 }));
    expect(textOf(none)).not.toContain('calendar link');
  });
  it('the code is never written to storage, a URL, the console or the page title', () => {
    expect(src).not.toMatch(/localStorage|sessionStorage|console\./);
    expect(src).not.toMatch(/location\.(href|hash)\s*=/);
    expect(src).toContain('ackRecovery');
  });
});

describe('a pending reset', () => {
  const AT = Date.UTC(2026, 10, 28, 16);
  it('is a banner with the deletion date; Cancel when signed in, "Enter the PIN" when not', async () => {
    const open = await draw(fake({ state: 'open', resetAt: AT }));
    expect(open).toContain('data-testid="pin-reset-banner"');
    expect(open).toContain('data-testid="pin-reset-cancel"');
    expect(textOf(open)).toMatch(/will be deleted on .*2026/);
    const locked = await draw(fake({ state: 'locked', resetAt: AT }));
    expect(locked).toContain('data-testid="pin-reset-banner"');
    expect(locked).not.toContain('data-testid="pin-reset-cancel"');
    expect(textOf(locked)).toContain(W.PIN_RESET_CANCEL_HINT);
  });
  it('no banner without one', async () => {
    expect(await draw(fake({ state: 'open' }))).not.toContain('pin-reset-banner');
  });
});

describe('where it lives', () => {
  const setup = fs.readFileSync(path.resolve(__dirname, 'YourSetup.vue'), 'utf8');
  it('Setup mounts it after the calendar card, keyed by the account', () => {
    expect(setup).toMatch(/<CalendarFeedSetup[^>]*\/>\s*(<!--[\s\S]*?-->\s*)?<PinCard :key="calendarAccount"/);
  });
  it('it checks the account when it mounts and when the account changes', () => {
    expect(src).toMatch(/onMounted\([\s\S]{0,120}check\(\)/);
  });
  it('PIN boxes are cleared after use', () => {
    expect(src).toMatch(/clearBoxes\(\)/);
  });
});

describe('pending labels draw their dots (Jordan, 1 Nov 2026; components/pendingDots.spec.ts)', () => {
  it('the words files hold no typed ellipsis: the dots are AnimatedDots', () => {
    const words = fs.readFileSync(path.resolve(__dirname, '../../lib/pinCardWords.ts'), 'utf8');
    expect(words.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')).not.toMatch(/…|\.\.\./);
  });
  it('the slow-hash hint is a visible status with the moving dots, while busy only', async () => {
    const busy = await draw(fake({ state: 'locked', busy: true }));
    expect(busy).toMatch(/<p[^>]*role="status"[^>]*data-testid="pin-working"[^>]*>[\s\S]*?animated-dots/);
    const idle = await draw(fake({ state: 'locked' }));
    expect(idle).toMatch(/data-testid="pin-working"><\/p>|data-testid="pin-working"><!---->/);
    expect(textOf(idle)).not.toContain(W.PIN_WORKING);
  });
});


describe('the recovery code survives closing Setup (QA, 21 Nov 2026), and a reload or closed tab asks first', () => {
  it('Setup closing unmounts the card; drawing it again for the same account still shows the code and the gate', async () => {
    const acct = fake({ state: 'open', recovery: 'ABCD2345EFGH6723' });
    const first = await draw(acct);
    const again = await draw(acct);
    for (const h of [first, again]) {
      expect(h).toContain('data-testid="pin-recovery"');
      expect(textOf(h)).toContain('ABCD 2345 EFGH 6723');
    }
    expect((acct as unknown as { ackRecovery: ReturnType<typeof vi.fn> }).ackRecovery).not.toHaveBeenCalled();
  });
  it('the card says a code is waiting to be saved, and that it is done once acknowledged', () => {
    expect(src).toMatch(/watch\(\s*\(\) => !!acct\.recovery\.value/);
    expect(src).toContain('setRecoveryPending(');
  });
  it('the page asks before a reload or a closed tab while a code is waiting (App.vue installs it once)', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.vue'), 'utf8');
    expect(app).toContain('installRecoveryLeaveGuard()');
  });

  it('the recovery code Download: anchor in the page while it clicks, the blob URL kept for a while (Safari; rel-ui-3, 22 Nov 2026)', () => {
    const body = src.slice(src.indexOf('function downloadCode'), src.indexOf('onMounted(() => void acct.check())'));
    expect(body).toMatch(/document\.body\.appendChild\(link\);\s*link\.click\(\);\s*link\.remove\(\);/);
    expect(body).toMatch(/setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 10_?000\)/);
    expect(body).not.toMatch(/link\.click\(\);\s*URL\.revokeObjectURL/);
  });
});
