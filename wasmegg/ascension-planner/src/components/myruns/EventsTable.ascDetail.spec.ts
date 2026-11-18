/**
 * ONE TIMELINE ON MY RUNS (Jordan, 17 Nov 2026, on egg-beta 3b7d28bb4: "Can we merge 'full timeline' with the 'you are here' (so they can
 * open up the timelines if they want) that decreases redundancy"). Each ascension's row in You are here ("A2 ends · Prestige at 247 TE", and
 * the goal row of the last one) opens to that ascension's shifts and dates; the separate "Full timeline" fold, its slot above More and its
 * remembered state are gone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import EventsTable from './EventsTable.vue';
import type { PlanEvent } from '@/lib/nowPlan';
import { ascDetailLabel } from '@/lib/timelineWords';

const ZONE = 'America/Denver';
const T0 = Date.UTC(2027, 0, 1, 5, 17) / 1000;
const NOW = T0 - 6 * 3600;
const events = (): PlanEvent[] => [
  { kind: 'shift', at: T0 - 3600, asc: 1, egg: 'kindness', past: false, next: true } as PlanEvent,
  { kind: 'prestige', at: T0, asc: 1, te: 222, past: false, next: false } as PlanEvent,
  { kind: 'prestige', at: T0 + 86400 * 5, asc: 2, te: 247, past: false, next: false } as PlanEvent,
  { kind: 'goal', at: T0 + 86400 * 9, asc: 3, te: 490, past: false, next: false } as PlanEvent,
];
const base = {
  goal: 'fastest' as const,
  goalName: 'Fastest to 490 TE',
  now: NOW,
  zone: ZONE,
  saveWhen: 'x',
  calculatedWhen: 'y',
  rounded: true,
};
const detail = ({ asc }: { asc: number }) => h('p', { 'data-testid': 'slot-detail' }, `DETAIL OF A${asc}`);
const here = { egg: 'kindness', te: 200, saveWhen: 'x' };
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');

describe('each ascension row opens', () => {
  it("has a button on every ascension's row (A1 ends, A2 ends, and the goal row), named for it, with aria-expanded", async () => {
    const html = await renderHtml(EventsTable, { ...base, events: events() }, { detail });
    const buttons = html.match(/<button[^>]*data-testid="now-event-open"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      expect(b).toContain('aria-expanded=');
      expect(b).toContain('aria-controls=');
      expect(b).toContain('type="button"');
      expect(b).toContain('min-h-[44px]');
    }
    const t = textOf(html);
    expect(t).toContain(ascDetailLabel(1, false));
    expect(t).toContain(ascDetailLabel(2, false));
    expect(t).toContain(ascDetailLabel(3, false));
  });

  it('closed: no ascension\'s detail is drawn when the save is not on a known egg', async () => {
    const html = await renderHtml(EventsTable, { ...base, events: events() }, { detail });
    expect(html).not.toContain('data-testid="slot-detail"');
    expect(html).not.toContain('data-testid="now-event-detail"');
  });

  it('the ascension the farm is in opens by default (You are here), the others stay closed', async () => {
    const html = await renderHtml(EventsTable, { ...base, events: events(), here }, { detail });
    expect(html.match(/data-testid="slot-detail"/g)).toHaveLength(1);
    expect(textOf(html)).toContain('DETAIL OF A1');
    expect(textOf(html)).not.toContain('DETAIL OF A2');
    // Its row says it is open, and the panel is the one the button controls, a full-width row right under it.
    const open = html.match(/<button[^>]*aria-expanded="true"[^>]*>/g) ?? [];
    expect(open).toHaveLength(1);
    const id = /aria-controls="([^"]+)"/.exec(open[0] ?? "")?.[1] ?? "";
    expect(html).toContain(`id="${id}"`);
    expect(textOf(html)).toContain(ascDetailLabel(1, true));
  });

  it('without a detail slot there is no button (a plan that has nothing to open)', async () => {
    const html = await renderHtml(EventsTable, { ...base, events: events(), here });
    expect(html).not.toContain('now-event-open');
  });

  it('the label is Words-owned text in lib/timelineWords.ts, named for the ascension', () => {
    expect(ascDetailLabel(2, false)).toContain('A2');
    expect(ascDetailLabel(2, true)).toContain('A2');
    expect(ascDetailLabel(2, true)).not.toBe(ascDetailLabel(2, false));
    expect(ascDetailLabel(2, false)).not.toMatch(/this device|this computer/i);
  });
});

describe('the separate Full timeline is gone', () => {
  it('RightNowCard hands the ascension\'s detail to EventsTable and no longer folds a Full timeline above More', () => {
    const card = read('components/myruns/RightNowCard.vue');
    const tpl = card.slice(card.indexOf('<template>'), card.indexOf('</template>\n\n<script'));
    expect(tpl).not.toContain('now-timeline');
    expect(tpl).not.toContain('Full timeline');
    expect(tpl).not.toContain('myRunsTimeline');
    expect(card).not.toContain('timelineTo');
    expect(tpl).toContain('#detail="{ asc }"');
    expect(tpl).toMatch(/<RouteTimeline[\s\S]*?:only="asc - 1"/);
    expect(tpl).toMatch(/<AscensionList[\s\S]*?:only="asc"/);
  });
  it('where there is no You are here list to open (not on virtue yet, no events) the ascensions are one closed fold, so nothing is lost', () => {
    const card = read('components/myruns/RightNowCard.vue');
    const tpl = card.slice(card.indexOf('<template>'), card.indexOf('</template>\n\n<script'));
    expect(tpl).toMatch(/<details v-else[^>]*data-testid="now-asc-all"/);
    expect(tpl).not.toMatch(/<details v-else[^>]*\bopen\b/);
  });
  it('My runs has no slot for it above More, and its fold state is not kept any more', () => {
    const view = read('components/MyRunsView.vue');
    expect(view).not.toContain('myruns-timeline');
    expect(view).not.toContain('timeline-to');
    expect(read('lib/panelFold.ts')).not.toContain('myRunsTimeline');
  });
});
