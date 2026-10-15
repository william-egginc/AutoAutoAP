/**
 * The one consent box (ConsentBox.vue; Jordan, 15 Oct: "consent, everywhere"): folded to one line once
 * agreed, Change, Done, Withdraw, "Remember my choice for this account", and the same box on every
 * consent in the app with its words unchanged. Server renders (no DOM): "clicked" is the box's own `open`
 * set through its setup state, as in FindBar.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import ConsentBox from './ConsentBox.vue';
import { textOf } from '@/test/renderComponent';
import { resetConsents, setConsentRemember } from '@/composables/useConsent';

const slots = {
  summary: () => h('span', 'You agreed to the thing'),
  before: () => h('p', 'BEFORE'),
  text: () => h('span', 'I acknowledge THE TEXT'),
  after: () => h('p', 'AFTER'),
  aside: () => h('p', 'ASIDE'),
};

async function render(props: Record<string, unknown>, open?: boolean): Promise<string> {
  const app = createSSRApp({ render: () => h(ConsentBox, { modelValue: false, ...props }, slots) });
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (open !== undefined && this.$.type.__file?.endsWith('/ConsentBox.vue'))
        Object.assign(this.$.setupState, { open });
    },
  });
  return renderToString(app);
}

beforeEach(() => resetConsents(null));

describe('ConsentBox', () => {
  it('not agreed: the checkbox and the words, no summary, no footer', async () => {
    const html = await render({ consentId: 'leaderboard' });
    const t = textOf(html);
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(t).toContain('I acknowledge THE TEXT');
    expect(t).toMatch(/BEFORE.*I acknowledge THE TEXT.*AFTER.*ASIDE/);
    expect(html).not.toContain('consent-summary');
    expect(html).not.toContain('consent-withdraw');
    expect(html).not.toContain('consent-done');
    expect(html).not.toContain('consent-remember');
  });

  it('agreed and remembered from before: ONE line, ✓ summary · Change, the aside still shown', async () => {
    const html = await render({ modelValue: true, consentId: 'leaderboard' });
    const t = textOf(html);
    expect(html).toContain('data-testid="consent-summary"');
    expect(html).toContain('data-testid="consent-change"');
    expect(t).toMatch(/^✓ You agreed to the thing Change ASIDE$/);
    expect(t).not.toContain('THE TEXT');
    expect(t).not.toContain('BEFORE');
    expect(t).not.toContain('AFTER');
  });

  it('Change: the full words again, with Remember my choice, Withdraw and Done', async () => {
    const html = await render({ modelValue: true, consentId: 'leaderboard' }, true);
    const t = textOf(html);
    expect(html).not.toContain('consent-summary');
    expect(t).toContain('I acknowledge THE TEXT');
    expect(html).toContain('data-testid="consent-remember"');
    expect(t).toContain('Remember my choice for this account (kept in this browser until you withdraw it)');
    expect(html).toMatch(/data-testid="consent-remember"[^>]*checked|checked[^>]*data-testid="consent-remember"/);
    expect(html).toContain('data-testid="consent-withdraw"');
    expect(t).toContain('Withdraw');
    expect(html).toContain('data-testid="consent-done"');
  });

  it('Remember off: it says this visit only, and the switch is unticked', async () => {
    setConsentRemember('leaderboard', false);
    const html = await render({ modelValue: true, consentId: 'leaderboard' }, true);
    expect(textOf(html)).toContain('(off: for this visit only)');
    expect(html).not.toMatch(/data-testid="consent-remember"[^>]*checked|checked[^>]*data-testid="consent-remember"/);
  });

  it('Done folds it back to the one line', async () => {
    const html = await render({ modelValue: true, consentId: 'leaderboard' }, false);
    expect(html).toContain('data-testid="consent-summary"');
    expect(html).not.toContain('consent-done');
  });

  it('forced open (Send best so far asking): never folded, no Done, Withdraw still there', async () => {
    const html = await render({ modelValue: true, consentId: 'leaderboard', forceOpen: true });
    expect(html).not.toContain('consent-summary');
    expect(html).not.toContain('consent-done');
    expect(html).toContain('consent-withdraw');
  });

  it('not foldable (Share this result in full): agreed shows the words, Remember and Withdraw, no Done', async () => {
    const html = await render({ modelValue: true, consentId: 'leaderboard', foldable: false });
    expect(html).not.toContain('consent-summary');
    expect(textOf(html)).toContain('THE TEXT');
    expect(html).toContain('consent-remember');
    expect(html).toContain('consent-withdraw');
    expect(html).not.toContain('consent-done');
  });

  it('a one-off yes (no consent id) has Withdraw but no Remember', async () => {
    const html = await render({ modelValue: true }, true);
    expect(html).toContain('consent-withdraw');
    expect(html).not.toContain('consent-remember');
  });

  it('showBox off (a run going): no checkbox or words, the rest stays', async () => {
    const html = await render({ modelValue: true, showBox: false }, true);
    expect(textOf(html)).not.toContain('THE TEXT');
    expect(textOf(html)).toMatch(/BEFORE AFTER/);
  });

  it('its own test ids per box', async () => {
    const html = await render({ modelValue: true, testid: 'carry-on' });
    expect(html).toContain('data-testid="carry-on-summary"');
    expect(html).toContain('data-testid="carry-on-change"');
  });

  it('Withdraw and the untick go the same way: the model to false, said once (source)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'ConsentBox.vue'), 'utf8');
    expect(src).toMatch(/data-testid="`\$\{testid\}-withdraw`"\s*@click="set\(false\)"/);
    expect(src).toMatch(/@change="set\(\(\$event\.target as HTMLInputElement\)\.checked\)"/);
    expect(src).toMatch(/function set\(v: boolean\): void \{\s*const was = agreed\.value;\s*agreed\.value = v;/);
  });
});

describe('every consent box is a ConsentBox, with its words unchanged', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const flat = (s: string) => s.replace(/\s+/g, ' ');

  it('the boxes and their consent ids', () => {
    const boxes: [string, RegExp][] = [
      ['FindBar.vue', /<ConsentBox[^>]*consent-id="leaderboard"/],
      ['ShareResult.vue', /<ConsentBox[^>]*consent-id="leaderboard"/],
      ['InstantShareCheck.vue', /<ConsentBox[^>]*consent-id="keepSharingChecks"/],
      ['StepAwayOptions.vue', /<ConsentBox[^>]*consent-id="carryOn"/],
      ['StepAwayOptions.vue', /<ConsentBox[^>]*consent-id="watchTab"/],
      ['StepAwayOptions.vue', /<ConsentBox[^>]*consent-id="watchPhone"/],
      ['StepAwayOptions.vue', /<ConsentBox[^>]*consent-id="autoSend"/],
      ['InsanePanel.vue', /<ConsentBox[^>]*consent-id="scienceSweep"/],
      ['../science/SweepRunner.vue', /<ConsentBox[^>]*consent-id="scienceSweep"/],
      ['UnsentResults.vue', /<ConsentBox[^>]*:box-testid="`agree-unsent-/],
    ];
    for (const [f, re] of boxes) expect(read(f), f).toMatch(re);
    // No bare checkbox left on a consent: the old per-browser keys and the old fold are gone.
    for (const f of ['FindBar.vue', 'ShareResult.vue']) {
      expect(read(f)).not.toMatch(/const expanded = ref/);
      expect(read(f)).not.toContain('remembered in this browser, so you are not asked again');
    }
    expect(read('StepAwayOptions.vue')).not.toMatch(/v-model="options\.(autoCarryOn|autoSendBest)"/);
    expect(read('../science/SweepRunner.vue')).not.toContain('const consent = ref(false);');
    expect(read('InsanePanel.vue')).not.toContain('const sweepConsent = ref(false);');
  });

  it('the acknowledgement of Find and submit, byte for byte', () => {
    expect(flat(read('FindBar.vue'))).toContain(
      'I acknowledge the following: I want to share my run on the leaderboard when the search finishes<template v-if="consentNote" > ({{ consentNote }})</template >. I understand it sends the route, its dates and the {{ goalWord }}, with my artifact inventory, timezone, local plan start and the random code this browser keeps for the account (not my player ID, and never shown), plus my CSV if ticked below and, if ticked, private diagnostics (never shown). Stop it early and it shares the best it found so far. Send best so far shares it while the run goes on, with the CSV so far and diagnostics if ticked below; that row and its CSV are replaced when the run finishes.</span'
    );
  });

  it('the acknowledgement of Share this result, byte for byte', () => {
    expect(flat(read('ShareResult.vue'))).toContain(
      `I acknowledge the following: I want to share this result on the leaderboard. I understand it sends the route, its dates and the {{ goalWord }}, with my artifact inventory, timezone, local plan start and the random code this browser keeps for the account (not my player ID, and never shown), plus my CSV if ticked below and, if ticked, private diagnostics (never shown).<template v-if="goalWord === 'target'"> It also sends my best three plans already on the board, re-priced from this save.</template`
    );
  });

  it("App loads the account's consents with the player ID", () => {
    const app = fs.readFileSync(path.join(__dirname, '../../App.vue'), 'utf8');
    expect(app).toContain('watch(playerId, id => void setConsentAccount(id), { immediate: true });');
  });
});
