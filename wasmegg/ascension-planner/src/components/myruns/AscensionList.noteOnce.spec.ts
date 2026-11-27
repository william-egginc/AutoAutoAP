/**
 * UX SWEEP R9, 18 Nov 2026 (H2, M5): the grey paragraph "Times from the instant answer are to the hour…" repeated under every opened
 * ascension; "Working out your shifts" was said twice (Right now and under A1). The paragraph is said once on the page (under You are here),
 * never inside one ascension's detail (`only`); inside the detail the working line is left to Right now (`quiet`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import AscensionList from './AscensionList.vue';
import { ASC_TIMES_NOTE } from '@/lib/timelineWords';
import type { AscensionStep } from '@/lib/instantSteps';

const ZONE = 'America/Denver';
const T0 = Date.UTC(2027, 0, 4, 18, 0) / 1000;
const line = (o: Partial<AscensionStep>): AscensionStep =>
  ({ asc: 1, now: true, fresh: false, fromTE: 200, toTE: 222, prestigeAt: T0, reachedAt: T0 + 86400, wait: null, shifts: [], simulated: false, ...o }) as unknown as AscensionStep;
const lines = [line({}), line({ asc: 2, now: false })];
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');

describe('the instant answer note', () => {
  it('the whole list ends with it once', async () => {
    const t = textOf(await renderHtml(AscensionList, { lines, zone: ZONE }));
    expect(t.split(ASC_TIMES_NOTE).length - 1).toBe(1);
  });
  it("one ascension's detail (only) does not repeat it", async () => {
    const t = textOf(await renderHtml(AscensionList, { lines, only: 2, zone: ZONE, note: false }));
    expect(t).not.toContain(ASC_TIMES_NOTE);
  });
  it('My Runs says it once under You are here, not per opened block', () => {
    const card = read('components/myruns/RightNowCard.vue');
    const tpl = card.slice(card.indexOf('<template>'), card.indexOf('</template>\n\n<script'));
    expect(tpl).toMatch(/<AscensionList[^>]*:only="asc"[^>]*:note="false"/);
    expect(tpl).toContain('now-ascensions-note');
  });
});

describe('"Working out your shifts" once', () => {
  it('under A1 it is said by the line itself only when Right now does not say it (quiet = false)', async () => {
    const loud = textOf(await renderHtml(AscensionList, { lines, zone: ZONE, working: true }));
    expect(loud).toContain('Working out your shifts');
  });
  it('quiet: inside the opened detail it is not said again', async () => {
    const t = textOf(await renderHtml(AscensionList, { lines, only: 1, zone: ZONE, working: true, quiet: true, note: false }));
    expect(t).not.toContain('Working out your shifts');
  });
  it('the detail under You are here is quiet', () => {
    const card = read('components/myruns/RightNowCard.vue');
    const tpl = card.slice(card.indexOf('<template>'), card.indexOf('</template>\n\n<script'));
    expect(tpl).toMatch(/<AscensionList[^>]*:only="asc"[^>]*\bquiet\b/);
  });
});
