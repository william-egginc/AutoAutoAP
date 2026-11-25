/** The re-ask line under the share box (components/auto/GearReask.vue): shown once, in both places the box lives. */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetConsents, setConsent, type StorageLike } from '@/composables/useConsent';
import { agreeGearDetail } from '@/lib/gearDetailConsent';
import { GEAR_REASK_LINE, GEAR_REASK_NO, GEAR_REASK_YES } from '@/lib/gearReaskWords';
import { renderHtml, textOf } from '@/test/renderComponent';
import GearReask from './GearReask.vue';

function mem(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) };
}
beforeEach(() => resetConsents(mem(), async id => `h-${id}`));
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('GearReask', () => {
  it('draws nothing unless a ticked box has not been asked', async () => {
    expect(await renderHtml(GearReask)).not.toContain('data-testid="gear-reask"');
    setConsent('keepSharingChecks', true);
    expect(await renderHtml(GearReask)).toContain('data-testid="gear-reask"');
    agreeGearDetail();
    expect(await renderHtml(GearReask)).not.toContain('data-testid="gear-reask"');
  });

  it('the line and two 44 px answers, all from lib/gearReaskWords.ts', async () => {
    setConsent('keepSharingChecks', true);
    const html = await renderHtml(GearReask);
    const text = textOf(html);
    expect(text).toContain(GEAR_REASK_LINE);
    expect(text).toContain(GEAR_REASK_YES);
    expect(text).toContain(GEAR_REASK_NO);
    expect(html).toContain('data-testid="gear-reask-yes"');
    expect(html).toContain('data-testid="gear-reask-no"');
    expect(html.match(/min-h-\[44px\]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('shown under the box under a result and in Your setup › Sharing; the record fields wait on the same consent', () => {
    expect(read('InstantShareCheck.vue')).toContain('<GearReask');
    expect(read('YourSetup.vue')).toContain('<GearReask');
    expect(read('InstantRoute.vue')).toContain("consentAgreed('shareGearDetail')");
  });
});
