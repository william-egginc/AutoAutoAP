/**
 * spec-fluff3-chrome (5 Nov 2026): Setup's SHORTEN items left over from spec-fluff2-setup (UX fluff review 2, part B:
 * S3, S4, S10, S12, S13, S14, S20, S22, S25, S27, S28, S44). Awake hours, No prestige days, Time off and Sharing stay
 * in view and More options stays closed (YourSetup.moreOptions.spec.ts). All new wording is DRAFT for Words.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeSaveAge } from '@/lib/saveAge';
import { FIRST_ASCENSION_CHOICES } from '@/search/firstAscensionWords';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const setup = read('./YourSetup.vue');
const template = setup.slice(0, setup.indexOf('<script setup'));
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('S3: the remembered line', () => {
  it('is one short line; what is remembered is the Reset button’s title', () => {
    expect(template).not.toContain('whether shifts wait for them), time off, no prestige days and first ascension. ·');
    expect(flat(template)).toContain(
      'Remembered for this account<template v-if="rememberedWhen"> ({{ rememberedWhen }})</template>{{ \' \' }}·'
    );
    expect(setup).toContain('REMEMBERED_TITLE');
    expect(setup).toContain(
      "'Remembered: your awake hours (and whether shifts wait for them), time off, no prestige days and first ascension. Reset to defaults: any hour, no time off or no prestige days, first ascension Soonest.'"
    );
  });
});

describe('S4: the lock note', () => {
  it('is one sentence', () => {
    expect(template).not.toContain('The computer settings still work.');
    expect(flat(template)).toContain(
      'A search is running: stop it to change the start, hours or days (your best so far is kept).'
    );
  });
});

describe('S10: the catch-up note', () => {
  it('is one clause; the past-silos form is unchanged', () => {
    const H = 3600;
    const SYNC = 1_790_000_000;
    expect(describeSaveAge(SYNC, SYNC + 5 * H, 12 * H)!.text).toBe(
      'Your farm is caught up to here from your save. Played since? Sync and reload.'
    );
    expect(describeSaveAge(SYNC, SYNC + 40 * H, 12 * H)!.text).toMatch(/^Starts 1d 16h after your last sync|^Starts .* after your last sync, longer than your silos hold/);
  });
});

describe('S12: First ascension', () => {
  it('keeps the four choices, with a clause on Soonest only', () => {
    expect(FIRST_ASCENSION_CHOICES.map(c => c.value)).toEqual(['auto', 'buildup', 'continue', 'fresh']);
    expect(FIRST_ASCENSION_CHOICES[0].blurb).toBe('whichever finishes first: keep building, just lay, or prestige now.');
    for (const c of FIRST_ASCENSION_CHOICES.slice(1)) expect(c.blurb).toBe('');
    expect(template).toContain('<template v-if="c.blurb">{{ \' \' }}<span class="text-slate-500">{{ c.blurb }}</span></template>');
  });
});

describe('S13 and S14: Awake hours', () => {
  it('two 44 px choices and one line under them; the timezone sentence is gone (the readback names it)', () => {
    expect(template).not.toContain('Fastest on paper');
    expect(template).not.toContain("Hours are in the plan's timezone");
    expect(flat(template)).toContain('Prestiges and egg shifts wait for your hours; the farm keeps laying meanwhile.');
    const group = template.slice(template.indexOf('aria-label="Awake hours"'), template.indexOf('data-testid="setup-awake-line"'));
    expect(group).toContain('>Any hour<');
    expect(group).toContain('>My awake hours<');
    expect(group.match(/min-h-\[44px\]/g)?.length).toBe(2);
    // The days row keeps a name for a screen reader.
    expect(template).toContain('role="group" aria-label="Days you are awake"');
  });
});

describe('S20 and S22: the day pickers', () => {
  const editor = read('./TimeOffEditor.vue');
  it('one line each in view, the full explainer behind a 44 px "?" that opens in place', () => {
    expect(editor).toContain("short: 'Stay on virtue, but no prestige on these days.'");
    expect(editor).toContain("short: \"On the home farm: that's a prestige, and you rebuild when back. Egg Day is the usual one.\"");
    const q = editor.slice(editor.indexOf(':data-testid="`${kind}-more`"') - 500, editor.indexOf(':data-testid="`${kind}-more`"') + 200);
    expect(q).toContain('min-h-[44px] min-w-[44px]');
    expect(q).toContain(':aria-expanded="moreOpen"');
    expect(q).toContain(':aria-controls="explainId"');
    expect(editor).toContain(':hidden.attr="moreOpen ? undefined : \'until-found\'"');
    // The full explainers are kept, word for word.
    expect(editor).toContain('Egg shifts still happen on these days.');
    expect(editor).toContain('Going to the home farm is a prestige');
  });
});

describe('S25, S27, S28: This computer (inside More options)', () => {
  it('the worker note is one line', () => {
    const slider = read('./WorkerSlider.vue');
    expect(slider).not.toContain('12 workers were as fast as 19');
    expect(flat(slider)).toContain('More finish sooner, up to a point. You can change it mid-run.');
  });
  it('background speed: the select and the browser line only', () => {
    const bg = read('./BackgroundSpeed.vue');
    expect(bg).not.toContain('Lets the search keep going at a lower draw');
    expect(bg).toContain('{{ BROWSER_ADVICE[browser] }}');
  });
  it('keep awake: the label and "(not with the lid closed)"', () => {
    expect(template).not.toContain('every worker freezes until you wake it');
    expect(flat(template)).toContain(
      '<span class="font-bold text-slate-800">Keep my computer awake while a search runs</span>{{ \' \' }}(not with the lid closed)'
    );
  });
});

describe('S44: the tab ticks', () => {
  it('read "Leaderboard tab · everyone’s shared runs"', () => {
    const tabs = read('./TabsToggle.vue');
    expect(tabs).toContain("label: `${NAMES.compare} tab`");
    expect(tabs).toContain("what: 'everyone’s shared runs'");
    expect(tabs).toContain("label: `${NAMES.science} tab`");
    expect(tabs).not.toContain('Show the ${');
  });
});
