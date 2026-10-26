/**
 * The page header in App.vue (UX review 26 Oct 2026): the title with the save's name on its own line (#13).
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
    expect(tag).toContain('text-sm');
    expect(tag).not.toMatch(/heading-xl|text-gradient|uppercase/);
    expect(app.slice(name, app.indexOf('</p>', name))).toContain('{{ playerName }}');
  });

  it('the browser tab keeps the name', () => {
    expect(app).toContain('const documentTitle = computed(() => (playerName.value ? `${pageTitle} ${playerName.value}` : pageTitle));');
    expect(app).toMatch(/watch\(\s*documentTitle,\s*newTitle => \{\s*document\.title = newTitle;/);
  });
});
