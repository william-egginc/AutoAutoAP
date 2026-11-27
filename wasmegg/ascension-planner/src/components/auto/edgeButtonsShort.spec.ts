/**
 * The edge box's buttons and the route line, as in the Custom and By a date mocks (UX fluff review 2, 5 Nov 2026, item
 * C0b; wireframes/fluff2-custom-v1, fluff2-bydate-v1): "Widen and run again (13 routes)" with no sentence under it,
 * "Add a box with 6", and the result cards' routes with arrows ("228 → 257 → 285"). DRAFT wording for Words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import EdgeWarning from './EdgeWarning.vue';
import RouteResultCard from './RouteResultCard.vue';
import ByDateRouteCard from './ByDateRouteCard.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the edge box, short', () => {
  it('Widen carries the size of the wider space; Custom passes it and says nothing under it', async () => {
    const t = textOf(await renderHtml(EdgeWarning, { lines: ['Edge.'], canWiden: true, disabled: false, routes: '13 routes' }));
    expect(t).toBe('Edge. Widen and run again (13 routes)');
    const panel = read('InsanePanel.vue');
    expect(panel).toContain(':routes="edgeWiden ? plural(edgeWiden.chains, \'route\') : \'\'"');
    expect(panel).not.toContain('The wider space is');
  });
  it('"Add a box with 6" on Custom', () => {
    expect(read('LongerRouteHint.vue')).toContain("`Add a box with ${h.count}`");
  });
});

describe('the cards’ routes have arrows', () => {
  it('Fastest and By a date', async () => {
    expect(textOf(await renderHtml(RouteResultCard, { chain: [228, 257, 490], days: 600, finalTE: 490, endLabel: 'x', running: false }))).toContain(
      '228 → 257 → 490'
    );
    const DEADLINE = 1_815_660_000;
    const route = { chain: [218, 247, 311], reachAt: DEADLINE - 3600, ascendAt: DEADLINE - 3600, spare: 3600, legs: [] };
    expect(textOf(await renderHtml(ByDateRouteCard, { route, deadline: DEADLINE, zone: 'UTC' }))).toContain('218 → 247 → 311');
  });
});
