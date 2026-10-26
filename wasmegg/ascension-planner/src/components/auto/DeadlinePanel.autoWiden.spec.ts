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
    const go = script.slice(script.indexOf('async function start('), script.indexOf('async function find('));
    expect(go).toContain("if (kind === 'around' && simple.value && simpleFrom.value !== 'instant') {");
    expect(go).toContain('} else await find();');
    // Once the instant answer has settled: with a route, the normal run around it; else the fallback.
    expect(go).toContain("if (d.go === 'normal') await find();\n      else await findWithoutInstant(d.timedOut);");
    expect(go.indexOf('await awaitInstant(')).toBeLessThan(go.indexOf('findWithoutInstant('));
  });

  it('waits for the instant answer to settle, with a line by Find, and no second Find meanwhile', () => {
    const go = script.slice(script.indexOf('async function start('), script.indexOf('async function find('));
    expect(go).toContain('read: () => instantNow.value');
    expect(go).toContain('onWait: () => (instantWait.value = INSTANT_WAIT_STATUS)');
    expect(go).toContain("instantWait.value = '';");
    expect(go).toContain('if (store.busy || instantWait.value) return;');
    expect(template).toContain('@state="st => (instantLoad = st)"');
    expect(template).toContain('!!instantWait ||');
    const above = template.slice(template.indexOf('<template #above-find>'), template.indexOf('<template #progress>'));
    expect(above).toContain('data-test="instant-wait-status"');
    // Loading while InstantRoute works it out; once settled, in only with a route to centre on.
    expect(script).toContain(
      "instantLoad.value === 'loading' ? 'loading' : simpleFrom.value === 'instant' ? 'answer' : 'none'"
    );
  });

  it('centres on an earlier answer only for this date and near this TE, and says when it gave up waiting', () => {
    expect(fallback).toContain(
      '{ deadline: earlier.deadline, te: earlier.te, chains: earlier.byStops.map(r => r.chain) }'
    );
    expect(fallback).toContain('deadline: deadline.value,');
    expect(fallback).toContain('if (timedOut) autoStatus.value = INSTANT_TIMEOUT_STATUS;');
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

  it('widens the box that holds the best route; the other counts run again as just their best route', () => {
    expect(fallback).toContain('simpleNext.value = { chains: nextRoundChains(d.text), lastBox: used.lastBox };');
    expect(script).toContain('row: edgeBox.value?.row ?? -1,');
    expect(script).toContain('byStops: store.deadlineResult?.byStops.map(r => r.chain) ?? [],');
    expect(script).toContain('simpleNext.value\n    ? simpleNext.value');
  });

  it('holds the whole fallback to its time: Nearby sized to what is left, a round only when it fits', () => {
    expect(fallback).toContain('const t0 = Date.now();');
    expect(fallback).toContain('fallbackSeconds.value = nearbyBudgetSeconds(elapsed());');
    expect(fallback).toContain('if (scanned) autoStatus.value = afterScanStatus(fallbackSeconds.value);');
    expect(fallback.indexOf('nearbyBudgetSeconds(')).toBeLessThan(
      fallback.indexOf('await find({ scanned, widenRounds: 0 })')
    );
    expect(fallback).toContain('roundSeconds: boxesSeconds(nextRoundChains(d.text), simpleRunBoxes.value.lastBox),');
    expect(fallback).toContain('fallbackSeconds.value = null;');
    // Nearby's boxes on this machine's own speed and workers while the fallback goes.
    const space = script.slice(script.indexOf('function spaceFor('), script.indexOf('/** The level the bar is on'));
    expect(space).toContain('maxSeconds: own ? Math.min(cfg.maxSeconds, own) : cfg.maxSeconds,');
    expect(space).toContain(
      'simplePlanOf(sp, store.workerBudget, store.deadlineWorkerSeconds || weightedSecondsPerLeg(sp))'
    );
  });

  it('after the fallback, Widen and run again is there whenever the best route is still on an edge', () => {
    expect(template).toContain('v-if="edges.length && !store.deadlineRunning"');
    expect(template).toContain('@widen="widenAndRun"');
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

describe("the instant answer's state, for Find on Nearby routes", () => {
  const instant = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
  const state = instant.slice(instant.indexOf('const instantState = computed'), instant.indexOf("emit('state', s)"));

  it('is loading while a run is due or going, in with an answer, else settled with none', () => {
    // Waiting for the save set up (search/startProvenance.ts) is loading too.
    expect(state).toContain(
      "if (runDue.value || tablesWait.value || !store.setupLoaded || store.startWait || status.value === 'loading') return 'loading';"
    );
    expect(state).toContain("return status.value === 'done' && result.value ? 'answer' : 'none';");
    expect(instant).toContain("watch(instantState, s => emit('state', s), { immediate: true });");
  });

  it('counts the wait before a run as loading: the answer on screen is for the inputs before', () => {
    expect(instant).toMatch(
      /runDue\.value = true;\n {4}timer = setTimeout\(\(\) => \{\n {6}runDue\.value = false;\n {6}void run\(\);/
    );
  });
});

describe('the instant answer still being worked out (23 Oct 2026, Jordan: By a date with hours 7 am to 5 am)', () => {
  it('Nearby routes says so plainly, and that Run waits up to 10 seconds, then uses suggested routes until it is ready', () => {
    const still = template.indexOf("v-else-if=\"instantLoad === 'loading'\"");
    expect(still).toBeGreaterThan(template.indexOf("simpleFrom === 'instant'"));
    expect(still).toBeLessThan(template.indexOf('No instant answer yet'));
    const words = template
      .slice(still, template.indexOf('</template', still))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    expect(words).toContain(
      'The instant answer is still being worked out. Run waits up to {{ INSTANT_SETTLE_MS / 1000 }} seconds for it, then checks suggested routes for {{ nearbyRange.min }}-{{ Math.min(5, nearbyRange.max) }} ascensions until it is ready: {{ simpleWidthsText }}.'
    );
    expect(script).toContain('  INSTANT_SETTLE_MS,');
    // Find stays available while it is worked out (only a wait already going, or a run, disables it).
    expect(script).toContain('if (store.busy || instantWait.value) return;');
  });
});
