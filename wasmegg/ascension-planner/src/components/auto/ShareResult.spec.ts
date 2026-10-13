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

async function renderWith(props: Record<string, unknown>, setup: Record<string, unknown> = {}): Promise<string> {
  const app = createSSRApp({
    render: () => h(ShareResult, { ...base, ...props }, { opted: () => h('i', 'OPTED-SLOT') }),
  });
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (this.$.type.__file?.endsWith('/ShareResult.vue')) Object.assign(this.$.setupState, setup);
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

  it('agreed, then Change: the full box with Fold this away, no summary', async () => {
    const html = await renderWith({ compact: true, optIn: true }, { expanded: true });
    expect(html).toContain('data-testid="share-consent"');
    expect(html).toContain('data-testid="share-fold"');
    expect(textOf(html)).toContain('Fold this away');
    expect(html).not.toContain('data-testid="consent-summary"');
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
      expect(html).not.toContain('data-testid="share-fold"');
    }
  });
});

describe('ShareResult source', () => {
  it('opens the choices for a box ticked now (optIn true sets expanded)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'ShareResult.vue'), 'utf8');
    // A watch can't fire in a server render, so this is checked in the source.
    expect(src).toMatch(/watch\(optIn,\s*v\s*=>\s*\{[^}]*expanded\.value\s*=\s*v;/);
  });
});
