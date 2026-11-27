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
import { GEAR_REASK_LINE, GEAR_REASK_NO, GEAR_REASK_YES } from './gearReaskWords';

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

describe('the words are Jordan’s, from lib/gearReaskWords.ts', () => {
  const words = fs.readFileSync(path.join(__dirname, 'gearReaskWords.ts'), 'utf8');
  it('the approved line and answers, no placeholder left', () => {
    expect(words).not.toMatch(/PLACEHOLDER/);
    expect(GEAR_REASK_LINE).toBe(
      "You already share your search results with the planner's maintainer. We would also like to send which table answered, your delivery artifacts (metronome, compass, gusset) and earnings artifacts (necklace, totem, cube, ankh) with the stones set in them. Never your spare stones, never your player ID. Send these too?"
    );
    expect(GEAR_REASK_YES).toBe('Yes, send these too');
    expect(GEAR_REASK_NO).toBe('No, keep sharing as before');
  });
  it('says nothing about changing it in Setup: the box there is one tick, so that sentence would not be true', () => {
    expect(GEAR_REASK_LINE).not.toMatch(/change this/i);
  });
});
