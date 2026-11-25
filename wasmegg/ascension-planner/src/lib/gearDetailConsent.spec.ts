/**
 * The share box's one-time re-ask (R10, 24 Nov 2026, Jordan): a player who ticked "Share my search results" before the
 * gear fields existed is asked once more before the page sends them (which table answered, the delivery and earnings
 * sets, the stones slotted in each). One box: the consent id `shareGearDetail`, off until agreed. The words are a
 * placeholder until Words' rev 3 line is approved (lib/gearReaskWords.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetConsents, setConsent, consentRecord, consentAgreed, type StorageLike } from '@/composables/useConsent';
import { createInstantShare } from '@/composables/useInstantShare';
import {
  agreeGearDetail,
  declineGearDetail,
  gearReaskNeeded,
} from './gearDetailConsent';

function mem(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) };
}
beforeEach(() => resetConsents(mem(), async id => `h-${id}`));

describe('the re-ask is for a ticked box that was never asked about the gear fields', () => {
  it('nothing ticked: no re-ask, nothing allowed', () => {
    expect(gearReaskNeeded()).toBe(false);
  });

  it('an old ticked box (no shareGearDetail record): asked once, and nothing is allowed yet', () => {
    setConsent('keepSharingChecks', true);
    expect(consentRecord('shareGearDetail').at).toBe(0);
    expect(gearReaskNeeded()).toBe(true);
  });

  it('agreeing sets shareGearDetail and allows the fields; the question is not asked again', () => {
    setConsent('keepSharingChecks', true);
    agreeGearDetail();
    expect(consentAgreed('shareGearDetail')).toBe(true);
    expect(gearReaskNeeded()).toBe(false);
  });

  it('declining is kept too: asked once, never allowed, the box itself stays ticked', () => {
    setConsent('keepSharingChecks', true);
    declineGearDetail();
    expect(gearReaskNeeded()).toBe(false);
    expect(consentAgreed('keepSharingChecks')).toBe(true);
  });

  it('a yes needs the box ticked: unticking it stops the fields whatever shareGearDetail says', () => {
    setConsent('keepSharingChecks', true);
    agreeGearDetail();
    setConsent('keepSharingChecks', false);
    expect(gearReaskNeeded()).toBe(false);
  });
});

describe('ticking the box from now on is one answer (the box says what is sent)', () => {
  it('ticking agrees shareGearDetail too, so a new tick is not asked twice', () => {
    const s = createInstantShare();
    s.on.value = true;
    expect(consentAgreed('shareGearDetail')).toBe(true);
    expect(gearReaskNeeded()).toBe(false);
  });

  it('unticking withdraws both', () => {
    const s = createInstantShare();
    s.on.value = true;
    s.on.value = false;
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect(consentAgreed('shareGearDetail')).toBe(false);
  });
});

describe('the words are a placeholder, kept out of the component', () => {
  const words = fs.readFileSync(path.join(__dirname, 'gearReaskWords.ts'), 'utf8');
  it('lib/gearReaskWords.ts says it is a placeholder', () => {
    expect(words).toMatch(/PLACEHOLDER/);
  });
});
