/**
 * The instant card is instant only (wireframes/price-route-v2, Jordan 23 Oct 2026). No Check exactly, automatic or
 * pressed, and no pricing run (Light) after the answer: the green box and the counts list show the instant answer's
 * numbers and never change by themselves, nor while a search runs. One short line under the box. A finished Fast,
 * Exact or Custom result for the same goal adds only the pointer line. Source checks, as InstantRoute's other specs
 * (the component needs the route workers and a save to mount).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH_OPTION, readChoice } from '@/lib/searchOption';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const template = src.slice(0, src.indexOf('<script'));
const script = src.slice(src.indexOf('<script setup'));
/** A function's body, from its name to the next top-level declaration. */
function fn(name: string): string {
  const at = script.indexOf(name);
  expect(at, name).toBeGreaterThan(0);
  const next = script.slice(at + name.length).search(/\n(?:async function|function|const|let|watch\()/);
  return script.slice(at, at + name.length + next);
}

describe('no automatic run on the answer', () => {
  it('nothing prices a route on this card: no Check exactly, no simulator pool, no stronger check', () => {
    for (const gone of [
      'runExact',
      'checkAgain',
      'createChainSearchPool',
      'exactStatus',
      'boxPick',
      '<StrongerCheck',
      'lightRows',
      'priceWithRunnerUps',
    ])
      expect(src, gone).not.toContain(gone);
  });
  it('after the answer: only the background polish, the "Prestige by" line and the nearest tables (all instant)', () => {
    const polish = fn('async function polishInBackground(');
    expect(polish).toContain('void runPrestigeBy(id, p, url);');
    expect(polish).toContain('saveSnapshot(id);');
    expect(polish).not.toMatch(/runExact|evaluate\(/);
  });
  it("My runs' Recalculate ask is cleared, never answered with a check", () => {
    expect(script).toMatch(/if \(mine\) ui\.exactAsk = null;/);
  });
});

describe('the box never changes while a search runs', () => {
  it('the box reads the instant answer (or Prefer fewer’s pick of its rows), nothing from a search', () => {
    expect(fn('function dateBoxOf(')).toMatch(
      /if \(preferPicked\.value && dateChoice\.value\) return dateChoice\.value\.chosen\.item;\s+return tableDate\(fallback\);/
    );
    expect(script).toContain('const lead = computed(() => result.value?.best ?? null);');
    for (const f of ['function dateBoxOf(', 'const fastestChoice', 'const dateChoice', 'function behind(', 'function nearTie('])
      expect(fn(f), f).not.toMatch(/store\.(bestChain|deadlineResult|isRunning|deadlineRunning)|searchFound/);
  });
  it('the answer is set only by working it out, its polish, or a saved one put back', () => {
    const sets = script.match(/\bresult\.value = /g) ?? [];
    // run (none at the target, none below the table, the answer, none while waiting), the polish, applySnapshot.
    expect(sets).toHaveLength(6);
    expect(fn('function applySnapshot(')).toContain('result.value = s.result;');
  });
  it('a search result reaches the card only through the pointer and the share box', () => {
    const uses = template.match(/\bpointer\b|searchFound/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    const box = template.slice(template.indexOf('data-testid="instant-box"'), template.indexOf('<!-- THE POINTER'));
    expect(box).not.toMatch(/pointer|searchFound/);
  });
  it('the counts lists show instant numbers only: no exact column, no at-once line, no arrow', () => {
    for (const gone of ['Exact, your account', 'at-once-line', 'instant-row-expand', '· exact', 'exact, your account'])
      expect(template, gone).not.toContain(gone);
  });
});

describe('the one line', () => {
  it('under each box, from lib/searchPointer.ts', () => {
    expect(template.match(/\{\{ INSTANT_ONE_LINE \}\}/g)).toHaveLength(2);
    expect(template.match(/data-testid="instant-one-line"/g)).toHaveLength(2);
  });
  it('replaces the disclaimers that said the same', () => {
    for (const gone of [
      'Exact = the full simulator on your account',
      'hours-shifts-note',
      'Check exactly prices a route with the full simulator',
      'press Check exactly first',
      'Check exactly gives your real',
      'Check exactly gives your own times',
    ])
      expect(src, gone).not.toContain(gone);
    // What the instant answer leaves out, beyond the one line (time off, dates to hit), and the gear's amber box stay.
    expect(template).toContain('Not in the instant answer\'s routes: your {{ leftOut.join(\', \') }}. Fast, Exact and Custom include them.');
    expect(template).toContain('<GearCaveat');
  });
});

describe('the pointer', () => {
  it('By a date and Fastest: the result’s own level and number, then See it ↓', () => {
    expect(script).toContain("const pointer = computed(() => pointerOf(props.deadline ? 'date' : 'fastest', searchFound.value, show));");
    expect(template).toContain('{{ pointer.level }} found <b>{{ pointer.value }}</b> on your account.');
    expect(template).toContain('{{ POINTER_LINK }}');
    expect(template).toContain('@click="seeResult"');
  });
  it('only a finished result for this goal, on this save and account', () => {
    const found = fn('const searchFound');
    expect(found).toContain('store.deadlineRunning ||');
    expect(found).toContain('r.deadline !== props.deadline');
    expect(found).toContain('Math.floor(r.te) !== te');
    expect(found).toContain('ownerMatches(store.deadlineResultOwner)');
    expect(found).toContain('store.isRunning ||');
    expect(found).toContain('chain[chain.length - 1] !== store.finalTE');
    expect(found).toContain('ownerMatches(store.chainResultOwner)');
    expect(found).toContain("foundLevel({ custom: store.runKindUsed === 'full', effort: store.runSettingsUsed?.effort })");
    expect(found).toContain('foundLevel({ custom: !r.simple, effort: r.level })');
  });
  it('See it ↓ shows the part of the panel that holds it, then scrolls to its result card', () => {
    const see = fn('function seeResult(');
    expect(see).toContain("const tab = f.level === 'Custom' ? 'exhaustive' : 'nearby';");
    expect(see).toContain('selectSearchTab(screen, tab);');
    expect(see).toContain("panel?.querySelector('[data-result-card]')");
    expect(fs.readFileSync(path.join(__dirname, 'ResultCardFrame.vue'), 'utf8')).toContain('data-result-card');
  });
});

describe('the box keeps both buttons, and the panel opens on Fast', () => {
  it('Simulate this plan and Follow this route on both boxes', () => {
    const actions = [...template.matchAll(/data-testid="box-actions"[\s\S]*?<\/div>/g)].map(m => m[0]);
    expect(actions).toHaveLength(2);
    for (const a of actions) {
      expect(a).toContain('Simulate this plan');
      expect(a).toContain('<FollowButton');
    }
  });
  it('Fast is the default option, with Find as its main button', () => {
    expect(DEFAULT_SEARCH_OPTION).toBe('fast');
    expect(readChoice('fastest').option).toBe('fast');
    expect(readChoice('by-date').option).toBe('fast');
    expect(fs.readFileSync(path.join(__dirname, 'FindBar.vue'), 'utf8')).toContain("findLabel: 'Find'");
    expect(fs.readFileSync(path.join(__dirname, 'RunControls.vue'), 'utf8')).toContain("findLabel: 'Find'");
  });
});
