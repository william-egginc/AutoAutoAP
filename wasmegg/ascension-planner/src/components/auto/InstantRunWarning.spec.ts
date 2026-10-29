/** The instant answer's memory warning sits directly under the button that asked (9 Oct review: it
 *  showed at the top of the card, by "Saved from…", while Check exactly was pressed further down). */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import InstantRunWarning from './InstantRunWarning.vue';
import { warnHere, type WarnAt } from '@/search/instantDeferral';
import { renderHtml, textOf } from '@/test/renderComponent';

describe('InstantRunWarning', () => {
  it('says what was asked, with its three choices', async () => {
    const anyway = textOf(await renderHtml(InstantRunWarning, { at: 'anyway' }));
    expect(anyway).toContain('A search is running. Working out the instant answer now runs extra workers alongside it');
    expect(anyway).toContain("Run it anyway Don't ask again, just warn me Cancel");
    const again = textOf(await renderHtml(InstantRunWarning, { at: 'again' }));
    expect(again).toContain('Working out the instant answer now runs extra workers');
  });

  it("names no event 'once' (Vue reads an onOnce listener as a .once modifier and the card failed to render)", async () => {
    const emits = (InstantRunWarning as { emits?: string[] }).emits ?? [];
    expect(emits).toEqual(['go', 'remember', 'cancel']);
    for (const e of emits) expect(/^once$|Once$/.test(e)).toBe(false);
    const noop = () => {};
    const html = await renderHtml(InstantRunWarning, { at: 'again', onGo: noop, onRemember: noop, onCancel: noop });
    expect(textOf(html)).toContain('Run it anyway');
  });

  it('shows at the spot that asked, and only there', () => {
    const spots: WarnAt[] = ['again', 'anyway'];
    for (const at of spots) {
      const ask = { force: at === 'again', at };
      expect(spots.filter(s => warnHere(ask, s))).toEqual([at]);
    }
    expect(spots.some(s => warnHere(null, s))).toBe(false);
  });

  it('is placed right after each button that can ask, in InstantRoute.vue', () => {
    const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
    const template = src.slice(0, src.indexOf('<script'));
    const presses: [string, WarnAt][] = [
      ["pressRun(true, 'again')", 'again'],
      ["pressRun(false, 'anyway')", 'anyway'],
    ];
    for (const [press, at] of presses) {
      const button = template.indexOf(press);
      expect(button, press).toBeGreaterThan(0);
      const warning = template.indexOf(`warnHere(confirming, '${at}')`);
      expect(warning, at).toBeGreaterThan(button);
      // Nothing but the button's own row (its sibling "Simulate this plan") in between: no other
      // block of the card, and no other asking button.
      const between = template.slice(button, warning);
      expect(between.match(/<\/button>/g)?.length ?? 0, at).toBeLessThanOrEqual(2);
      expect(/press(Run|Check)\(/.test(between.slice(press.length)), at).toBe(false);
    }
    // One warning per spot, no leftover one at the top of the card. (Check exactly's two went with it, 23 Oct 2026.)
    expect(template.match(/<InstantRunWarning/g)).toHaveLength(2);
    expect(template).not.toContain('pressCheck(');
    expect(template).not.toContain('v-if="confirming"');
  });
});
