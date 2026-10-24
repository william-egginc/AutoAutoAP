/** The Fastest answer's health box (ResultHealth.vue): titled by severity. */
import { describe, expect, it } from 'vitest';
import ResultHealth from './ResultHealth.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const slow = { level: 'warning' as const, message: 'Leg 1 takes 575 days, worth checking rather than trusting.' };
const wrong = { level: 'error' as const, message: 'Leg 2 ends below the TE it started from.' };

describe('ResultHealth', () => {
  it('warnings only: an amber "Worth checking" box, no run-it-again advice', async () => {
    const html = await renderHtml(ResultHealth, { issues: [slow] });
    const t = textOf(html);
    expect(t).toMatch(/^Worth checking Leg 1 takes 575 days/);
    expect(t).not.toContain('contradicts itself');
    expect(t).not.toContain('Reload your backup');
    expect(html).toContain('result-worth-checking');
    expect(html).toContain('bg-amber-50');
  });

  it('any error: the red "This result contradicts itself" box with every issue and the advice', async () => {
    const html = await renderHtml(ResultHealth, { issues: [slow, wrong] });
    const t = textOf(html);
    expect(t).toMatch(/^This result contradicts itself/);
    expect(t).toContain(slow.message);
    expect(t).toContain(wrong.message);
    expect(t).toContain('Reload your backup and run it again');
    expect(html).toContain('result-contradicts');
    expect(html).toContain('bg-rose-50');
  });

  it('nothing to say: nothing drawn', async () => {
    expect(textOf(await renderHtml(ResultHealth, { issues: [] }))).toBe('');
  });
});
