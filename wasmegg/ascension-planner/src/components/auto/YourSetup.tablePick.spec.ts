/**
 * Setup › Sharing's "which table answered" tick (R10.1, 25 Nov 2026): one tick for this ping only, on by default, bound
 * to the `shareTableUse` consent, with "What is sent" like its siblings, its words from lib/tablePickWords.ts (Words
 * rewrites them; PLACEHOLDER until then), named with its state in the fold's closed line. The page's call is made once
 * the answer's table is chosen, not awaited, and not behind the share box.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharingSummaryWords } from '@/lib/layoutWords';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const tpl = (() => {
  const s = read('YourSetup.vue');
  return s.slice(s.indexOf('<template>'), s.indexOf('<script setup'));
})();

describe('Setup › Sharing: the table tick', () => {
  const card = tpl.slice(tpl.indexOf('data-testid="share-instant"'), tpl.indexOf('data-testid="setup-saved-online"'));
  it('inside the Sharing card, bound to the consent, with its own "What is sent"', () => {
    expect(card).toContain('data-testid="table-pick"');
    expect(card).toMatch(/<input[^>]*v-model="tablePickOn"[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*v-model="tablePickOn"/s);
    expect(card).toContain('data-testid="table-pick-what"');
    expect(card).toContain('id="table-pick-what-body"');
  });
  it('the words come from lib/tablePickWords.ts, not typed in the page', () => {
    expect(read('YourSetup.vue')).toMatch(/import \{[^}]*TABLE_PICK_LABEL[^}]*\} from '@\/lib\/tablePickWords'/);
    expect(card).toContain('{{ TABLE_PICK_LABEL }}');
    expect(card).toContain('{{ TABLE_PICK_WHAT }}');
  });
  it('the tick is the consent: on by default, a change is stored (setConsent through useConsent)', () => {
    const src = read('YourSetup.vue');
    expect(src).toMatch(/useConsent\('shareTableUse'\)/);
    expect(src).toMatch(/agreed: tablePickOn/);
  });
  it('the closed fold line names it with its state', () => {
    expect(sharingSummaryWords({ help: 'no', saveOnline: true, searchResults: false, instantWithRuns: false, tablePick: true })).toMatch(/· Table answered: on$/);
    expect(sharingSummaryWords({ help: 'no', saveOnline: true, tablePick: false })).toMatch(/· Table answered: off$/);
    expect(read('YourSetup.vue')).toMatch(/tablePick: /);
  });
});

describe('the page’s call', () => {
  const src = read('InstantRoute.vue');
  it('one call, after the table is chosen, not awaited, not under the share box', () => {
    expect(src).toMatch(/sendTablePick\(/);
    expect(src).not.toMatch(/await sendTablePick/);
    const at = src.indexOf('sendTablePick(');
    const around = src.slice(Math.max(0, at - 400), at);
    expect(around).not.toMatch(/keepSharing|share\.on|consentAgreed\('keepSharingChecks'\)/);
  });
  it('says kind, answered, the player’s own delivery key and noTable from the answer’s own fields', () => {
    const at = src.indexOf('sendTablePick(');
    const call = src.slice(at, src.indexOf(');', at));
    expect(call).toMatch(/kind:/);
    expect(call).toMatch(/answered: deliveryUsed\.value/);
    expect(call).toMatch(/delivery: playerDelivery\.value/);
    expect(call).toMatch(/noTable/);
    expect(call).not.toMatch(/stamp|stampHash|playerId|backup/i);
  });
});
