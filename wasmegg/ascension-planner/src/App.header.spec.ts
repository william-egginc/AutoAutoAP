/**
 * The page header in App.vue (UX review 26 Oct 2026): the title with the save's name on its own line (#13), the nav
 * bar's 44 px tap areas on phones (#12) and the active My runs tab's colour (#15).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

describe('the header title', () => {
  it('says Ascension Planner alone; the name is its own small line under it, not display type', () => {
    expect(app).toContain("const pageTitle = 'Ascension Planner';");
    expect(app).not.toContain('`Ascension Planner ${name}`');
    const title = app.indexOf('{{ pageTitle }}');
    const name = app.indexOf('data-testid="header-player-name"');
    expect(name).toBeGreaterThan(title);
    expect(name).toBeLessThan(app.indexOf('<the-player-id-form'));
    const tag = app.slice(app.lastIndexOf('<p', name), app.indexOf('>', name));
    expect(tag).toContain('v-if="playerName"');
    expect(tag).toContain('text-body');
    expect(tag).not.toMatch(/heading-xl|text-gradient|uppercase/);
    expect(app.slice(name, app.indexOf('</p>', name))).toContain('{{ playerName }}');
  });

  it('the browser tab keeps the name', () => {
    expect(app).toContain('const documentTitle = computed(() => (playerName.value ? `${pageTitle} ${playerName.value}` : pageTitle));');
    expect(app).toMatch(/watch\(\s*documentTitle,\s*newTitle => \{\s*document\.title = newTitle;/);
  });
});

describe('the nav bar icons on a phone (#12)', () => {
  const bar = readFileSync(new URL('../../../ui/components/NavBar.vue', import.meta.url), 'utf8');

  it('the shared bar still has the home link and the menu button, 20 px, straight under its row', () => {
    expect(bar).toMatch(/<div\s+class="mx-auto py-3 flex flex-row space-x-3"/);
    expect(bar).toMatch(/<!-- Home icon -->\s*<a\b/);
    expect(bar).toMatch(/<!-- Sidebar icon -->\s*<button\b/);
    expect(bar.match(/class="h-5 w-5"/g)).toHaveLength(2);
  });

  it('App.vue wraps it and gives each icon a 44 px tap area under sm, without overlap', () => {
    expect(app).toContain('<div class="aap-navbar"><the-nav-bar active-entry-id="ascension-planner" /></div>');
    const css = app.slice(app.indexOf('@media (max-width: 639.98px)'));
    expect(css).toMatch(/\.aap-navbar nav > div > a::before,\s*\.aap-navbar nav > div > button::before \{\s*content: '';\s*position: absolute;\s*inset: -12px;/);
    // 20 + 2 x 12 = 44; the 12 px default gap plus 12 px more keeps the two areas apart.
    expect(20 + 2 * 12).toBe(44);
    expect(css).toMatch(/\.aap-navbar nav > div > a \+ button \{\s*margin-left: 1\.5rem !important;/);
    // In an unscoped block (the bar is another component's markup).
    const block = app.slice(app.lastIndexOf('<style', app.indexOf('.aap-navbar nav')), app.indexOf('.aap-navbar nav'));
    expect(block.startsWith('<style>')).toBe(true);
  });
});

describe('the top tabs (#15)', () => {
  it('My runs, when on, is indigo like the Auto Planner (it was sky blue)', () => {
    const tab = (id: string) => {
      const at = app.indexOf(`id: '${id}' as const`);
      return app.slice(at, app.indexOf('}', at));
    };
    expect(tab('auto')).toContain("on: 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'");
    expect(tab('myruns')).toContain("on: 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'");
    expect(app).not.toContain('bg-sky-600');
  });
});
