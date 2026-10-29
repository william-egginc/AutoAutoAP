/**
 * Share this result: the compact form (one button, then the folded consent) and the full box. Specs render
 * on the server, so "clicked" is the component's own ref set through its setup state, as in FindBar.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import ShareResult from './ShareResult.vue';
import { textOf } from '@/test/renderComponent';
import { useShareExtras } from '@/composables/useShareExtras';

afterEach(() => {
  const extras = useShareExtras();
  extras.sendCsv.value = true;
  extras.sendDiagnostics.value = false;
});

const base = { optIn: false, anonymous: true, nickname: '' };

/** `asking` is ShareResult's own; `expanded` (Change pressed, or Done not) is the consent box's `open`
 *  (ConsentBox.vue, which folds every consent box the same way). */
async function renderWith(props: Record<string, unknown>, setup: Record<string, unknown> = {}): Promise<string> {
  const app = createSSRApp({
    render: () => h(ShareResult, { ...base, ...props }, { opted: () => h('i', 'OPTED-SLOT') }),
  });
  const { expanded, ...own } = setup;
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (this.$.type.__file?.endsWith('/ShareResult.vue')) Object.assign(this.$.setupState, own);
      if (expanded !== undefined && this.$.type.__file?.endsWith('/ConsentBox.vue'))
        Object.assign(this.$.setupState, { open: expanded });
    },
  });
  return renderToString(app);
}

const CONSENT = 'I acknowledge the following';

describe('ShareResult compact', () => {
  it('not agreed, with a send label: one button that asks first', async () => {
    const html = await renderWith({ compact: true, sendLabel: 'Send 239 TE by this date' });
    const t = textOf(html);
    expect(html).toContain('data-testid="share-ask"');
    expect(t).toContain('Send 239 TE by this date');
    expect(t).toContain('nothing is sent by that press');
    expect(html).not.toContain('data-testid="share-consent"');
    expect(t).not.toContain(CONSENT);
  });

  it('asking opens the full box', async () => {
    const html = await renderWith({ compact: true, sendLabel: 'Send 239 TE by this date' }, { asking: true });
    expect(html).toContain('data-testid="share-consent"');
    expect(textOf(html)).toContain(CONSENT);
    expect(html).not.toContain('data-testid="share-ask"');
  });

  it('agreed: the summary, the opted slot and a folded note', async () => {
    const html = await renderWith({ compact: true, optIn: true, note: '' });
    const t = textOf(html);
    expect(html).toContain('data-testid="consent-summary"');
    expect(html).not.toContain('data-testid="share-consent"');
    expect(t).not.toContain(CONSENT);
    expect(t).toContain('OPTED-SLOT');
    expect(html).toMatch(/<details[^>]*data-testid="share-note-fold"/);
    expect(t).toContain('Add a note on this run');
  });

  it('agreed, with a note: the fold says it was added', async () => {
    const t = textOf(await renderWith({ compact: true, optIn: true, note: 'hello' }));
    expect(t).toContain('Note on this run (added)');
    expect(t).not.toContain('Add a note on this run');
  });

  it('agreed without a bound note: no note fold', async () => {
    expect(await renderWith({ compact: true, optIn: true })).not.toContain('share-note-fold');
  });

  it('agreed, then Change: the full box with Done, no summary', async () => {
    const html = await renderWith({ compact: true, optIn: true }, { expanded: true });
    expect(html).toContain('data-testid="share-consent"');
    // "Remember my choice" and Withdraw (ConsentBox.vue), where "Remembered in this browser" was.
    expect(html).toContain('data-testid="consent-remember"');
    expect(html).toContain('data-testid="consent-withdraw"');
    expect(html).toContain('data-testid="share-done"');
    expect(textOf(html)).toContain('Done');
    expect(textOf(html)).not.toContain('Fold this away');
    expect(html).not.toContain('data-testid="consent-summary"');
  });

  it('Done folds it back: the summary, no Done', async () => {
    const html = await renderWith({ compact: true, optIn: true }, { expanded: false });
    expect(html).toContain('data-testid="consent-summary"');
    expect(html).not.toContain('data-testid="share-done"');
  });

  it('"Credit me as" with a name: the summary credits it; with none, anonymous', async () => {
    expect(textOf(await renderWith({ compact: true, optIn: true, anonymous: false, nickname: 'Willsalt' }))).toContain(
      'Sharing: on · credited as Willsalt · Change'
    );
    expect(textOf(await renderWith({ compact: true, optIn: true, anonymous: false, nickname: '' }))).toContain(
      'Sharing: on · anonymous · Change'
    );
  });

  it('without a send label (Fastest): the full box', async () => {
    const html = await renderWith({ compact: true });
    expect(html).toContain('data-testid="share-consent"');
    expect(html).not.toContain('data-testid="share-ask"');
    expect(textOf(html)).toContain(CONSENT);
  });
});

describe('ShareResult not compact', () => {
  it('is the full box, even when agreed', async () => {
    for (const optIn of [false, true]) {
      const html = await renderWith({ optIn, sendLabel: 'Send it' });
      expect(html).toContain('data-testid="share-consent"');
      expect(html).not.toContain('data-testid="consent-summary"');
      expect(html).not.toContain('data-testid="share-ask"');
      expect(html).not.toContain('data-testid="share-done"');
      // Agreed: Withdraw and "Remember my choice" are there all the same.
      expect(html.includes('data-testid="consent-withdraw"')).toBe(optIn);
    }
  });
});

describe('ShareResult source', () => {
  it('opens the choices for a box ticked now (the consent box opens on its own tick)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'ConsentBox.vue'), 'utf8');
    // A watch can't fire in a server render, so this is checked in the source.
    expect(src).toMatch(/function set\(v: boolean\): void \{[^}]*agreed\.value = v;\s*if \(v\) open\.value = true;/);
    // Withdrawn (from anywhere): back to the full box.
    expect(src).toMatch(/watch\(agreed,\s*v\s*=>\s*\{[^}]*else open\.value = false;/);
    const share = fs.readFileSync(path.join(__dirname, 'ShareResult.vue'), 'utf8');
    expect(share).toMatch(/<ConsentBox[\s\S]*?consent-id="leaderboard"[\s\S]*?:foldable="compact"/);
  });
});
