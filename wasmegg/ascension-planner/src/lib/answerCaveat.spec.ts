/**
 * ONE caveat line under the answer, the rest behind "Why? ›" (lib/answerCaveat.ts; Jordan, 25 Oct 2026, the UX
 * review's item 3): the priority order, the line from the strongest, and every caveat's words kept for "Why?".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAVEAT_ORDER,
  answerCaveat,
  gearCaveat,
  gearCaveatParts,
  lowTeCaveat,
  type Caveat,
  type GearCaveatInput,
} from './answerCaveat';
import { bracketHeadline, bracketLine, type BracketLineInput } from './bracketLine';
import { OPTIMISTIC_TEXT } from './optimisticAnswer';
import { lowTeOpeningNote } from '@/search/instantIntegrity';
import { showDateTime } from './displayTime';
import { renderHtml, textOf } from '@/test/renderComponent';
import AnswerCaveatLine from '@/components/auto/AnswerCaveatLine.vue';

const G =
  "Your gear isn't one the instant answers were built for, so this answer is the fully maxed one adjusted to your gear's rate (about 1–2% off per ascension). Over a whole route that adds up: in checks on one account, the route it picked finished about 5 to 6 days later than shown. Fast gives your real date.";
const gearIn = (p: Partial<GearCaveatInput>): GearCaveatInput => ({
  gearDiffers: false,
  optimistic: false,
  bonusShort: 0,
  deliveryScale: 0.94,
  fullResearchTe: 340,
  ...p,
});
const bound: Caveat = { kind: 'bound', text: 'BOUND FULL', line: 'With your gear, no sooner than Jun 4, 2029.' };
const low = lowTeCaveat(lowTeOpeningNote({ rounds: 2, openingSeconds: 2 * 86400 }))!;
const exp: Caveat = { kind: 'experimental', text: 'EXPERIMENTAL FULL', line: 'Experimental: treat it as a hint.' };

describe('answerCaveat', () => {
  it('the order is gear, bound, low-TE opening, experimental', () => {
    expect([...CAVEAT_ORDER]).toEqual(['gear', 'bound', 'lowTe', 'experimental']);
  });

  it('nothing in effect: null (no line at all)', () => {
    expect(answerCaveat([])).toBeNull();
    expect(answerCaveat([null, undefined, false, gearCaveat(gearIn({}), OPTIMISTIC_TEXT), lowTeCaveat('')])).toBeNull();
  });

  it('the gear shift wins over the bound and the low-TE note; Why lists all three in full, in order', () => {
    const gear = gearCaveat(gearIn({ gearShift: true }), OPTIMISTIC_TEXT)!;
    const c = answerCaveat([low, bound, gear])!;
    expect(c.line).toBe("About 5 to 6 days later than shown: your gear isn't one the instant answers were built for.");
    expect(c.more).toEqual([G, 'BOUND FULL', low.text]);
  });

  it('no gear caveat: the bound leads', () => {
    const c = answerCaveat([low, bound])!;
    expect(c.line).toBe('With your gear, no sooner than Jun 4, 2029.');
    expect(c.more).toEqual(['BOUND FULL', low.text]);
  });

  it('the low-TE opening alone: its plain line, the full note (with "rough") under Why', () => {
    const c = answerCaveat([low])!;
    expect(c.line).toBe(
      "Dates for your low-TE ascensions are rough: this account can't max its habs in one round of research, vehicles and habs."
    );
    expect(c.more).toEqual([low.text]);
    expect(low.text).toContain('its dates for them are rough');
  });

  it('experimental comes last', () => {
    expect(answerCaveat([exp, low])!.line).toBe(low.line);
    expect(answerCaveat([exp])!.line).toBe('Experimental: treat it as a hint.');
  });

  it('a caveat whose line is its whole text is not repeated under Why', () => {
    const opt = gearCaveat(gearIn({ optimistic: true }), OPTIMISTIC_TEXT)!;
    expect(opt.line).toBe(OPTIMISTIC_TEXT);
    expect(answerCaveat([opt])).toEqual({ line: OPTIMISTIC_TEXT, more: [] });
    expect(answerCaveat([opt, bound])).toEqual({ line: OPTIMISTIC_TEXT, more: ['BOUND FULL'] });
    // No short line given: the full text is the line.
    expect(answerCaveat([{ kind: 'bound', text: 'ONLY' }])).toEqual({ line: 'ONLY', more: [] });
  });

  it('two of the same kind keep the order given', () => {
    const c = answerCaveat([
      { kind: 'bound', text: 'A' },
      { kind: 'bound', text: 'B' },
    ])!;
    expect(c).toEqual({ line: 'A', more: ['B'] });
  });
});

describe('gear caveat words (as GearCaveat.vue showed them)', () => {
  it('the form G sentence alone, never with the optimistic label', () => {
    expect(gearCaveatParts(gearIn({ gearShift: true, gearDiffers: true, optimistic: true }), OPTIMISTIC_TEXT)).toEqual({
      main: G,
      optimistic: '',
    });
  });
  it('gear differs, with the earnings set short and the label: one text, a space between', () => {
    const c = gearCaveat(gearIn({ gearDiffers: true, optimistic: true, bonusShort: 1.234 }), OPTIMISTIC_TEXT)!;
    expect(c.text).toContain(
      "Your gear isn't the gear the instant answer was built on (earnings set 1.23 Clothed TE short, delivery 94.0% of its rate at full research)."
    );
    expect(c.text).toMatch(/A Fast search gives your own times\. This answer may be optimistic/);
    expect(c.line).toBe(
      "Ascensions below about TE 340 can take a few percent more or less: your gear isn't the gear the instant answer was built on."
    );
  });
});

describe('bracketHeadline: the bound in one sentence, exactly when bracketLine has one', () => {
  const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 17) / 1000;
  const show = (u: number) => showDateTime(u, 'UTC');
  const base: BracketLineInput = {
    goal: 'fastest',
    answer: { basis: 'yours', end: at(2032, 6, 7), te: 490 },
    hi: { end: at(2029, 6, 4), te: 490, name: 'gear like 128.7 / 0.99' },
    lo: null,
    show,
  };
  it('the review case: "no sooner than"', () => {
    expect(bracketLine(base)).toContain('no sooner than');
    expect(bracketHeadline(base)).toBe(`With your gear, no sooner than ${show(at(2029, 6, 4))}.`);
  });
  it('a range, and By a date in TE', () => {
    const both = { ...base, lo: { end: at(2033, 1, 1), te: 480, name: 'weaker' } };
    expect(bracketHeadline(both)).toBe(
      `With your gear, likely between ${show(at(2029, 6, 4))} and ${show(at(2033, 1, 1))}.`
    );
    const date: BracketLineInput = {
      ...base,
      goal: 'date',
      answer: { basis: 'maxed', end: null, te: 400 },
      hi: { end: 1, te: 390, name: 'a' },
      lo: { end: 1, te: 380, name: 'b' },
    };
    expect(bracketHeadline(date)).toBe('With your gear, likely between 380 TE and 390 TE by the date.');
  });
  it('empty together', () => {
    const none = { ...base, hi: { ...base.hi!, end: at(2033, 1, 1) } }; // stronger gear later than the answer: disagree
    expect(bracketLine(none)).toBe('');
    expect(bracketHeadline(none)).toBe('');
  });
});

describe('AnswerCaveatLine', () => {
  it('the line, with a closed "Why? ›" listing every caveat; 44 px on phones', async () => {
    const html = await renderHtml(AnswerCaveatLine, { caveat: { line: 'LINE', more: ['ONE', 'TWO'] } });
    expect(html).toMatch(/<details[^>]*data-testid="answer-caveat-why"/);
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    const summary = html.match(/<summary[\s\S]*?<\/summary>/)?.[0] ?? '';
    expect(textOf(summary)).toBe('LINE Why? ›');
    expect(summary).toContain('min-h-[44px]');
    const list = html.match(/<ul[^>]*data-testid="answer-caveat-more"[\s\S]*?<\/ul>/)?.[0] ?? '';
    expect(list.match(/<li/g)).toHaveLength(2);
    expect(textOf(list)).toBe('ONE TWO');
  });
  it('nothing more to say: the line alone, no Why', async () => {
    const html = await renderHtml(AnswerCaveatLine, { caveat: { line: 'LINE', more: [] } });
    expect(textOf(html)).toBe('LINE');
    expect(html).not.toContain('<details');
  });
  it('no caveat: nothing', async () => {
    expect(textOf(await renderHtml(AnswerCaveatLine, { caveat: null }))).toBe('');
  });
});

describe('InstantRoute wiring', () => {
  const src = readFileSync(new URL('../components/auto/InstantRoute.vue', import.meta.url), 'utf8');
  const template = src.slice(0, src.indexOf('<script setup'));
  it('one caveat line in each answer box, right under the headline', () => {
    expect(template.match(/<AnswerCaveatLine :caveat="headCaveat" \/>/g)).toHaveLength(2);
    const fast = template.slice(template.indexOf('in {{ days(boxLead.seconds) }}'));
    expect(fast.indexOf('<AnswerCaveatLine')).toBeLessThan(fast.indexOf('{{ boxLead.chain.join'));
    const date = template.slice(template.indexOf('Reached {{ show(dateBoxOf(result.byDate).end) }}'));
    expect(date.indexOf('<AnswerCaveatLine')).toBeLessThan(date.indexOf('<PreferFewerNote'));
  });
  it('with the box on screen, the bound, the low-TE note and the gear box are not shown on their own', () => {
    expect(template).toContain('v-else-if="bracketText && !boxShown"');
    expect(template).toContain('lowTeNote && !below && !boxShown"');
    expect(template).toMatch(/<GearCaveat[^>]*v-if="!boxShown"/);
  });
  it('builds the caveats as gear, bound, low-TE', () => {
    const body = src.slice(src.indexOf('const headCaveat = computed('));
    const g = body.indexOf('gearCaveat(');
    const b = body.indexOf("kind: 'bound'");
    const l = body.indexOf('lowTeCaveat(lowTeNote.value)');
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(b);
    expect(b).toBeLessThan(l);
    expect(body).toContain('line: bracketHeadline(bracketInput.value)');
  });
});
