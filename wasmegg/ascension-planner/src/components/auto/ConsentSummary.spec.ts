import { afterEach, describe, expect, it } from 'vitest';
import ConsentSummary from './ConsentSummary.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useShareExtras } from '@/composables/useShareExtras';

afterEach(() => {
  const extras = useShareExtras();
  extras.sendCsv.value = true;
  extras.sendDiagnostics.value = false;
});

const render = async (props: Record<string, unknown>) => textOf(await renderHtml(ConsentSummary, props));

describe('ConsentSummary', () => {
  it("says what was agreed and the extras (the ✓ and Change are the consent box's, ConsentBox.vue)", async () => {
    const html = await renderHtml(ConsentSummary, {});
    const t = textOf(html);
    expect(t).toContain('You agreed to share runs on the leaderboard');
    expect(t).toContain('CSV on · diagnostics off');
    expect(html).not.toContain('data-testid="consent-change"');
  });

  it('follows the CSV and diagnostics choices', async () => {
    const extras = useShareExtras();
    extras.sendCsv.value = false;
    extras.sendDiagnostics.value = true;
    expect(await render({})).toContain('CSV off · diagnostics on');
  });

  it('says nothing of the credit: the sharing line under it says it once (SharingSummary.vue, ux29 #11)', async () => {
    const t = await render({});
    expect(t).not.toContain('anonymous');
    expect(t).not.toContain('credited as');
  });
});
