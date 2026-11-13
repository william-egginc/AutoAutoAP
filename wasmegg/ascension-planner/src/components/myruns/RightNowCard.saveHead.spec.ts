/**
 * THE SAVE IN RIGHT NOW'S HEADER (Jordan, 12 Nov 2026, on egg-beta 9f9f37362): My runs drops the save box beside the
 * Right now card (layout/SaveSide.vue there). The save goes into the card's header line instead, in Words' shape
 * (lib/calculatedFromWords.ts calculatedFromLine: the plan's save and when it was calculated), amber once the loaded save
 * is out of date, with a "?" beside it (myruns/SaveHeadHelp.vue) that opens the same strip (myruns/SaveAgeStrip.vue: its
 * Why, Details, Load latest save and the clock check). The silo line stays once, beside the player line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { h } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import { drivingPlan } from '@/lib/searchPlan';
import type { CardPlan } from '@/composables/useNowPage';
import { eggDaySeconds } from '@/lib/eggDay';
import { calculatedFromLine } from '@/lib/calculatedFromWords';
import { SAVE_DETAILS_LABEL } from '@/lib/layoutWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
const NOW = Date.UTC(2026, 10, 12, 23, 40) / 1000;
const SAVE = NOW - 29 * H - 11 * 60;
const CALC = NOW - 10 * 60;
const DEADLINE = eggDaySeconds(2027);

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
});

const snap = {
  at: CALC * 1000,
  answerStart: SAVE,
  result: {
    best: null,
    byAscensions: [],
    byDate: {
      chain: [197, 228, 313],
      legs: [
        { to: 197, endTE: 197, start: NOW, end: NOW + 5 * D + 17 * H },
        { to: 228, endTE: 228, start: NOW + 6 * D, end: NOW + 60 * D },
        { to: 313, endTE: 313, start: NOW + 60 * D, end: DEADLINE - 1.46 * D },
      ],
      end: DEADLINE - 1.46 * D,
    },
    byDateByAscensions: [],
  },
};

function cardProps(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const d = drivingPlan(snap as never, 'date', DEADLINE);
  const plan = d.plan as NowPlan;
  const card: CardPlan = { plan, goal: { goal: 'date', target: 490, deadline: DEADLINE }, state: 'this-save', key: 'eggday-2027', name: 'Egg Day 2027', driving: d };
  const events = planEvents(plan, NOW);
  return { card, onVirtue: true, currentEgg: 'integrity', teSoFar: 186, ascNow: 1, track: null, events, shownEvents: tableEvents(events), gear: null, now: NOW, zone: ZONE, saveSeconds: SAVE, eggDayYear: 2027, ...extra };
}
const calcTag = (html: string) => html.match(/<p[^>]*data-testid="now-calculated"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '';

describe("Right now's header: the save, in Words' line", () => {
  it('"Right now" then calculatedFromLine(the plan\'s save, when it was calculated)', async () => {
    const props = cardProps();
    const plan = (props.card as CardPlan).plan;
    const html = await renderHtml(RightNowCard, props);
    const want = calculatedFromLine({ saveSeconds: SAVE, nowSeconds: plan.calculatedAt / 1000, zone: ZONE });
    expect(want).toMatch(/^Calculated from your /);
    expect(textOf(calcTag(html))).toBe(want);
    expect(textOf(html)).toMatch(new RegExp(`^Right now ${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });
  it('amber once the loaded save is out of date (saveOld), quiet slate otherwise', async () => {
    expect(calcTag(await renderHtml(RightNowCard, cardProps({ saveOld: true })))).toContain('text-amber-800');
    const quiet = calcTag(await renderHtml(RightNowCard, cardProps()));
    expect(quiet).toContain('text-slate-500');
    expect(quiet).not.toContain('text-amber-800');
  });
  it('the save time unknown: no line (the "?" still there)', async () => {
    const props = cardProps({ saveSeconds: 0 });
    const plan = (props.card as CardPlan).plan as NowPlan & { meta?: { backupTime?: number } };
    if (plan.meta) plan.meta.backupTime = 0;
    const html = await renderHtml(RightNowCard, props, { save: () => h('button', { 'data-testid': 'x-help' }) });
    expect(html).not.toContain('data-testid="now-calculated"');
    expect(html).toContain('data-testid="x-help"');
  });
  it('a #save slot in the header row, right after the line', async () => {
    const html = await renderHtml(RightNowCard, cardProps(), { save: () => h('button', { 'data-testid': 'x-help' }) });
    const head = html.slice(html.indexOf('data-testid="now-head"'), html.indexOf('</div>', html.indexOf('data-testid="x-help"')));
    expect(head.indexOf('data-testid="now-calculated"')).toBeGreaterThan(-1);
    expect(head.indexOf('data-testid="x-help"')).toBeGreaterThan(head.indexOf('data-testid="now-calculated"'));
  });
});

describe('My runs: no save box beside the card; the "?" in the header opens the same strip', () => {
  const view = tplOf(read('components/MyRunsView.vue'));
  it('no SaveSide and no side grid once the save is in (it stays while the page waits for the save)', () => {
    expect(view).not.toContain('<SaveSide :with-silo');
    expect(view).not.toContain('data-testid="now-grid"');
    expect(view).toMatch(/<SaveSide v-if="!page\.hasSave\.value"/);
    expect(view.match(/<SaveSide\b/g) ?? []).toHaveLength(1);
  });
  it('RightNowCard gets saveOld and a #save template with SaveHeadHelp fed by the page\'s one save strip', () => {
    expect(view).toContain(':save-old="!!saveStrip.state.value?.outOfDate"');
    const t = view.slice(view.indexOf('<template #save>'), view.indexOf('</template>', view.indexOf('<template #save>')));
    expect(t).toContain('<SaveHeadHelp');
    for (const p of [':state="saveStrip.state.value"', ':server="saveStrip.server.value"', ':loading="saveStrip.loading.value"', '@fresh="saveStrip.load"'])
      expect(t, p).toContain(p);
  });
  it('one silo line on My runs: the player line\'s', () => {
    expect(view).not.toContain('<SiloLine');
    expect(view.match(/:silo="saveStrip\.silo\.value"/g) ?? []).toHaveLength(1);
  });
});

describe('SaveHeadHelp: a "?" that opens the strip', () => {
  const quiet = { tone: 'green', word: 'OK', icon: 'clock', headline: 'Your save is from Nov 11 at 10:29 AM, 29h ago', reason: '', details: ['d1'], old: true, outOfDate: true, suggestSync: false, link: 'Load it' } as never;
  const behind = { ...(quiet as object), tone: 'red', word: 'Check your clock' } as never;
  it('closed by default on the quiet line: the button names itself, aria-expanded false, aria-controls the panel', async () => {
    const { default: SaveHeadHelp } = await import('./SaveHeadHelp.vue');
    const html = await renderHtml(SaveHeadHelp, { state: quiet, server: { kind: 'unknown' }, loading: false, now: NOW });
    const btn = html.match(/<button[^>]*data-testid="now-save-help"[^>]*>/)?.[0] ?? '';
    expect(btn).toContain(`aria-label="${SAVE_DETAILS_LABEL}"`);
    expect(btn).toContain('aria-expanded="false"');
    const id = btn.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${id}"[^>]*hidden|hidden[^>]*id="${id}"`));
  });
  it('the panel holds the same strip: test id, slim, small, Load latest save, its events', () => {
    const tpl = tplOf(read('components/myruns/SaveHeadHelp.vue'));
    const strip = tpl.slice(tpl.indexOf('<SaveAgeStrip'), tpl.indexOf('/>', tpl.indexOf('<SaveAgeStrip')));
    for (const part of ['testid="save-line-age"', ':state="state"', ':server="server"', 'slim', 'small', ':load-words="LOAD_LATEST_SAVE"', '@fresh="emit(\'fresh\')"'])
      expect(strip, part).toContain(part);
    // 44 px on a phone without moving the line: the invisible area round the 14 px "?" (CardHelp's), focus ring.
    const btn = tpl.slice(tpl.lastIndexOf('<button', tpl.indexOf('data-testid="now-save-help"')), tpl.indexOf('>', tpl.indexOf('data-testid="now-save-help"')));
    expect(btn).toContain("before:-inset-[15px]");
    expect(btn).toContain('focus-visible:ring-2');
    // No player words in the template (they are Words').
    expect(tpl.replace(/<[^>]+>/g, ' ').replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim()).toBe('?');
  });
  it('open by default when the strip is not the quiet line (the clock check, a newer save on the server)', async () => {
    const { default: SaveHeadHelp } = await import('./SaveHeadHelp.vue');
    const red = await renderHtml(SaveHeadHelp, { state: behind, server: { kind: 'unknown' }, loading: false, now: NOW });
    expect(red).toContain('aria-expanded="true"');
    expect(red).toContain('data-testid="save-line-age"');
    const newer = await renderHtml(SaveHeadHelp, { state: quiet, server: { kind: 'newer', serverSeconds: NOW }, loading: false, now: NOW });
    expect(newer).toContain('aria-expanded="true"');
  });
});
