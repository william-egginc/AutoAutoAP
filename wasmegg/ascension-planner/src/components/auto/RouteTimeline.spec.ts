/**
 * The arrows (batch 16, item 6): ResultTable's expand slot and RouteTimeline, server-rendered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import ResultTableSfc from './ResultTable.vue';
import RouteTimeline from './RouteTimeline.vue';
import { showWhen } from '@/lib/displayTime';
import type { LegSummary } from '@/search/types';
import type { Component } from 'vue';

/** The generic SFC, as a plain component for renderHtml. */
const ResultTable = ResultTableSfc as unknown as Component;

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const H = 3600;
const ZONE = 'America/Chicago';
// Nov 3 2:00 pm Chicago (CST from Nov 1 2026).
const T0 = Date.parse('2026-11-03T20:00:00Z') / 1000;

const legs: LegSummary[] = [
  {
    key: '1-sale',
    endTE: 210,
    durationSeconds: 50 * H,
    maxELR: 1,
    startTime: T0,
    endTime: T0 + 50 * H,
    tier13Unlocked: false,
    shifts: [{ at: T0 + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 }],
    endEgg: { egg: 'integrity', te: 45 },
  },
  {
    key: '1-sale',
    endTE: 230,
    durationSeconds: 0,
    maxELR: 0,
    endTime: T0 + 90 * H,
    tier13Unlocked: false,
    replayed: true,
  },
];

describe('RouteTimeline', () => {
  it('a line per ascension, and under each its eggs with the TE they reach and when', async () => {
    const t = textOf(await renderHtml(RouteTimeline, { chain: [210, 230], legs, zone: ZONE, open: true }));
    expect(t).toContain(`A1 → 210 TE · reached ${showWhen(T0 + 50 * H, ZONE)}`);
    expect(t).toContain(`Curiosity reaches 41 TE on ${showWhen(T0 + 2 * H, ZONE)}`);
    expect(t).toContain('on it from the start, last shift off it then');
    expect(t).toContain(`Integrity reaches 45 TE on ${showWhen(T0 + 50 * H, ZONE)}`);
    expect(t).toContain(`first shift ${showWhen(T0 + 2 * H, ZONE)}, still on it when the stop is reached`);
    // The replayed ascension: its stop, no eggs, and a note saying why.
    expect(t).toContain(`A2 → 230 TE · reached ${showWhen(T0 + 90 * H, ZONE)}`);
    expect(t).toContain("Each egg's times weren't kept for the ascensions without an arrow");
  });

  it('12-hour times with am/pm in the planner\'s zone ("Nov 3 at 4:00 pm")', () => {
    expect(showWhen(T0 + 2 * H, ZONE, 'local', T0)).toBe('Nov 3 at 4:00 pm');
    expect(showWhen(T0 + 2 * H, 'UTC', 'local', T0)).toBe('Nov 3 at 10:00 pm');
    // The year only when it isn't this year.
    // (Still daylight time in Chicago on Nov 3, 2027.)
    expect(showWhen(T0 + 365 * 24 * H, ZONE, 'local', T0)).toBe('Nov 3, 2027 at 3:00 pm');
    expect(showWhen(0, ZONE)).toBe('');
  });

  it('a native <details> per ascension (the sub-arrow), shut unless asked', async () => {
    const html = await renderHtml(RouteTimeline, { chain: [210, 230], legs, zone: ZONE });
    expect(html.match(/<details/g)?.length).toBe(1);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain('<summary');
  });

  it('only one ascension (a leg table row)', async () => {
    const t = textOf(await renderHtml(RouteTimeline, { chain: [210, 230], legs, zone: ZONE, only: 1 }));
    expect(t).toContain('A2 → 230 TE');
    expect(t).not.toContain('A1 →');
  });

  it('a route priced before shifts kept their TE: times, no TE, and it says so', async () => {
    const old = [
      { ...legs[0], shifts: [{ at: T0 + 2 * H, egg: 'integrity', fromEgg: 'curiosity' }], endEgg: undefined },
    ];
    const t = textOf(await renderHtml(RouteTimeline, { chain: [210], legs: old, zone: ZONE, open: true }));
    // (textOf puts a space where the name's tag ends.)
    expect(t).toContain(`Curiosity : ${showWhen(T0, ZONE)} to ${showWhen(T0 + 2 * H, ZONE)}`);
    expect(t).not.toMatch(/reaches \d+ TE/);
    expect(t).toContain("priced before the planner kept each egg's TE");
  });

  it('no legs: one line, never a guess', async () => {
    const t = textOf(await renderHtml(RouteTimeline, { chain: [210], legs: null, zone: ZONE }));
    expect(t).toBe("When each stop happens wasn't kept for this route.");
  });
});

