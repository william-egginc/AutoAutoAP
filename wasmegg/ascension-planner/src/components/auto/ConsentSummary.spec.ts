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
    const html = await renderHtml(ConsentSummary, { anonymous: true, nickname: '' });
    const t = textOf(html);
    expect(t).toContain('You agreed to share runs on the leaderboard');
    expect(t).toContain('CSV on · diagnostics off · anonymous');
    expect(html).not.toContain('data-testid="consent-change"');
  });

  it('follows the CSV and diagnostics choices', async () => {
    const extras = useShareExtras();
    extras.sendCsv.value = false;
    extras.sendDiagnostics.value = true;
    expect(await render({ anonymous: true, nickname: '' })).toContain('CSV off · diagnostics on');
  });

  it('credits the nickname when not anonymous', async () => {
    const t = await render({ anonymous: false, nickname: 'Fred' });
    expect(t).toContain('credited as Fred');
    expect(t).not.toContain('anonymous');
  });

  it('counts a blank nickname as anonymous', async () => {
    const t = await render({ anonymous: false, nickname: '   ' });
    expect(t).toContain('anonymous');
    expect(t).not.toContain('credited as');
  });

  it('cuts a nickname longer than nicknameMax', async () => {
    expect(await render({ anonymous: false, nickname: 'Frederick', nicknameMax: 4 })).toContain('credited as Fred');
    expect(await render({ anonymous: false, nickname: 'Frederick', nicknameMax: 4 })).not.toContain('Frederick');
  });
});
