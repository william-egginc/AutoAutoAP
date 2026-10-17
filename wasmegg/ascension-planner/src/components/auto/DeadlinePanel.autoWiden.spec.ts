/**
 * By a date's Nearby routes with no instant answer (search/autoWiden.ts), the panel's half: Find goes
 * through the fallback only then, its status line shows by the run, Stop ends it, and the answer says
 * what it did.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import EdgeWarning from './EdgeWarning.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { autoFallbackNote } from '@/search/autoWiden';

const panel = fs.readFileSync(path.join(__dirname, 'DeadlinePanel.vue'), 'utf8');
const template = panel.slice(0, panel.indexOf('</template>\n\n<script'));
const script = panel.slice(panel.indexOf('<script'));
const fallback = script.slice(
  script.indexOf('async function findWithoutInstant'),
  script.indexOf('// ----', script.indexOf('async function findWithoutInstant'))
);

describe('the no-instant-answer fallback on By a date', () => {
  it('Find on Nearby routes takes it only without an instant answer; Exhaustive never', () => {
    expect(script).toContain(
      "if (kind === 'around' && simple.value && simpleFrom.value !== 'instant') await findWithoutInstant();\n    else await find();"
    );
  });

  it('shows its status line with the run, in the box whose run it is', () => {
    const progress = template.slice(template.indexOf('<template #progress>'), template.indexOf('<template #after>'));
    expect(progress).toContain('v-if="autoStatus"');
    expect(progress).toContain('data-test="auto-widen-status"');
    expect(progress.indexOf('auto-widen-status')).toBeGreaterThan(progress.indexOf('data-run-progress'));
  });

  it('scans first only when needed, then runs Nearby routes, then widens', () => {
    expect(fallback).toContain('needsQuickScan(');
    expect(fallback).toContain('quickScanSpec(');
    expect(fallback.indexOf('quickScanSpec(')).toBeLessThan(
      fallback.indexOf('await find({ scanned, widenRounds: 0 })')
    );
    expect(fallback.indexOf('await find({ scanned, widenRounds: 0 })')).toBeLessThan(fallback.indexOf('runAutoWiden('));
    expect(fallback).toContain('await find({ scanned, widenRounds: d.round })');
  });

  it('never starts a round during another run or after a stop, and keeps the best route', () => {
    expect(fallback).toContain('busy: store.busy');
    expect(fallback).toContain('stopped: ended()');
    // Stop from the panel or the run bar: read from the run itself.
    expect(fallback).toContain('lastStopped = autoStop.value || !now || !!store.error || now.stoppedEarly');
    expect(script).toMatch(
      /function stopDeadline\(\): void \{\n {2}stopAsked\.value = true;\n {2}autoStop\.value = true;/
    );
    expect(fallback).toContain('store.restoreDeadlineResult(prev)');
    expect(fallback).toContain('betterRoute(');
    // And clears up after itself.
    expect(fallback).toContain('simpleNext.value = null');
    expect(fallback).toContain("autoStatus.value = ''");
    expect(fallback).toContain('store.dropDeadlineSends(drop)');
  });

  it('widens the box that holds the best route, keeping the other rows as the run had them', () => {
    expect(fallback).toContain('k === box.row ? { asc: r.asc, text: d.text } : { ...r }');
    expect(script).toContain('simpleNext.value\n    ? simpleNext.value');
  });

  it('the answer says what it did, in place of the rough-guess note', () => {
    const note = script.slice(script.indexOf('const noInstantNote'), script.indexOf('/** A Simple run'));
    expect(note).toContain('if (r.fallback) return autoFallbackNote(r.fallback);');
    expect(note.indexOf('autoFallbackNote')).toBeLessThan(note.indexOf('noInstantAnswerText('));
  });

  it('renders the note beside an edge that is still there after the rounds', async () => {
    const line = "Your best route's 2nd stop (94) is the lowest value its box allows; a wider box may find better.";
    const note = autoFallbackNote({ scanned: true, widenRounds: 3 });
    const text = textOf(await renderHtml(EdgeWarning, { lines: [line, note], canWiden: true, disabled: false }));
    expect(text).toContain('No instant answer for your TE yet: started from a quick scan and widened automatically.');
    expect(text).not.toMatch(/table/i);
  });
});
