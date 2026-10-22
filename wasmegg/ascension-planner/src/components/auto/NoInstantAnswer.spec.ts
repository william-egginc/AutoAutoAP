/**
 * No instant answer for the player's TE (Jordan, 18 Oct 2026): where the answer would be, a clear line and
 * one button that runs the quick estimate (the quick scan, then the capped Nearby routes and its one
 * budgeted widening round: DeadlinePanel.vue `findWithoutInstant`). By a date runs it; Fastest points there.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { h } from 'vue';
import NoInstantAnswer from './NoInstantAnswer.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import {
  NO_INSTANT_SUMMARY,
  QUICK_ESTIMATE_LABEL,
  noInstantHeading,
  quickEstimateIssue,
  quickEstimateNote,
} from '@/search/autoWiden';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const instant = read('InstantRoute.vue');
const instantTemplate = instant.slice(0, instant.indexOf('<script'));
const panel = read('DeadlinePanel.vue');
const panelTemplate = panel.slice(0, panel.indexOf('</template>\n\n<script'));
const panelScript = panel.slice(panel.indexOf('<script'));
const fastest = read('FastestRoute.vue');

describe('the heading', () => {
  it('names the table’s own lowest TE, else says there is none for this TE yet', () => {
    expect(noInstantHeading(120)).toBe('No instant answer below TE 120.');
    expect(noInstantHeading(118)).toBe('No instant answer below TE 118.');
    expect(noInstantHeading(null)).toBe('No instant answer for your TE yet.');
    expect(noInstantHeading(0)).toBe('No instant answer for your TE yet.');
  });

  it('takes the lowest TE from the table header, not a number written in', () => {
    expect(instant).toContain('below.value = { from: h.from, te };');
    expect(instantTemplate).toContain(':heading="noInstantHeading(below.from)"');
    // A file that couldn't be loaded says so (InstantRoute.unloaded.spec.ts), not "for your TE".
    expect(instantTemplate).toContain(':heading="TABLE_LOAD_FAILED"');
    expect(instantTemplate).not.toMatch(/below TE 120/);
  });
});

describe('the card', () => {
  it('renders both reasons, with the line under it', async () => {
    const low = textOf(
      await renderHtml(NoInstantAnswer, { heading: noInstantHeading(120), sub: 'Your route starts at TE 93.' })
    );
    expect(low).toContain('No instant answer below TE 120.');
    expect(low).toContain('Your route starts at TE 93.');
    const none = textOf(await renderHtml(NoInstantAnswer, { heading: noInstantHeading(null) }));
    expect(none).toContain('No instant answer for your TE yet.');
  });

  it('on Fastest (no slot): points to By a date’s quick estimate, with a 44 px button that opens it', async () => {
    const html = await renderHtml(NoInstantAnswer, { heading: noInstantHeading(120) });
    // (textOf puts a space where the <b> closes.)
    const text = textOf(html).replace(/ \./g, '.');
    expect(html).toContain('</b>. ');
    expect(text).toContain(
      `The quick estimate is on Highest TE by a date: pick a date there and press ${QUICK_ESTIMATE_LABEL}.`
    );
    expect(text).toContain('Nearby routes below still runs here, starting from a route spaced out from your TE.');
    expect(text).toContain('Open Highest TE by a date');
    expect(html).toMatch(/class="min-h-\[44px\][^"]*"[^>]*data-testid="instant-none-open-by-date"/);
  });

  it('By a date’s slot replaces the pointer', async () => {
    const text = textOf(
      await renderHtml(NoInstantAnswer, { heading: noInstantHeading(120) }, { default: () => h('p', 'the button') })
    );
    expect(text).toContain('the button');
    expect(text).not.toContain('Open Highest TE by a date');
  });
});

describe('InstantRoute shows the card in place of the old note', () => {
  it('below the table: the card, not the amber error line, and not the low-TE opening note', () => {
    const card = instantTemplate.indexOf('v-else-if="status === \'error\' && below"');
    const error = instantTemplate.indexOf('v-else-if="status === \'error\'"\n');
    expect(card).toBeGreaterThan(0);
    expect(card).toBeLessThan(error);
    expect(instantTemplate).toContain('v-if="status !== \'loading\' && !atTarget && lowTeNote && !below"');
    // A new answer clears it.
    expect(instant).toMatch(/noTable\.value = false;\n {2}below\.value = null;/);
  });

  it('no table on the site: only the card (it used to show nothing)', () => {
    expect(instantTemplate).toContain('<section v-else');
    expect(instantTemplate).toContain('data-testid="instant-no-table"');
  });

  it('passes the page’s own slot through, both places', () => {
    const forwards = instantTemplate.match(
      /<template v-if="\$slots\['no-answer'\]" #default><slot name="no-answer" \/><\/template>/g
    );
    expect(forwards).toHaveLength(2);
    expect(instantTemplate.match(/@by-date="emit\('by-date'\)"/g)).toHaveLength(2);
  });
});

describe('By a date: Get a quick estimate', () => {
  const slot = panelTemplate.slice(panelTemplate.indexOf('<template #no-answer>'), panelTemplate.indexOf('</InstantRoute>'));

  it('the button starts exactly Find on Nearby routes without an instant answer', () => {
    expect(slot).toContain('{{ QUICK_ESTIMATE_LABEL }}');
    expect(slot).toContain('@click="quickEstimate"');
    const fn = panelScript.slice(panelScript.indexOf('function quickEstimate('), panelScript.indexOf('const quickRunning'));
    expect(fn).toContain("void start(false, 'around');");
    // `start` goes to the one fallback: no copy of it here.
    expect(panelScript).toContain('else await findWithoutInstant(d.timedOut);');
    expect(panelScript.match(/async function findWithoutInstant\(/g)).toHaveLength(1);
    expect(panelScript.match(/quickScanSpec\(/g)).toHaveLength(1);
  });

  it('greyed out with a reason, and the reason shown', () => {
    expect(slot).toContain(':disabled="!!quickIssue"');
    expect(slot).toContain('{{ quickIssue }}');
    const issue = panelScript.slice(panelScript.indexOf('const quickIssue'), panelScript.indexOf('function quickEstimate('));
    expect(issue).toContain('setupLoaded: store.setupLoaded,');
    expect(issue).toContain('busy: store.busy || !!instantWait.value,');
    expect(issue).toContain('blocked: store.integrityBlocked || store.staleBackupBlocked,');
    expect(issue).toContain('canStart: canStartAround.value,');
    expect(issue).toContain('issue: aroundIssue.value,');
  });

  it('while it runs: the fallback’s own status line and a Stop that keeps the best', () => {
    expect(panelScript).toContain("const quickRunning = computed(() => runKind.value === 'around');");
    const status = panelScript.slice(panelScript.indexOf('const quickStatus'), panelScript.indexOf('const quickBest'));
    expect(status).toContain('instantWait.value ||');
    expect(status).toContain('autoStatus.value ||');
    expect(slot).toContain('{{ quickStatus }}');
    expect(slot).toContain('@click="stopDeadline"');
    expect(slot).toContain('Stop &amp; keep best');
  });

  it('after it: the best route in the usual card, and that it was a quick estimate', () => {
    expect(slot).toContain('<ByDateRouteCard :route="quickBest"');
    expect(slot).toContain('{{ quickEstimateNote(!!edges.length && !!edgeWiden) }}');
    const bestOf = panelScript.slice(panelScript.indexOf('const quickBest'), panelScript.indexOf('function showQuickRun'));
    expect(bestOf).toContain("r?.fallback && resultKind.value === 'around' && !store.deadlineRunning ? best.value : null");
    // Widen and run again stays where it was, under Nearby routes' answer.
    expect(panelTemplate).toContain('v-if="edges.length && !store.deadlineRunning"');
  });

  it('every button in the card is a 44 px tap target', () => {
    const buttons = slot.match(/<button[\s\S]*?>/g) ?? [];
    expect(buttons.length).toBe(3);
    for (const b of buttons) expect(b).toContain('min-h-[44px]');
  });

  it('never asks the big-box question (the fallback’s boxes are small; Q7b only asks for Exhaustive)', () => {
    expect(panelScript).toContain("if (kind === 'boxes' && !asked && !(await confirmBigBox(bigBoxInput.value))) return;");
  });
});

describe('the reason it is greyed out', () => {
  const ok = { setupLoaded: true, busy: false, blocked: false, canStart: true, issue: '' };
  it('can start', () => expect(quickEstimateIssue(ok)).toBe(''));
  it('Your setup still loading comes first', () =>
    expect(quickEstimateIssue({ ...ok, setupLoaded: false, busy: true })).toBe('Waiting for your setup to load…'));
  it('another run', () =>
    expect(quickEstimateIssue({ ...ok, busy: true })).toBe('Another search is running; this can start once it ends.'));
  it('a save problem', () =>
    expect(quickEstimateIssue({ ...ok, blocked: true })).toBe('Your save needs a look first (see the note above).'));
  it('what Nearby routes’ Find would refuse', () => {
    expect(quickEstimateIssue({ ...ok, canStart: false, issue: 'The deadline is before the plan starts.' })).toBe(
      'The deadline is before the plan starts.'
    );
    expect(quickEstimateIssue({ ...ok, canStart: false })).toBe('Pick a date and time first.');
  });
});

describe('notes say one thing', () => {
  it('after the estimate: Widen and run again when there is an edge, else Exhaustive', () => {
    expect(quickEstimateNote(true)).toBe('This is a quick estimate: Widen and run again looks further.');
    expect(quickEstimateNote(false)).toBe('This is a quick estimate: Exhaustive looks further, in boxes you set.');
  });

  it('the folded Instant answer line says none, not "working out…" forever', () => {
    expect(NO_INSTANT_SUMMARY).toBe('none for your TE');
    // (Or that it couldn't be loaded: InstantRoute.unloaded.spec.ts.)
    for (const src of [panelScript, fastest])
      expect(src).toMatch(/instantLoad\.value === 'none'\s*\?[^:]*\?\s*UNLOADED_INSTANT_SUMMARY\s*:\s*NO_INSTANT_SUMMARY\s*:\s*'working out…'/);
  });

  it('no "table" in the player’s words', () => {
    for (const s of [noInstantHeading(120), noInstantHeading(null), quickEstimateNote(true), quickEstimateNote(false)])
      expect(s).not.toMatch(/table/i);
  });
});

describe('Fastest', () => {
  it('has no quick estimate of its own: the card opens By a date', () => {
    expect(fastest).toContain("@by-date=\"emit('by-date')\"");
    expect(fastest).not.toContain('#no-answer');
    const app = fs.readFileSync(path.join(__dirname, '../../App.vue'), 'utf8');
    expect(app).toContain("@by-date=\"goAuto('by-date')\"");
  });
});
