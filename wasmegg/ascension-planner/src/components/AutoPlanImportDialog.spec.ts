import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import AutoPlanImportDialog from './AutoPlanImportDialog.vue';

describe('AutoPlanImportDialog', () => {
  it('counts the plans it adds in words that agree with the number (plural())', async () => {
    const one = textOf(await renderHtml(AutoPlanImportDialog, { planName: 'Route', ascensionCount: 1 }));
    expect(one).toContain('Adds 1 separate plan to your library.');
    const three = textOf(await renderHtml(AutoPlanImportDialog, { planName: 'Route', ascensionCount: 3 }));
    expect(three).toContain('Adds 3 separate plans to your library.');
  });
});
