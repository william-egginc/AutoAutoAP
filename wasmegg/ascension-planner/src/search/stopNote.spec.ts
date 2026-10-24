import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOPPING_NOTE } from './stopNote';

const AUTO = path.resolve(__dirname, '..', 'components', 'auto');
const read = (f: string) => fs.readFileSync(path.join(AUTO, f), 'utf8');

describe('the stopping note', () => {
  it('says what is happening in plain words', () => {
    expect(STOPPING_NOTE).toBe('Stopping: finishing the routes already started (up to about a minute).');
    expect(STOPPING_NOTE.toLowerCase()).not.toContain('table');
  });

  it('shows wherever "Stopping" shows for a search', () => {
    for (const f of ['FindBar.vue', 'RunProgressBar.vue']) {
      const src = read(f);
      expect(src, f).toContain("import { STOPPING_NOTE } from '@/search/stopNote'");
      expect(src, f).toContain('data-testid="stopping-note"');
    }
    const panel = read('DeadlinePanel.vue');
    expect(panel).toContain("import { STOPPING_NOTE } from '@/search/stopNote'");
    // The quick estimate card's Stop, and the Stop that run button.
    expect((panel.match(/data-testid="stopping-note"/g) ?? []).length).toBe(2);
    expect(panel).toContain('v-if="stopAsked" class="text-[11px] text-slate-600" data-testid="stopping-note"');
    expect(panel).toContain('store.isRunning && store.stopRequested');
  });
});
