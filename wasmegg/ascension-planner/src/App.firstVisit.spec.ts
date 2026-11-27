/**
 * spec-fluff3-chrome (5 Nov 2026), First visit (UX fluff review 2, part B, F1 to F8): a new browser with no player ID
 * used to open on 4,787 px of Joo's empty Manual Planner (on a phone) under the ID box, with nothing saying what the
 * planner does. Now, before an ID or a save file is in and unless the Manual Planner was asked for (the address, a
 * remembered tab, or the link), the page shows the title, two lines on what the planner does, the ID box, "or load a
 * save file" with its warning as a clause, and one link to the Manual Planner. Joo's components are not touched: App.vue
 * only decides whether to show them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { firstVisitShows } from '@/lib/siteNav';
import { FIRST_VISIT_WORDS } from '@/lib/firstVisitWords';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const template = app.slice(0, app.indexOf('<script setup'));
const script = app.slice(app.indexOf('<script setup'));
const bar = readFileSync(new URL('./components/auto/SaveFileBar.vue', import.meta.url), 'utf8');

describe('firstVisitShows', () => {
  const base = { hasAccount: false, hasSaveFile: false, tab: 'manual', manualAsked: false };
  it('is the no-account, nothing-asked Manual tab only', () => {
    expect(firstVisitShows(base)).toBe(true);
    expect(firstVisitShows({ ...base, hasAccount: true })).toBe(false);
    expect(firstVisitShows({ ...base, hasSaveFile: true })).toBe(false);
    expect(firstVisitShows({ ...base, tab: 'automatic' })).toBe(false);
    // #/manual in the address, a remembered tab, or the link: the Manual Planner as before.
    expect(firstVisitShows({ ...base, manualAsked: true })).toBe(false);
  });
});

describe('App.vue first visit', () => {
  it('asks only before an ID: a tab in the address or remembered, or any route applied later, means asked', () => {
    expect(script).toContain('const manualAsked = ref(opening.route !== null);');
    const apply = script.slice(script.indexOf('function applyRoute(r: SiteRoute): void {'));
    expect(apply.slice(0, apply.indexOf('\n}\n'))).toContain("if (r.section === 'manual') manualAsked.value = true;");
  });

  it('hides every Manual Planner piece the wrapper shows while it is the first visit', () => {
    // Only Manual's own h1 keeps the tab test: it needs an account, so it never shows on a first visit.
    expect(template).not.toMatch(/v-if="plannerTab === 'manual'"/);
    expect(template.match(/manualShown/g)?.length).toBeGreaterThanOrEqual(7);
    for (const tag of ['<PlanFinalSummary', '<FloatingStats', '<FloatingNotes']) {
      const at = template.indexOf(tag);
      expect(template.slice(at, template.indexOf('>', at + tag.length + 40) + 1)).toContain('manualShown');
    }
  });

  it('shows the two lines above the ID box, the short save-file line under it, and the Manual Planner link', () => {
    const lines = template.indexOf('data-testid="first-visit-intro"');
    expect(lines).toBeGreaterThan(-1);
    expect(lines).toBeLessThan(template.indexOf('<the-player-id-form'));
    expect(template.slice(lines - 200, lines)).toContain('v-if="firstVisit"');
    expect(template).toContain('{{ FIRST_VISIT_WORDS.what }}');
    expect(template).toContain('{{ FIRST_VISIT_WORDS.id }}');
    const link = template.indexOf('data-testid="first-visit-manual"');
    expect(link).toBeGreaterThan(template.indexOf('data-testid="no-account-save-file"'));
    expect(template.slice(link - 300, link + 300)).toContain('href="#/manual"');
    expect(template.slice(link - 300, link + 300)).toContain('min-h-[44px]');
    expect(template).toContain('<SaveFileBar player-id="" :compact="firstVisit" @loaded="onNoAccountSave" />');
  });

  it('words (DRAFT for Words)', () => {
    expect(FIRST_VISIT_WORDS.what).toBe(
      'Plans your virtue ascensions: the fastest route to 490 TE, or the most TE by a date such as Egg Day.'
    );
    expect(FIRST_VISIT_WORDS.id).toBe("Enter your player ID to load your save from the game's server.");
    expect(FIRST_VISIT_WORDS.manualLead).toBe('Planning by hand, without an account?');
    expect(FIRST_VISIT_WORDS.manualLink).toBe('Open the Manual Planner ›');
  });
});

describe('SaveFileBar compact (first visit, F6)', () => {
  it('reads "or load a save file" with the warning kept as a clause', () => {
    expect(bar).toContain("compact ? 'or load a save file' : 'Load a save file'");
    expect(bar).toContain("(it is your game save: don't share it publicly)");
    // The full warning stays everywhere else.
    expect(bar).toContain("This file is your game save; don't share it publicly.");
  });
});
