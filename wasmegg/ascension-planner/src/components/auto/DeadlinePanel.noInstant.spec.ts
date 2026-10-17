/**
 * By a date with no instant answer for the player's TE (a low-TE player, 16 Oct 2026): the boxes were
 * a rough guess, so the result says so, in the edge warning beside "Widen and run again" when there is
 * one, else on its own near the results. And the edge check judges the 1st stop against the TE a run
 * again would start from, so a 1st stop at TE + 1 is never an edge.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import EdgeWarning from './EdgeWarning.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { noInstantAnswerText } from '@/search/bandCheck';

const panel = fs.readFileSync(path.join(__dirname, 'DeadlinePanel.vue'), 'utf8');
const template = panel.slice(0, panel.indexOf('</template>\n\n<script'));
const script = panel.slice(panel.indexOf('<script'));

describe('no instant answer note', () => {
  it('renders in the edge warning, after the edge lines', async () => {
    const line = "Your best route's 2nd stop (94) is the lowest value its box allows; a wider box may find better.";
    const text = textOf(
      await renderHtml(EdgeWarning, { lines: [line, noInstantAnswerText(true)], canWiden: true, disabled: false })
    );
    expect(text).toContain(line);
    expect(text).toContain(
      'No instant answer for your TE yet, so this search started from a rough guess; Widen and run again is worth it.'
    );
    expect(text.indexOf('No instant answer')).toBeGreaterThan(text.indexOf('2nd stop'));
  });

  it('the panel adds it to the edge lines, or shows it on its own without an edge', () => {
    expect(template).toContain(':lines="noInstantNote ? [...edges.map(edgeText), noInstantNote] : edges.map(edgeText)"');
    const own = template.slice(template.indexOf('v-else-if="noInstantNote'));
    expect(own).toMatch(/^v-else-if="noInstantNote && !store\.deadlineRunning"/);
    expect(own.slice(0, own.indexOf('</p>'))).toContain('data-test="no-instant-note"');
  });

  it('only for a run that had no instant answer: no instantSets recorded', () => {
    const note = script.slice(script.indexOf('const noInstantNote'), script.indexOf('/** A Simple run'));
    expect(note).toContain('if (r.instantSets?.length) return');
    expect(note).toContain('store.deadlineRunning');
    expect(note).toContain('noInstantAnswerText(');
  });

  it('judges edges and widens from the TE a run again starts from, never only the run’s own', () => {
    expect(script).toContain('const edgeTE = computed(() => Math.max(result.value?.te ?? 0');
    expect(script).toContain('findBandEdges(box.bands, b.chain, { currentTE: edgeTE.value');
    expect(script).toContain('widenEdges(box.bands, edges.value, { currentTE: edgeTE.value');
    expect(script).not.toMatch(/currentTE: result\.value\.te/);
  });
});
