/**
 * The page header in App.vue (UX review 26 Oct 2026): the title (the name line under it cut, fluff review 2 H3), the nav
 * bar's 44 px tap areas on phones (#12) and the active My Runs tab's colour (#15).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

describe('the header title', () => {
  it('says Ascension Planner alone, with no name line under it (the ID box shows the name; fluff review 2, H3)', () => {
    expect(app).toContain("const pageTitle = 'Ascension Planner';");
    expect(app).not.toContain('`Ascension Planner ${name}`');
    expect(app).not.toContain('data-testid="header-player-name"');
  });

  it('says the backup time on Manual only: the other screens have the save-age box (fluff review 2, H4)', () => {
    const at = app.indexOf('Player Backup From: {{ lastBackupFormatted }}');
    expect(at).toBeGreaterThan(app.indexOf('{{ pageTitle }}'));
    const tag = app.slice(app.lastIndexOf('<div', at), at);
    expect(tag).toContain('v-if="manualShown && initialStateStore.hasData && lastBackupFormatted"');
  });

  it('the browser tab keeps the name', () => {
    expect(app).toContain('const documentTitle = computed(() => (playerName.value ? `${pageTitle} ${playerName.value}` : pageTitle));');
    expect(app).toMatch(/watch\(\s*documentTitle,\s*newTitle => \{\s*document\.title = newTitle;/);
  });
});

describe('the nav bar icons (#12)', () => {
  it('replaced 13 Nov 2026 by layout/SiteHomeMenu.vue in the tab row, each icon a 44 px button (siteHomeMenu.spec.ts)', () => {
    expect(app).not.toContain('aap-navbar');
    expect(app).toContain('<SiteHomeMenu');
  });
});

describe('the top tabs (#15)', () => {
  it('My Runs, when on, is indigo like the Auto Planner (it was sky blue)', () => {
    const tab = (id: string) => {
      const at = app.indexOf(`id: '${id}' as const`);
      return app.slice(at, app.indexOf('}', at));
    };
    expect(tab('auto')).toContain("on: 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'");
    expect(tab('myruns')).toContain("on: 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'");
    expect(app).not.toContain('bg-sky-600');
  });
});
