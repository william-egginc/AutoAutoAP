/**
 * dead-deep-6 of the code review (22 Nov 2026): props no parent passes, or that every parent passes with the same value, and the
 * branches behind them. RouteResultCard `source` and `canSave`; ShareResult `compact` and `heading`; StartTimeFinder `bare`;
 * SaveAgeStrip `slim`; ConsentBox `withdrawLabel` and its unheard `withdrawn` emit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const script = (src: string) => src.slice(src.indexOf('<script setup'));
const tpl = (src: string) => src.slice(0, src.indexOf('<script setup'));

describe('RouteResultCard: no source line', () => {
  const src = read('RouteResultCard.vue');
  it('source is gone', () => {
    expect(script(src)).not.toMatch(/\bsource\??:/);
    expect(tpl(src)).not.toContain('v-if="source"');
    // `canSave` stays: both mounts pass it (always true), but the specs render the card without it (code review said no
    // parent passes it; they do, so only `source` is dead).
    expect(script(src)).toMatch(/canSave\?: boolean;/);
  });
});

describe('ShareResult: always the compact form', () => {
  const src = read('ShareResult.vue');
  it('no compact or heading prop', () => {
    expect(script(src)).not.toMatch(/\bcompact\b/);
    expect(script(src)).not.toMatch(/\bheading\b/);
    expect(tpl(src)).not.toMatch(/\bcompact &&|:foldable="compact"|\{\{ heading \}\}/);
  });
  it('the mounts do not pass compact', () => {
    for (const f of ['DeadlinePanel.vue', 'ChainSearchPanel.vue', 'InsanePanel.vue'])
      expect(read(f), f).not.toMatch(/<ShareResult[^>]*\bcompact\b/s);
  });
});

describe('StartTimeFinder: always the bare form', () => {
  it('no bare prop, and its one mount does not pass it', () => {
    const src = read('StartTimeFinder.vue');
    expect(src).not.toMatch(/\bbare\b/);
    expect(read('StartTimeCard.vue')).not.toMatch(/<StartTimeFinder[^>]*\bbare\b/);
  });
});

describe('SaveAgeStrip: always slim', () => {
  it('no slim prop, and the mounts do not pass it', () => {
    expect(read('../myruns/SaveAgeStrip.vue')).not.toMatch(/\bslim\b/);
    for (const f of ['AutoSaveStrip.vue', '../layout/SaveSide.vue', '../myruns/SaveHeadHelp.vue'])
      expect(read(f), f).not.toMatch(/<SaveAgeStrip[^>]*\bslim\b/s);
  });
});

describe('ConsentBox: one Withdraw word, no unheard emit', () => {
  const src = read('ConsentBox.vue');
  it('withdrawLabel and the withdrawn emit are gone (the local withdrawn flag stays: it shows the note)', () => {
    expect(src).not.toContain('withdrawLabel');
    expect(src).not.toMatch(/emit\('withdrawn'\)/);
    expect(src).not.toMatch(/defineEmits<\{ withdrawn/);
    expect(tpl(src)).toContain('>\n          Withdraw\n        </button>');
  });
});
