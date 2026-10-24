/**
 * No-prestige days keep runs off the leaderboard (lib/npGuard.ts). The note shows only with days set, and every
 * component whose button calls a store send reads the predicate on its button, so no send is offered that the
 * store would refuse. The store's own refusal (the hard guard) is in stores/chainSearch.npGuard.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import NoPrestigeSendNote from './NoPrestigeSendNote.vue';
import ShareResult from './ShareResult.vue';
import { NO_PRESTIGE_SEND_NOTE } from '@/lib/npGuard';
import { textOf } from '@/test/renderComponent';

const DAYS = [{ from: '2027-02-10', to: '2027-02-12' }];
const render = (c: unknown, props: Record<string, unknown>) =>
  renderToString(createSSRApp({ render: () => h(c as never, props) }));

describe('the note', () => {
  it('shows only while days are set, in the exact words', async () => {
    expect(textOf(await render(NoPrestigeSendNote, { days: DAYS }))).toBe(NO_PRESTIGE_SEND_NOTE);
    expect(await render(NoPrestigeSendNote, { days: [] })).not.toContain('no-prestige-send-note');
    expect(await render(NoPrestigeSendNote, {})).not.toContain('no-prestige-send-note');
    expect(await render(NoPrestigeSendNote, { days: [{ from: '2027-02-10', to: '' }] })).not.toContain(
      'no-prestige-send-note'
    );
  });

  it('Share this result: once at the top, and its ask button greyed out', async () => {
    const base = { optIn: false, anonymous: true, nickname: '', compact: true, sendLabel: 'Send 239 TE by this date' };
    const on = await render(ShareResult, { ...base, noPrestigeDays: DAYS });
    expect(on.split('data-testid="no-prestige-send-note"')).toHaveLength(2);
    expect(on).toMatch(/<button[^>]*\sdisabled[\s>=][^>]*data-testid="share-ask"/);
    const off = await render(ShareResult, base);
    expect(off).not.toContain('no-prestige-send-note');
    expect(off).not.toMatch(/<button[^>]*\sdisabled[\s>=][^>]*data-testid="share-ask"/);
  });
});

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('every send button reads the predicate', () => {
  // Each component that calls a store send (or is the button of one), and the button's own :disabled.
  const cases: [string, RegExp][] = [
    // Find and submit, and Send best so far (store.sendBestSoFar).
    ['./FindBar.vue', /:disabled="findDisabled \|\| notReady \|\| !optIn \|\| npBlocked"\s*@click="emit\('find', true\)"/],
    ['./FindBar.vue', /\|\| npBlocked"\s*data-testid="send-best-so-far"/],
    // The run bar's Send best so far.
    ['./RunProgressBar.vue', /:disabled="!p\.best \|\| store\.bestSoFarSending \|\| store\.bestSoFarWait > 0 \|\| npBlocked"/],
    // Send it now (store.sendPending), on the search screens and My runs.
    ['./UnsentResults.vue', /:disabled="sendingId !== null \|\| store\.busy \|\| !consentFor\(p\) \|\| npBlocked"/],
    // Submit result (useFastestShare → sendRunResult → store.sendSubmission).
    ['./BoardSubmitButtons.vue', /:disabled="!optIn \|\| sending \|\| alreadySubmitted \|\| npBlocked"/],
    // Share this result's ask button.
    ['./ShareResult.vue', /:disabled="npBlocked"\s*data-testid="share-ask"/],
    // Send N TE by this date (useByDateShare → store.sendDeadlineAnswer).
    ['./DeadlinePanel.vue', /:disabled="sharing \|\| store\.deadlineRunning \|\| sentKey === resultKey \|\| sendBlockedByNoPrestige\(store\.noPrestige\)"/],
    // A science sweep's Start and submit when done (sendRunResult).
    ['../science/SweepRunner.vue', /!npBlocked\.value &&/],
  ];
  it.each(cases)('%s', (file, button) => {
    const src = read(file);
    expect(src).toMatch(button);
    expect(src).toContain("from '@/lib/npGuard'");
    if (file !== './DeadlinePanel.vue') expect(src).toMatch(/const npBlocked = computed\(\(\) => sendBlockedByNoPrestige\(/);
  });

  it('the note is mounted where the buttons are, with the store days', () => {
    for (const f of ['./FindBar.vue', './RunProgressBar.vue', './UnsentResults.vue', './StepAwayOptions.vue', '../science/SweepRunner.vue'])
      expect(read(f), f).toMatch(/<NoPrestigeSendNote[^>]*:days="store\.noPrestige"/);
    expect(read('./ShareResult.vue')).toContain('<NoPrestigeSendNote :days="noPrestigeDays" />');
    for (const f of ['./ChainSearchPanel.vue', './InsanePanel.vue']) {
      const src = read(f);
      // Both ShareResult and BoardSubmitButtons get the days.
      expect(src.match(/:no-prestige-days="store\.noPrestige"/g), f).toHaveLength(2);
    }
    expect(read('./DeadlinePanel.vue').match(/:no-prestige-days="store\.noPrestige"/g)).toHaveLength(1);
  });

  it('the store guards the posting itself, and the automatic sends are skipped', () => {
    const store = read('../../stores/chainSearch.ts');
    expect(store).toMatch(
      /if \(sendBlockedByNoPrestige\(noPrestige\.value\)\) return \{ ok: false, blocked: true, message: NO_PRESTIGE_SEND_NOTE \};\n {4}if \(!submitUrl\)/
    );
    expect(store).toMatch(/function autoTick\(\)[\s\S]{0,400}if \(sendBlockedByNoPrestige\(noPrestige\.value\)\) return;/);
    // The only fetch to /submit is the one sendSubmission makes.
    expect(store.match(/fetch\(quarantineAwareUrl\(submitUrl\)/g)).toHaveLength(1);
  });
});