describe('ResultTable expand slot', () => {
  const rows = [
    { chain: [210, 230], legs },
    { chain: [215, 230], legs: [] as LegSummary[] },
  ];
  const cells = { default: ({ row }: { row: (typeof rows)[0] }) => h('td', row.chain.join(' ')) };

  it('an arrow in the first cell of each row that has something to show', async () => {
    const html = await renderHtml(
      ResultTable,
      {
        rows,
        rowKey: (r: (typeof rows)[0]) => r.chain.join(','),
        canExpand: (r: (typeof rows)[0]) => r.legs.length > 0,
      },
      {
        ...cells,
        expand: ({ row }: { row: (typeof rows)[0] }) =>
          h(RouteTimeline, { chain: row.chain, legs: row.legs, zone: ZONE }),
      }
    );
    expect(html.match(/data-testid="result-row-expand"/g)?.length).toBe(1);
    expect(html).toContain('aria-label="Show when each stop of 210 230 happens"');
    expect(html).toContain('aria-expanded="false"');
    // Shut: no drill-down row.
    expect(html).not.toContain('data-testid="result-row-detail"');
  });

  it('the open row: a full-width row under it with the drill-down, wrapping on a phone', async () => {
    const html = await renderHtml(
      ResultTable,
      { rows, rowKey: (r: (typeof rows)[0]) => r.chain.join(','), initialOpen: '210,230' },
      {
        ...cells,
        expand: ({ row }: { row: (typeof rows)[0] }) =>
          h(RouteTimeline, { chain: row.chain, legs: row.legs, zone: ZONE }),
      }
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toMatch(/data-testid="result-row-detail"><td colspan="100" class="[^"]*whitespace-normal/);
    expect(textOf(html)).toContain('A1 → 210 TE');
  });

  it('without the slot: no arrow column, as before', async () => {
    const html = await renderHtml(ResultTable, { rows, rowKey: (r: (typeof rows)[0]) => r.chain.join(',') }, cells);
    expect(html).not.toContain('result-row-expand');
  });

  it('hosts: By a date (its best per stop count; its top routes moved to Your latest run, 16 Oct), the instant answer, the leg tables, and Light keeps its legs', () => {
    const deadline = read('DeadlinePanel.vue');
    expect(deadline.match(/<RouteTimeline :chain="r.chain" :legs="r.legs" :zone="plannerZone" \/>/g)?.length).toBe(1);
    expect(read('LatestRunView.vue').match(/<RouteTimeline :chain="r.chain" :legs="r.legs" :zone="zone" \/>/g)?.length).toBe(3);
    const instant = read('InstantRoute.vue');
    expect(instant.match(/data-testid="instant-row-expand"/g)?.length).toBe(2);
    expect(instant).toContain(':legs="exactLegsOf(');
    expect(instant).toContain(':legs="atOnceLegsOf(');
    expect(read('ChainSearchPanel.vue')).toMatch(/<RouteTimeline[\s\S]*?:only="i"/);
    expect(read('ByDateRouteCard.vue')).toMatch(
      /<RouteTimeline :chain="route.chain" :legs="legs" :zone="zone" :only="i" open \/>/
    );
    expect(read('StrongerCheck.vue')).toMatch(/\.\.\.\(r\.legs\.length \? \{ legs: r\.legs \} : \{\}\)/);
  });
});
