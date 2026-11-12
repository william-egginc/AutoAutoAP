/**
 * THE INSTANT ANSWER NEVER SHOWS NOTHING: every state, drawn (Jordan's Safari shot, 24 Oct 2026: By a date, Egg Day
 * 2027, hours 7 am to 5 am, "Works inside my hours" ticked; the section's Hide pill and nothing under it, while
 * Nearby routes read "Ascensions 3 to 6 (from the instant answer)").
 *
 * InstantRoute's own template, compiled here and drawn on the server with every combination of what it reads: an
 * answer (By a date's, Fastest's, or one with no route in time) or none; idle, loading, error or done; below the
 * instant answer's lowest TE; the file not loaded (and from a newer page); the integrity hold; a date or none; hours
 * off or on and ticked; waiting for a search; waiting for the save; at or past the target; a saved answer. Each one
 * draws at least one thing that says where the answer stands (the green box, a line, a card), besides the heading.
 * The parts (NoInstantAnswer, InstantUnloaded, ...) are stand-ins with their own specs; the integrity line is the real
 * one, as it draws nothing when it has nothing to say.
 *
 * The hidden section (CollapsibleSection) keeps its Show bar; and a card that can't be drawn at all is the guard's
 * (InstantGuard.spec.ts). Together: never nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as Vue from 'vue';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { idleLine } from '@/search/instantDeferral';
import { HOURS_NOTE } from '@/lib/hoursNote';
import { instantLiveText } from '@/lib/liveStatus';
import { headlineGap, roundedGap } from '@/lib/format';
import { spareLine } from '@/lib/spareLine';
import {
  FIRST_STEP_BUILDUP_MISSING,
  FIRST_STEP_BUILDUP_MISSING_CONTINUE,
  FIRST_STEP_BUILDUP_MISSING_CONTINUE_REST,
  FIRST_STEP_BUILDUP_MISSING_LEAD,
  FIRST_STEP_BUILDUP_MISSING_REST,
  INSTANT_ESTIMATE_LINE,
  buildUpMissingRestOf,
  firstStepKind,
  firstStepLine,
  FIRST_STEP_HOURS,
  FIRST_STEP_HOURS_NIGHT_BUY,
  mergeFirstStepCaveats,
} from '@/lib/instantWords';
import { INSTANT_NIGHT_BUY_NOTE, INSTANT_NIGHT_BUY_TIP } from '@/lib/nightBuyWords';
import * as cardWords from '@/lib/instantCardWords';
import CollapsibleSection from './CollapsibleSection.vue';
import InstantIntegrity from './InstantIntegrity.vue';
import AnimatedDots from './AnimatedDots.vue';
import PendingText from './PendingText.vue';
import PrestigeByLine from './PrestigeByLine.vue';

const source = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
const { descriptor } = parse(source);
const compiled = compileTemplate({
  source: descriptor.template!.content,
  filename: 'InstantRoute.vue',
  id: 'instant',
  compilerOptions: { isTS: true },
}).code;
// Its expressions are TypeScript (`$event.target as HTMLInputElement`): plain JavaScript first.
const code = ts.transpileModule(compiled, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
// The compiled module as a function of Vue: `import { a as _a } from "vue"` -> `const { a: _a } = Vue`.
const body = code
  .replace(/import \{([^}]*)\} from "vue";?/, (_, names: string) => `const {${names.replace(/ as /g, ': ')}} = Vue;`)
  .replace('export function render', 'function render');
const render = new Function('Vue', `${body}\nreturn render;`)(Vue) as (ctx: object, cache: unknown[]) => Vue.VNode;

const PARTS = [
  'InstantPointer',
  'NoInstantAnswer',
  'InstantRunWarning',
  'PreferFewerNote',
  'PrestigeByLine',
  'FollowButton',
  'BetterRoutePrompt',
  'PreferFewerControl',
  'MaxedWhatIf',
  'InstantShareCheck',
  'GearCaveat',
  'InstantUnloaded',
  'CardHelp',
];
const stub = (name: string) =>
  defineComponent({ name, setup: (_p, { slots }) => () => h('div', { 'data-part': name }, slots.default?.()) });

type Route = { chain: number[]; legs: { endTE: number }[]; end: number; seconds: number };
const DEADLINE = 1_815_670_800;
const route = (chain: number[], end: number): Route => ({
  chain,
  legs: chain.map(te => ({ endTE: te })),
  end,
  seconds: end - 1_790_000_000,
});
const dateRoute = route([197, 222, 251, 282, 314], DEADLINE - 34_560);
const fewer = route([205, 248, 308], DEADLINE - 864);

type Answer = 'none' | 'date' | 'fastest' | 'none-in-time';
interface State {
  answer: Answer;
  status: 'idle' | 'loading' | 'error' | 'done';
  below: boolean;
  noTable: boolean;
  hold: boolean;
  deadline: boolean;
  hours: boolean;
  waiting: boolean;
  saveWait: boolean;
  atTarget: boolean;
  saved: boolean;
}

function resultOf(a: Answer) {
  if (a === 'none') return null;
  const best = route([210, 260, 300], 1_800_000_000);
  return {
    best,
    byAscensions: [null, null, null, best],
    byDate: a === 'date' ? dateRoute : null,
    byDateByAscensions: a === 'date' ? [null, null, null, fewer, null, dateRoute] : [],
  };
}

function ctxOf(s: State): Record<string, unknown> {
  const result = resultOf(s.answer);
  const deadline = s.deadline ? DEADLINE : undefined;
  const last = (r: Route) => r.legs[r.legs.length - 1].endTE;
  return {
    $slots: {},
    FULL_RESEARCH_TE: 340,
    HOURS_NOTE,
    FIRST_STEP_LABEL: 'First step:',
    headerLine: 'Worked out ahead of time, a few days either side of a search on your save.',
    firstStep: '',
    firstStepWarn: '',
    nightBuyNote: false,
    stepCaveat: { step: '', note: null },
    INSTANT_NIGHT_BUY_NOTE,
    INSTANT_NIGHT_BUY_TIP,
    FIRST_STEP_BUILDUP_MISSING_LEAD,
    INSTANT_ESTIMATE_LINE,
    // The card's words (lib/instantCardWords.ts), the real ones.
    ...cardWords,
    MAX_ASCENSIONS: 12,
    NAMES: { science: 'Science', how: 'How it works', smart: 'Fast' },
    SHARE_WHAT: '',
    TIP_SIMULATE: '',
    SECONDARY_BUTTON: 'btn',
    START_WAIT_LABEL: 'From before: waiting for your save.',
    TABLE_URL: '/precompute/table-v2.bin',
    TIGHT_SECONDS: 86400,
    USEFUL_STOP_NOTE: '',
    alongside: false,
    answerStart: 0,
    atTarget: s.atTarget,
    backgroundStatus: 'done',
    behind: () => 'fastest',
    behindExact: () => '',
    below: s.below ? { from: 120, te: 80 } : null,
    bonusShort: 0,
    boxFollowable: true,
    boxLead: result?.best ?? null,
    boxShown: !s.hold && !!result && (deadline ? !!result.byDate : !!result.best),
    bracketStatus: 'done',
    bracketText: '',
    confirmRun: () => {},
    confirming: null,
    dateBoxOf: (r: Route) => ({ chain: r.chain, endTE: last(r), end: r.end }),
    datePickedRow: () => false,
    countIds: 'counts-v0',
    // The screen's More (the simpler default page, 9 Nov 2026): none here, so everything stays on the card.
    moreTo: undefined,
    moreEl: null,
    moreHowEl: null,
    ROW_HINT: 'Open a row to follow or simulate that route instead.',
    countOpen: () => false,
    toggleCount: () => {},
    rowTight: () => false,
    dateRowLit: () => false,
    dateRows: result?.byDate ? [fewer, dateRoute] : [],
    days: (sec: number) => `${(sec / 86400).toFixed(2)} days`,
    headlineGap: (sec: number) => headlineGap(sec, 'en-US'),
    dateSpare: result?.byDate ? spareLine((deadline ?? 0) - result.byDate.end, false, 'en-US') : null,
    tableGap: (sec: number) => roundedGap(sec),
    deadline,
    deliveryScale: 1,
    emit: () => {},
    errorText: 'The instant answer couldn’t run: something went wrong',
    filtering: s.hours,
    filters: { inHours: s.hours, maxAscensions: s.hours ? 5 : null, minAscensions: null },
    rangeText: s.hours ? 'at most 5' : '',
    setAscBound: () => {},
    widenTo: () => {},
    followGoal: 'date',
    boxGain: '',
    headCaveat: null,
    gearDiffers: false,
    gearTable: false,
    header: { from: 120, to: 489, cteBonus: 128.71, gearTo: 489 },
    hiddenCounts: 0,
    hoursOn: s.hours,
    hoursLimited: s.hours,
    idle: idleLine({ due: false, setupLoaded: true, te: 250 }),
    instantCandidate: (r: unknown) => r,
    instantUrl: 'https://collector.example/instant',
    integrity: { kind: s.hold ? 'checking' : 'none' },
    instantLive: instantLiveText(s.status, !!result),
    integrityHold: s.hold,
    keepSharing: false,
    lastEndTE: (r: Route) => r.legs[r.legs.length - 1]?.endTE ?? 0,
    leftOut: [],
    loadingText: 'Working out every route',
    lowTeNote: '',
    moreDontHelp: false,
    ms: 900,
    openingNote: s.hours ? 'morning' : null,
    nearTie: () => null,
    noInstantHeading: (from: number) => `No instant answer below TE ${from}`,
    noTable: s.noTable,
    olderPage: false,
    onWhatIf: () => {},
    openPlan: () => {},
    optimistic: null,
    own: false,
    ownChanged: '',
    sectionHide: null,
    plural: (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`,
    pointer: null,
    preferCopy: { chip: '', what: '', line: '', muted: '' },
    preferMargin: { kind: 'off' },
    preferPicked: false,
    preferShowBest: false,
    pressRun: () => {},
    prestige: null,
    boxPrestige: null,
    boxSimulateNote: '',
    prestigeFlag: { enabled: { value: false }, beta: true },
    prestigeStatus: 'idle',
    result,
    resultFromBefore: false,
    rowFollowable: () => true,
    run: () => {},
    runBusy: s.waiting,
    saveWaitText: s.saveWait ? 'Waiting for your save to load…' : '',
    savedAt: s.saved ? 1_792_000_000_000 : null,
    staleAt: null,
    staleOlder: false,
    seeResult: () => {},
    setInsideHours: () => {},
    shareNote: null,
    shareText: '',
    shareThis: false,
    shareTo: '#search-share-by-date',
    shareEl: null,
    shiftedTable: true,
    show: (unix: number) => `t${unix}`,
    showFinish: (unix: number) => `t${unix}`,
    showMoreCounts: false,
    shownRows: result ? [result.best] : [],
    simNote: null,
    simulateNote: () => '',
    spareOf: (d: { end: number }) => (deadline ?? 0) - d.end,
    status: s.status,
    store: { currentTE: 250, finalTE: 300, startWait: s.saveWait ? { since: 1 } : null },
    target: s.deadline ? 490 : 300,
    useHours: s.hours,
    noPrestigeOn: false,
    siloWords: 'until its silos run out',
    stepHours: null,
    stepDays: [],
    dateBoxLegs: [],
    waiting: s.waiting,
    warnHere: () => false,
    whatIf: null,
    whileWaiting: (has: boolean) => ({ text: has ? 'The answer below is from before your search.' : 'Waits for your search to end.' }),
    zone: 'America/Los_Angeles',
  };
}

async function draw(s: State, over: Record<string, unknown> = {}, real: Record<string, Vue.Component> = {}): Promise<string> {
  const ctx = { ...ctxOf(s), ...over };
  // First step and its one caveat line, as the page works them out (lib/instantWords.ts mergeFirstStepCaveats).
  if (!('stepCaveat' in over)) ctx.stepCaveat = mergeFirstStepCaveats(String(ctx.firstStep ?? ''), !!ctx.nightBuyNote);
  const cache: unknown[] = [];
  const app = createSSRApp({ render: () => h(defineComponent({ render: () => render(ctx, cache) })) });
  // `real`: a part drawn as itself, not a stand-in (the Prestige by line below).
  for (const p of PARTS) app.component(p, real[p] ?? stub(p));
  // The integrity line itself: it draws nothing when there is nothing to say, so it is not a stand-in.
  app.component('InstantIntegrity', InstantIntegrity);
  // The moving dots (spec-dots, 1 Nov 2026): the real ones.
  app.component('AnimatedDots', AnimatedDots);
  app.component('PendingText', PendingText);
  // The buttons' tips (Tip.vue, 9 Nov 2026): the button alone, with the id its slot hands it.
  app.component('Tip', defineComponent({ name: 'Tip', setup: (_p, { slots }) => () => slots.default?.({ describedby: 'tip-stub' }) }));
  app.config.warnHandler = () => {};
  return renderToString(app);
}

/** What says where the answer stands: the green box, one of the card's lines, or a part that is a card itself. */
const SAYS = [
  'data-testid="instant-box"',
  'data-testid="instant-no-route"',
  'data-testid="instant-loading"',
  'data-testid="instant-error"',
  'data-testid="instant-idle"',
  'data-testid="instant-waits"',
  'data-testid="instant-wait-save"',
  'data-testid="instant-at-target"',
  'data-testid="instant-no-table"',
  'data-part="NoInstantAnswer"',
  'data-testid="instant-integrity"',
];

function* states(): Generator<State> {
  const tf = [false, true];
  for (const answer of ['none', 'date', 'fastest', 'none-in-time'] as Answer[])
    for (const status of ['idle', 'loading', 'error', 'done'] as State['status'][])
      for (const below of tf)
        for (const noTable of tf)
          for (const hold of tf)
            for (const deadline of tf)
              for (const hours of tf)
                for (const waiting of tf)
                  for (const saveWait of tf)
                    for (const atTarget of tf)
                      for (const saved of tf)
                        yield { answer, status, below, noTable, hold, deadline, hours, waiting, saveWait, atTarget, saved };
}

describe('InstantRoute: every state draws something', () => {
  it('the stand-in reads give every name the template reads (a new one fails here, not silently)', () => {
    const read = new Set([...code.matchAll(/_ctx\.(\$?\w+)/g)].map(m => m[1]));
    const given = ctxOf({
      answer: 'none',
      status: 'idle',
      below: false,
      noTable: false,
      hold: false,
      deadline: false,
      hours: false,
      waiting: false,
      saveWait: false,
      atTarget: false,
      saved: false,
    });
    expect([...read].filter(k => !(k in given))).toEqual([]);
  });

  it('every combination (8,192) has the heading and at least one line, box or card', async () => {
    const nothing: State[] = [];
    let n = 0;
    for (const s of states()) {
      n++;
      const html = await draw(s);
      if (!html.includes('Instant answer') || !SAYS.some(m => html.includes(m))) nothing.push(s);
    }
    expect(n).toBe(8192);
    expect(nothing).toEqual([]);
  }, 120_000);

  it("Jordan's shot: By a date, an answer, hours on and ticked, at most 5: the green box with the route", async () => {
    const html = await draw({
      answer: 'date',
      status: 'done',
      below: false,
      noTable: false,
      hold: false,
      deadline: true,
      hours: true,
      waiting: false,
      saveWait: false,
      atTarget: false,
      saved: true,
    });
    expect(html).toContain('data-testid="instant-box"');
    expect(html).toContain('314 TE');
    expect(html).toContain('data-testid="inside-hours"');
    expect(html).toContain('data-testid="saved-answer"');
  });
});

describe("the card's words from lib/instantCardWords.ts (12 Nov 2026), read the same as before", () => {
  const box: State = {
    answer: 'date',
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline: true,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: true,
  };
  const textOf = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  it('the saved-from sentence and Work it out again, with and without a plan start', async () => {
    expect(textOf(await draw(box))).toContain(
      'Saved from t1792000000: same save, setup and filters, so nothing was worked out again. Work it out again'
    );
    expect(textOf(await draw(box, { answerStart: 1_792_003_600 }))).toContain(
      'Saved from t1792000000: same save, setup and filters, so nothing was worked out again (its dates are for a plan start of t1792003600).'
    );
  });
  it('the saved answer: ONE line in the heading row, "Saved answer, <when>", its sentence behind the "?", Work it out again beside it (Jordan, 12 Nov 2026)', async () => {
    const html = (await draw(box, { answerStart: 1_792_003_600 })).replace(/<!--[\s\S]*?-->/g, '');
    const at = html.indexOf('data-testid="saved-answer"');
    expect(at).toBeGreaterThan(html.indexOf('</h3>'));
    // In the heading row: before the row closes and before the green box.
    const row = html.slice(html.indexOf('<h3'), html.indexOf('data-testid="instant-box"'));
    expect(row).toContain('data-testid="saved-answer"');
    const line = html.slice(html.lastIndexOf('<p', at), html.indexOf('</p>', at) + 4);
    expect(line).not.toMatch(/bg-slate-50|border-slate-200|rounded-lg/);
    expect(line).toContain('text-small');
    expect(textOf(line)).toBe(
      'Saved answer, t1792000000 Saved from t1792000000: same save, setup and filters, so nothing was worked out again (its dates are for a plan start of t1792003600). Work it out again'
    );
    // Today's sentence inside the "?" (CardHelp), word for word.
    const help = line.slice(line.indexOf('data-part="CardHelp"'));
    expect(textOf(help.slice(0, help.indexOf('</div>')))).toContain('Saved from t1792000000: same save, setup and filters');
    const button = line.match(/<button[^>]*>/)![0];
    expect(button).toContain('min-h-[44px] sm:min-h-0');
    expect(button).toContain('focus-visible:ring-2');
  });
  it('Reached … · N ascensions under the route', async () => {
    expect(textOf(await draw(box))).toContain(`Reached t${dateRoute.end} · 5 ascensions`);
  });
});

describe('the ascensions From … to … (24 Oct 2026)', () => {
  const done: State = {
    answer: 'fastest',
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline: false,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  };
  const near = { ascensions: 4, chain: [205, 248, 280, 300], end: 1_800_100_000, endTE: 300 };

  it('both boxes, blank for no bound, and the range said in words when set', async () => {
    const plain = await draw(done);
    expect(plain).toMatch(/data-testid="instant-min-ascensions"/);
    expect(plain).toMatch(/data-testid="instant-max-ascensions"/);
    expect(plain).toContain('Ascensions from');
    expect(plain).not.toContain('data-testid="instant-range-note"');
    const set = await draw(done, { filters: { inHours: false, minAscensions: 2, maxAscensions: 3 }, rangeText: '2 to 3' });
    expect(set).toContain('Only routes with 2 to 3 ascensions');
    expect(set).toMatch(/data-testid="instant-min-ascensions"[^>]*value="2"|value="2"[^>]*data-testid="instant-min-ascensions"/);
  });

  it('Fastest, no route in the range: says so and names the nearest, with Include N', async () => {
    const r = resultOf('fastest')!;
    const html = await draw(done, {
      result: { ...r, best: null, byAscensions: [], outside: { fastest: near } },
      boxLead: null,
      shownRows: [],
      rangeText: 'at least 6',
    });
    expect(html).toContain('No route in this range: the nearest is 4 ascensions');
    expect(html).toContain('205 → 248 → 280 → 300');
    expect(html).toContain('Include 4');
    expect(html).not.toContain('data-testid="instant-box"');
  });

  it('By a date, no route in the range: the nearest with its TE', async () => {
    const r = resultOf('date')!;
    const html = await draw(
      { ...done, answer: 'date', deadline: true },
      { result: { ...r, byDate: null, byDateByAscensions: [], outside: { date: near } }, dateRows: [], rangeText: '1 to 2' }
    );
    expect(html).toContain('No route in this range: the nearest is 4 ascensions, 300 TE by');
    expect(html).toContain('Include 4');
  });
});

describe('the estimate line (spec-r7verify item 5; DRAFT): behind the one line\'s Why since spec-slimcard', () => {
  const base: State = {
    answer: 'fastest',
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline: false,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  };
  const WORDS = 'An estimate worked out ahead of time: a Fast search on your save often lands a few days either side.';
  it('the exact words', () => expect(INSTANT_ESTIMATE_LINE).toBe(WORDS));

  for (const [name, over] of [
    ['Fastest', {}],
    ['By a date', { answer: 'date', deadline: true }],
  ] as const) {
    it(`${name}: not in the green box any more; once, under the title's "Why? ›"`, async () => {
      const html = await draw({ ...base, ...over });
      const box = html.slice(html.indexOf('data-testid="instant-box"'));
      expect(box).not.toContain(WORDS);
      expect(html.match(/data-testid="instant-estimate-why"/g)).toHaveLength(1);
      expect(html.indexOf('data-testid="instant-estimate-why"')).toBeLessThan(html.indexOf('data-testid="instant-box"'));
    });
  }

  it('no green box (no answer, the integrity hold): no line', async () => {
    expect(await draw({ ...base, answer: 'none' })).not.toContain('instant-estimate');
    expect(await draw({ ...base, hold: true })).not.toContain('instant-estimate');
  });

  it("never on a search's result card (the Fast/Exact/Custom result is ChainSearchPanel's own)", () => {
    const panel = fs.readFileSync(path.resolve(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(panel).not.toContain('INSTANT_ESTIMATE_LINE');
    expect(panel).not.toContain('instant-estimate');
  });

  it('the constant, drawn once (no copy of its words in the template)', () => {
    expect(source.match(/\{\{ INSTANT_ESTIMATE_LINE \}\}/g)).toHaveLength(1);
    expect(source).not.toContain('a Fast search on your save often lands');
  });
});

describe('the hidden section keeps its Show bar', () => {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  const before = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => store.clear());
  const drawSection = () =>
    renderToString(
      createSSRApp({
        render: () =>
          h(CollapsibleSection, { id: 'instant', title: 'Instant answer', summary: '314 TE by Jul 14' }, () =>
            h('section', { 'data-testid': 'card' }, 'the card')
          ),
      })
    );

  it('hidden by the player: one bar with its name, its result and Show; never only a pill', async () => {
    store.set('aap-section-hidden-instant', '1');
    const html = await drawSection();
    expect(html).toContain('data-testid="show-instant"');
    expect(html).toContain('Instant answer');
    expect(html).toContain('314 TE by Jul 14');
    expect(html).toContain('Show');
    expect(html).not.toContain('data-testid="hide-instant"');
  });

  it('open: the Hide pill with the card under it, in the same state', async () => {
    const html = await drawSection();
    expect(html).toContain('data-testid="hide-instant"');
    expect(html).toContain('data-testid="card"');
    expect(html).not.toContain('data-testid="show-instant"');
  });

  it('storage blocked: open', async () => {
    g.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const html = await drawSection();
    expect(html).toContain('data-testid="card"');
    g.localStorage = before;
  });
});

describe('the screens put the card in the guard', () => {
  for (const file of ['DeadlinePanel.vue', 'FastestRoute.vue']) {
    it(file, () => {
      const text = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      const tpl = text.slice(0, text.indexOf('<script setup'));
      // The answer's own region since the simpler page (9 Nov 2026; was a CollapsibleSection): the guard is in it.
      const start = tpl.indexOf('data-testid="section-instant"');
      const section = tpl.slice(start, tpl.indexOf('<NowLine', start));
      const guard = section.indexOf('<InstantGuard>');
      expect(guard).toBeGreaterThan(0);
      expect(section.indexOf('<InstantRoute')).toBeGreaterThan(guard);
      expect(section.indexOf('</InstantGuard>')).toBeGreaterThan(section.indexOf('<InstantRoute'));
    });
  }
});

describe('the share Teleport lives as long as the card', () => {
  it('not inside the answer or the integrity hold; only its content comes and goes', () => {
    const tpl = source.slice(0, source.indexOf('<script setup'));
    // The More parts' Teleports (the simpler page, 9 Nov 2026) come first: never deferred, to looked-up elements
    // (moreEl, moreHowEl) and disabled without one, as this one. The share line's is the last.
    const more = tpl.match(/<Teleport [^>]*>/g)!.slice(0, -1);
    expect(more.length).toBe(4);
    for (const t of more) {
      expect(t).not.toContain('defer');
      expect(t).toMatch(/:to="more(How)?El \?\? 'body'" :disabled="!more(How)?El"/);
    }
    const at = tpl.lastIndexOf('<Teleport');
    // After both sections: a sibling of the card, not inside it.
    expect(at).toBeGreaterThan(tpl.indexOf('data-testid="instant-no-table"'));
    expect(tpl.slice(at, tpl.indexOf('>', at))).toContain('v-if="instantUrl"');
    expect(tpl).toContain('v-if="pointer && result && !noTable && !integrityHold && !staleAt"');
  });
});

// "Prestige at the time shown" on the card itself (the math review's second check, 24 Oct 2026): under each box, in
// the Prestige by line's words, only with hours that limit when a prestige can be made (`hoursLimited`).
describe('the hours note: a clause at the end of First step since spec-slimcard (was a paragraph under each box)', () => {
  const at = (answer: Answer, deadline: boolean, hours: boolean): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });
  for (const [name, answer, deadline] of [
    ['By a date', 'date', true],
    ['Fastest', 'fastest', false],
  ] as const) {
    it(`${name}: no paragraph of its own under the box, with hours set or not`, async () => {
      expect(await draw(at(answer, deadline, true))).not.toContain('data-testid="instant-hours-note"');
      expect(await draw(at(answer, deadline, true))).not.toContain(HOURS_NOTE);
    });
  }
  it('First step is told when the hours limit the prestiges (hoursLimited), and the Prestige by line keeps HOURS_NOTE', () => {
    expect(source).not.toContain('HOURS_NOTE }}');
    expect(source).toContain('hours: hoursLimited.value,');
    expect(source).not.toContain('a prestige even a few minutes off');
    expect(HOURS_NOTE).toBe(
      'With awake hours on, a prestige even a few minutes off the time shown can move your finish by days, so prestige at the time shown.'
    );
    const line = fs.readFileSync(path.resolve(__dirname, 'PrestigeByLine.vue'), 'utf8');
    expect(line).toContain("import { HOURS_NOTE } from '@/lib/hoursNote';");
  });
});

describe('Every number of ascensions: rounded gaps (UX review, 25 Oct 2026)', () => {
  it('Behind and spare go through roundedGap, the exact figure in the tooltip; "spare" and "behind" said to screen readers only', () => {
    const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
    expect(src).toContain("return r === t ? 'fastest' : '+' + roundedGap(r.seconds - t.seconds);");
    // The rows open on tap since spec-slimcard: the column head names Spare and Behind for the eye (aria-hidden), the
    // row's head button says them (countsPhone.spec.ts).
    expect(src).toContain(':title="days(deadline - r.end)"');
    // The spare may wrap ("16h" / "46m") in its column on the narrowest card (By a date's is 290 px on a 390 px phone).
    expect(src).toContain('<span>{{ tableGap(deadline - r.end) }}</span><span class="sr-only">{{ \' \' }}spare</span');
    expect(src).toContain('<span class="whitespace-nowrap" :title="behindExact(r)">{{ behind(r) }}</span');
    expect(src).toContain("<span v-if=\"behind(r) !== 'fastest'\" class=\"sr-only\">{{ ' ' }}behind</span");
  });
});

describe('the green box headline (UX review, 26 Oct 2026, items 2, 4 and 17)', () => {
  const at = (answer: Answer, deadline: boolean): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });
  const D = 86400;

  it('By a date: the spare rounded, amber with "tight" only when spareLine says so', async () => {
    const plain = await draw(at('date', true), { dateSpare: spareLine(8 * D, true, 'en-US') });
    expect(plain).toContain('8d to spare');
    expect(plain).not.toContain('data-testid="box-tight"');
    const caveat = await draw(at('date', true), { dateSpare: spareLine(3 * D, true, 'en-US') });
    expect(caveat).toContain('3d to spare');
    expect(caveat).not.toContain('maybe none on your gear');
    expect(caveat).toContain('data-testid="box-tight"');
    expect(caveat).toMatch(/text-amber-700[^>]*data-testid="box-spare"|data-testid="box-spare"[^>]*text-amber-700/);
    const none = await draw(at('date', true), { dateSpare: spareLine(3 * D, false, 'en-US') });
    expect(none).not.toContain('data-testid="box-tight"');
  });

  it('Fastest: "in 5.1 years", compact (ux29-d); no "worked out ahead" badge; the "instant answer" tag gone (spec-slimcard)', async () => {
    const html = await draw(at('fastest', false), {
      boxLead: { chain: [210, 260, 300], legs: [{ endTE: 210 }, { endTE: 260 }, { endTE: 300 }], end: 1, seconds: 1857.95 * D },
    });
    expect(html).toContain('in 5.1 years');
    expect(html.toLowerCase()).not.toContain('worked out ahead</span');
    expect(html).not.toContain('data-testid="box-instant"');
  });
});

describe('lines that come and go (UX review, 26 Oct 2026, items 3 and 7)', () => {
  const at = (answer: Answer, deadline: boolean): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });

  it('the polish: a small "polished" tag and what it did for the route in the box, inside the box; never "the background polish"', async () => {
    for (const [answer, deadline] of [['date', true], ['fastest', false]] as const) {
      const html = await draw(at(answer, deadline), { boxGain: 'this route 6 h sooner' });
      const box = html.slice(html.indexOf('data-testid="instant-box"'));
      expect(box).toContain('data-testid="box-polished"');
      expect(box).toMatch(/>polished<\/span\s*>this route 6 h sooner/);
      expect(html).not.toContain('background polish');
      expect(await draw(at(answer, deadline))).not.toContain('data-testid="box-polished"');
    }
  });

  it('"Pricing your route on the instant answers for the closest…" only when its line can show (no box on screen)', async () => {
    const withBox = await draw(at('date', true), { bracketStatus: 'running' });
    expect(withBox).not.toContain('Pricing your route');
    const noBox = await draw(at('date', true), { bracketStatus: 'running', boxShown: false });
    expect(noBox).toContain('Pricing your route');
  });
});

describe('cached answers first, then recheck (Jordan, 27 Oct 2026)', () => {
  const at = (answer: Answer, deadline: boolean): State => ({
    answer,
    status: 'loading',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });

  it('the last answer drawn while it is worked out again, marked "From <time>, checking…" (role=status, small)', async () => {
    for (const [answer, deadline] of [['date', true], ['fastest', false]] as const) {
      const html = await draw(at(answer, deadline), { staleAt: 1_792_000_000_000 });
      expect(html).toContain('data-testid="instant-box"');
      const mark = html.slice(html.lastIndexOf('<p', html.indexOf('data-testid="instant-stale"')));
      expect(mark.slice(0, mark.indexOf('</p>'))).toMatch(/role="status"/);
      expect(mark.slice(0, mark.indexOf('</p>'))).toMatch(/text-small/);
      expect(textOf(mark.slice(0, mark.indexOf('</p>') + 4))).toContain('From t1792000000, checking...');
      // ", checking" then the moving dots, aria-hidden (spec-dots, 1 Nov 2026): no typed "…".
      expect(mark.slice(0, mark.indexOf('</p>'))).toContain('checking<span class="animated-dots" aria-hidden="true"');
      // One mark, not the old "previous one" sentence beside it.
      expect(html).not.toContain('The answer below is the previous one');
    }
  });

  it('an answer an older build worked out (Release 7, lib/resultCode.ts): "From <time> (older version), checking…" (DRAFT words)', async () => {
    const html = await draw(at('fastest', false), { staleAt: 1_792_000_000_000, staleOlder: true });
    const mark = html.slice(html.lastIndexOf('<p', html.indexOf('data-testid="instant-stale"')));
    expect(textOf(mark.slice(0, mark.indexOf('</p>') + 4))).toContain('From t1792000000 (older version), checking...');
    const fresh = await draw(at('fastest', false), { staleAt: 1_792_000_000_000 });
    expect(textOf(fresh)).not.toContain('(older version)');
  });

  it('while stale, Follow is held (stale on every Follow button) and the better-route prompt is not drawn', async () => {
    for (const [answer, deadline] of [['date', true], ['fastest', false]] as const) {
      const html = await draw(at(answer, deadline), { staleAt: 1_792_000_000_000 });
      const follows = html.match(/data-part="FollowButton"[^>]*/g) ?? [];
      expect(follows.length).toBeGreaterThan(0);
      for (const f of follows) expect(f).toMatch(/stale="true"/);
      expect(html).not.toContain('data-part="BetterRoutePrompt"');
    }
  });

  it('fresh (no staleAt): no mark, Follow not held, the loading line as before', async () => {
    const html = await draw(at('fastest', false));
    expect(html).not.toContain('data-testid="instant-stale"');
    expect(html.match(/data-part="FollowButton"[^>]*/g)?.join(' ') ?? '').not.toMatch(/stale="true"/);
    expect(html).toContain('The answer below is the previous one until the new one is ready.');
  });
});

function textOf(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * PRESTIGE BY WITH NO-PRESTIGE DAYS (UX fluff review, 5 Nov 2026, item 5; spec-slimcard). On egg-beta, By a date (Egg
 * Day 2027), awake hours 8 am to 11 pm and no-prestige days Dec 24 to 26, the line said "Next: prestige by Dec 24, 2026
 * at 2:00 am": inside a no-prestige day and outside the hours, while the route's own steps prestige on Dec 22 at 9:00
 * pm. The line times its prestige by the hours only (search/prestigeBy.ts), so with days set it is not drawn at all,
 * and the amber "doesn't know your no-prestige days" warning under it goes with it.
 */
describe('Prestige by: hidden whenever no-prestige days are set', () => {
  const DEC_24_2AM = Date.UTC(2026, 11, 24, 10) / 1000; // 2:00 am Pacific
  const LINE = 'Next: prestige by Dec 24, 2026 at 2:00 am to keep 313 TE.';
  const at = (answer: Answer, deadline: boolean): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours: true,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });
  const on = (status: 'running' | 'done', days: boolean) => ({
    prestigeFlag: { enabled: { value: true }, beta: true },
    prestigeStatus: status,
    boxPrestige: {
      line: { show: true, text: LINE, tight: false, byHour: DEC_24_2AM, latestHour: DEC_24_2AM + 3600, spareSeconds: null },
    },
    noPrestigeOn: days,
    stepDays: days ? [{ start: Date.UTC(2026, 11, 24, 8) / 1000, end: Date.UTC(2026, 11, 27, 8) / 1000 }] : [],
  });
  const real = { PrestigeByLine };
  for (const [name, answer, deadline] of [
    ['By a date', 'date', true],
    ['Fastest', 'fastest', false],
  ] as const) {
    it(`${name}: hours 8 am to 11 pm and Dec 24 to 26 off: no "Next: prestige by Dec 24, 2026 at 2:00 am", no warning`, async () => {
      const html = await draw(at(answer, deadline), on('done', true), real);
      expect(html).not.toContain('Next: prestige by');
      expect(html).not.toContain('data-testid="prestige-by"');
      expect(html).not.toContain('data-testid="prestige-by-no-days"');
      expect(html).not.toContain("doesn't know your no-prestige days");
    });
    it(`${name}: nor its "Working out…" line while it runs`, async () => {
      const html = await draw(at(answer, deadline), on('running', true), real);
      expect(html).not.toContain('data-testid="prestige-by-running"');
    });
    it(`${name}: with no days set the line still shows (hours only)`, async () => {
      const html = await draw(at(answer, deadline), on('done', false), real);
      expect(html).toContain('data-testid="prestige-by"');
      expect(html).toContain(LINE);
    });
  }
  it('the warning is gone from the source (moot once the line hides itself)', () => {
    expect(source).not.toContain('prestige-by-no-days');
    expect(source).not.toContain("doesn't know your no-prestige days");
  });
});

/**
 * EVERY NUMBER OF ASCENSIONS, ROWS THAT OPEN ON TAP (spec-slimcard; UX fluff review 5 Nov 2026, item 11; Joo's table).
 * It was a table with Simulate this plan and Follow this route on every row: 12 buttons for 6 counts, about 600 px of
 * a phone card. Now one 44 px line per count (chevron, ascensions, highest TE, spare with a tight tag, route), its head a
 * real button (aria-expanded, aria-controls, Enter and Space as any button, a visible focus ring); opened, it shows
 * "Reached …" and ONE Simulate / Follow pair. The box's row starts open (lib/countRows.ts); several may be open.
 */
describe('Every number of ascensions: rows open on tap, one pair in the open row', () => {
  const at = (answer: Answer, deadline: boolean): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });
  /** Each count row: its <li> … </li>. */
  const rowsOf = (html: string) => [...html.matchAll(/<li[^>]*data-testid="counts-row"[\s\S]*?<\/li>/g)].map(m => m[0]);
  const headOf = (row: string) => row.match(/<button[^>]*data-testid="counts-row-head"[^>]*>/)![0];
  const panelOf = (row: string) => row.slice(row.indexOf('data-testid="counts-row-panel"'));
  const simulates = (s: string) => s.match(/>\s*Simulate this plan\s*<\/button>/g)?.length ?? 0;
  const follows = (s: string) => s.match(/data-part="FollowButton"/g)?.length ?? 0;

  describe('By a date', () => {
    const r = resultOf('date')!;
    const lit = r.byDate;
    const open = { dateRowLit: (x: unknown) => x === lit, countOpen: (x: unknown) => x === lit };

    it('one row per count, each head a real button that says whether it is open and what it opens', async () => {
      const rows = rowsOf(await draw(at('date', true), open));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        const head = headOf(row);
        expect(head).toMatch(/^<button type="button"/);
        const controls = head.match(/aria-controls="([^"]+)"/)![1];
        expect(row).toMatch(new RegExp(`<div[^>]*id="${controls}"[^>]*data-testid="counts-row-panel"`));
        expect(head).toMatch(/id="[^"]+-head"/);
      }
      expect(headOf(rows[0])).toContain('aria-expanded="false"');
      expect(headOf(rows[1])).toContain('aria-expanded="true"');
    });

    it('the box’s row starts open with Reached and one Simulate / Follow pair; a closed row has none', async () => {
      const html = await draw(at('date', true), open);
      const [closed, opened] = rowsOf(html);
      expect(simulates(panelOf(opened))).toBe(1);
      expect(follows(panelOf(opened))).toBe(1);
      expect(panelOf(opened)).toContain(`Reached t${lit!.end}`);
      expect(simulates(closed)).toBe(0);
      expect(follows(closed)).toBe(0);
      expect(panelOf(closed)).toMatch(/^data-testid="counts-row-panel"[^>]*style="display:none;"/);
      // On the whole card: the box's pair and the open row's, no more (was one pair per row).
      expect(simulates(html)).toBe(2);
    });

    it('several rows open at once', async () => {
      const html = await draw(at('date', true), { ...open, countOpen: () => true });
      expect(rowsOf(html).map(row => simulates(panelOf(row)))).toEqual([1, 1]);
    });

    it('the head shows ascensions, highest TE, spare (tight tag under a day) and the route; screen readers hear each named', async () => {
      const [first] = rowsOf(await draw(at('date', true), { ...open, rowTight: () => true }));
      const head = first.slice(0, first.indexOf('</button>'));
      expect(head).toContain('data-testid="counts-te"');
      expect(head).toContain('data-testid="counts-tight"');
      expect(head).toContain('205 → 248 → 308');
      expect(textOf(head)).toMatch(/3 ascensions, 308 TE, .+ spare tight route 205 → 248 → 308/);
      const calm = rowsOf(await draw(at('date', true), { ...open, rowTight: () => false }));
      expect(calm.join('')).not.toContain('data-testid="counts-tight"');
    });

    it('a 44 px head at every width, a visible focus ring, the chevron hidden from screen readers', async () => {
      const head = headOf(rowsOf(await draw(at('date', true), open))[0]);
      expect(head).toContain('min-h-[44px]');
      expect(head).not.toContain('sm:min-h-0');
      expect(head).toContain('focus-visible:ring-2');
      const row = rowsOf(await draw(at('date', true), open))[0];
      expect(row).toMatch(/<span[^>]*aria-hidden="true"[^>]*>›<\/span>/);
    });
  });

  describe('Fastest', () => {
    const r = resultOf('fastest')!;
    it('the box’s row starts open with one pair; the column names Ascensions, Reaches N, Behind, Route', async () => {
      const other = route([220, 300], 1_800_500_000);
      const html = await draw(at('fastest', false), {
        shownRows: [other, r.best],
        countOpen: (x: unknown) => x === r.best,
      });
      const rows = rowsOf(html);
      expect(rows).toHaveLength(2);
      expect(headOf(rows[0])).toContain('aria-expanded="false"');
      expect(headOf(rows[1])).toContain('aria-expanded="true"');
      expect(simulates(panelOf(rows[1]))).toBe(1);
      expect(follows(panelOf(rows[1]))).toBe(1);
      expect(simulates(rows[0])).toBe(0);
      expect(simulates(html)).toBe(2);
      const head = html.match(/<div[^>]*data-testid="counts-head"[\s\S]*?<\/div>/)![0];
      expect(textOf(head)).toBe('Ascensions Reaches 300 Behind Route');
    });
  });

  it('no table and no per-row button block left in the counts cards', () => {
    expect(source).not.toContain('counts-stack');
    expect(source).not.toContain('<div :class="ROUTE_ACTIONS">');
    // The open rows start afresh with each new answer (the box's row open again).
    expect(source).toContain('openCounts.value = new Map()');
  });
});

/**
 * THE SLIM CARD (spec-slimcard; wireframes/instant-slim-v1, Jordan 5 Nov 2026: "yes go ahead that looks good!"): one
 * line under the title in place of five paragraphs (the estimate line in the box, "These are instant answers…",
 * "Each prestige waits for your awake hours…", "Your no-prestige days are kept…"), their detail behind "Why? ›"; a
 * First step line in the green box that carries the awake-hours clause (was the HOURS_NOTE paragraph under the box);
 * no "instant answer" tag; the build-up note on Single run's banner instead (planFromInstant.spec.ts). DRAFT words in
 * lib/instantWords.ts.
 */
describe('the slim card: one line under the title, First step in the box', () => {
  const at = (answer: Answer, deadline: boolean, hours = true): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });
  const HEADER = 'Worked out ahead of time, a few days either side of a search on your save. Keeps your awake hours (8 am to 11 pm) and your 9 no-prestige days.';
  const STEP = 'continue your current ascension to 218 TE (Dec 22, 2026 at 8:11 PM), then prestige at 9:00 PM.';
  const slim = { headerLine: HEADER, firstStep: STEP, noPrestigeOn: true, boxSimulateNote: 'This route’s first ascension continues your build-up' };
  for (const [name, answer, deadline] of [
    ['By a date', 'date', true],
    ['Fastest', 'fastest', false],
  ] as const) {
    it(`${name}: the one line sits under the title, before the controls and the box, its detail behind Why`, async () => {
      const html = await draw(at(answer, deadline), slim);
      const line = html.indexOf('data-testid="instant-header"');
      expect(line).toBeGreaterThan(html.indexOf('Instant answer'));
      expect(line).toBeLessThan(html.indexOf('data-testid="inside-hours"'));
      expect(line).toBeLessThan(html.indexOf('data-testid="instant-box"'));
      const why = html.slice(line, html.indexOf('</details>', line));
      expect(textOf(why)).toContain(`${HEADER} Why? ›`);
      // The detail, folded: the estimate, the hours' wait, the days kept (with the silos).
      expect(why).toContain(INSTANT_ESTIMATE_LINE);
      expect(why).toContain('Each prestige waits for your awake hours (the times shown include the wait).');
      expect(why).toContain('Your no-prestige days are kept');
      expect(why).toContain('until its silos run out');
    });
    it(`${name}: the five paragraphs and the "instant answer" tag are gone`, async () => {
      // Drawn markup only (the template's comments name the old lines).
      const html = (await draw(at(answer, deadline), { ...slim, hoursLimited: true })).replace(/<!--[\s\S]*?-->/g, '');
      for (const gone of ['box-instant', 'instant-estimate', 'instant-one-line', 'instant-hours-note', 'box-simulate-note'])
        expect(html, gone).not.toContain(`data-testid="${gone}"`);
      expect(html).not.toContain('These are instant answers');
      // Only inside Why now, not as paragraphs of their own.
      const out = html.slice(0, html.indexOf('data-testid="instant-header"')) + html.slice(html.indexOf('</details>', html.indexOf('data-testid="instant-header"')));
      expect(out).not.toContain('Each prestige waits for your awake hours');
      expect(out).not.toContain('Your no-prestige days are kept');
    });
    it(`${name}: First step in the green box, the label bold, before When each step happens`, async () => {
      const html = await draw(at(answer, deadline), slim);
      const box = html.slice(html.indexOf('data-testid="instant-box"'));
      const step = box.indexOf('data-testid="box-first-step"');
      expect(step).toBeGreaterThan(-1);
      expect(textOf(box.slice(step - 200, box.indexOf('</p>', step)))).toContain(`First step: ${STEP}`);
      expect(box.slice(step, box.indexOf('</p>', step))).toContain('<b>First step:</b>');
      expect(step).toBeLessThan(box.indexOf('data-testid="box-actions"'));
      expect(step).toBeLessThan(box.indexOf('<InstantSteps'));
    });
    it(`${name}: no line with no box; no First step without one`, async () => {
      expect(await draw(at(answer, deadline), { ...slim, boxShown: false, result: null })).not.toContain('data-testid="instant-header"');
      expect(await draw(at(answer, deadline), { ...slim, firstStep: '' })).not.toContain('data-testid="box-first-step"');
    });
  }
  it('type: the line text-small slate-500, First step text-body; no px sizes, caps, medium/semibold or mono', () => {
    const t = source.slice(0, source.indexOf('<script'));
    const head = t.slice(t.lastIndexOf('<div', t.indexOf('data-testid="instant-header"')), t.indexOf('data-testid="instant-header"'));
    expect(head).toContain('text-small text-slate-500');
    for (const m of t.matchAll(/<p[^>]*data-testid="box-first-step"[^>]*>/g)) {
      expect(m[0]).toContain('text-body');
      expect(m[0]).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
    }
    expect(t.match(/data-testid="box-first-step"/g)).toHaveLength(2);
  });
});

describe('First step when the build-up could not be worked out (spec-buildupmissing-words; Words, 6 Nov 2026)', () => {
  // Jordan's phone, 6 Nov 2026: "First step: prestige now and reach 220 TE" in the middle of a build-up, a fresh start
  // only because the build-up could not be worked out (search/instantFirstLegs.ts `buildUpMissing`, spec-buildupmissing).
  // How the flag is read off the first-legs request, set with its answer, never saved and put back:
  // InstantRoute.buildUpMissing.spec.ts (Reliability). Here: what First step makes of it.
  const script = source.slice(source.indexOf('<script setup'));
  const lineFor = (label: string, buildUpMissing: boolean) =>
    firstStepLine({
      kind: firstStepKind(label),
      stopTE: 220,
      reached: 'Jan 1, 2027 at 2:11 AM',
      prestigeDate: null,
      prestigeTime: null,
      sameDay: false,
      hours: false,
      buildUpMissing,
    });
  const at = (answer: Answer, deadline: boolean): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours: false,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });

  it('the first leg: a fresh start or the ascension you are in with buildUpMissing says so; a build-up first leg never does', () => {
    for (const fresh of ['2-sale', '0-sale', '3-sale-tier13'])
      expect(lineFor(fresh, true)).toBe(`First step: ${FIRST_STEP_BUILDUP_MISSING}`);
    expect(lineFor('2-sale', false)).toBe('First step: prestige now and reach 220 TE (Jan 1, 2027 at 2:11 AM).');
    expect(lineFor('buildup', true)).toBe('First step: continue your build-up to 220 TE (Jan 1, 2027 at 2:11 AM).');
    // spec-buildupmissing-continue (QA, 7 Nov 2026): continue warns too; an unknown label reads as continue.
    for (const cont of ['continue', ''])
      expect(lineFor(cont, true)).toBe(`First step: ${FIRST_STEP_BUILDUP_MISSING_CONTINUE}`);
    expect(lineFor('continue', false)).toBe('First step: continue your current ascension to 220 TE (Jan 1, 2027 at 2:11 AM).');
  });

  it('the page: First step reads the kind from the first leg and the answer\'s buildUpMissing', () => {
    expect(script).toContain('const kind = firstStepKind(legs[0].label);');
    expect(script).toMatch(/firstStepLine\(\{[^}]*buildUpMissing: answerBuildUpMissing\.value,/s);
  });

  for (const [name, answer, deadline] of [
    ['By a date', 'date', true],
    ['Fastest', 'fastest', false],
  ] as const) {
    it(`${name}: the warning is drawn as First step, small and amber; a plain First step stays as it was`, async () => {
      const step = (html: string) => {
        const box = html.slice(html.indexOf('data-testid="instant-box"'));
        const i = box.indexOf('data-testid="box-first-step"');
        return box.slice(box.lastIndexOf('<p', i), box.indexOf('</p>', i) + 4);
      };
      const warned = step(await draw(at(answer, deadline), { firstStep: FIRST_STEP_BUILDUP_MISSING, firstStepWarn: FIRST_STEP_BUILDUP_MISSING_REST }));
      expect(textOf(warned)).toContain(`First step: ${FIRST_STEP_BUILDUP_MISSING}`);
      expect(warned).toMatch(/class="[^"]*text-body text-amber-800/);
      expect(warned).not.toContain('text-small');
      // The first sentence bold after the bold label; the rest plain, in the same amber paragraph at body size (a warning is never smaller than the line it replaces).
      expect(warned.replace(/<!--[\s\S]*?-->/g, '')).toContain(`<b>First step:</b> <b>${FIRST_STEP_BUILDUP_MISSING_LEAD}</b> ${FIRST_STEP_BUILDUP_MISSING_REST}`);
      const plain = step(await draw(at(answer, deadline), { firstStep: 'prestige now and reach 220 TE (Jan 1, 2027 at 2:11 AM).' }));
      expect(plain).toMatch(/class="[^"]*text-body text-slate-800/);
      expect(plain).not.toContain('amber');
    });
    it(`${name}: the continue warning is drawn the same way, its own rest after the bold lead (spec-buildupmissing-continue)`, async () => {
      const box = (await draw(at(answer, deadline), { firstStep: FIRST_STEP_BUILDUP_MISSING_CONTINUE, firstStepWarn: FIRST_STEP_BUILDUP_MISSING_CONTINUE_REST })).replace(/<!--[\s\S]*?-->/g, '');
      const i = box.indexOf('data-testid="box-first-step"', box.indexOf('data-testid="instant-box"'));
      const warned = box.slice(box.lastIndexOf('<p', i), box.indexOf('</p>', i) + 4);
      expect(warned).toMatch(/class="[^"]*text-body text-amber-800/);
      expect(warned).toContain(`<b>First step:</b> <b>${FIRST_STEP_BUILDUP_MISSING_LEAD}</b> ${FIRST_STEP_BUILDUP_MISSING_CONTINUE_REST}`);
      expect(textOf(warned)).not.toContain('then prestige');
    });
  }

  it('the page warns exactly when First step is a warning line, drawing that warning\'s own rest', () => {
    expect(script).toContain('const firstStepWarn = computed(() => buildUpMissingRestOf(firstStep.value));');
    expect(source).not.toContain('{{ FIRST_STEP_BUILDUP_MISSING_REST }}');
    expect(source.match(/<b>\{\{ FIRST_STEP_BUILDUP_MISSING_LEAD \}\}<\/b>\{\{ ' ' \}\}\{\{ firstStepWarn \}\}/g)).toHaveLength(2);
  });
});

describe('The night-buy note under First step (spec-nightbuynote; Jordan option b, until Joo\'s fix after #729)', () => {
  // With awake hours set, a build-up's research buys can fall outside them, so the finish First step gives for "continue
  // your build-up" is a best case. Said once under First step (INSTANT_NIGHT_BUY_NOTE, INSTANT_NIGHT_BUY_TIP behind a "?"), only
  // when the first ascension continues the build-up and the hours limit the answer (lib/nightBuyNote.ts); never for a
  // fresh start or the ascension you are in continued.
  const script = source.slice(source.indexOf('<script setup'));
  const BUILD_STEP = 'continue your build-up to 218 TE (Dec 22, 2026 at 8:11 PM), then prestige at 9:00 PM.';
  const words = { INSTANT_NIGHT_BUY_NOTE, INSTANT_NIGHT_BUY_TIP };
  const at = (answer: Answer, deadline: boolean): State => ({
    answer,
    status: 'done',
    below: false,
    noTable: false,
    hold: false,
    deadline,
    hours: true,
    waiting: false,
    saveWait: false,
    atTarget: false,
    saved: false,
  });
  const count = (s: string, sub: string) => s.split(sub).length - 1;
  for (const [name, answer, deadline] of [
    ['By a date', 'date', true],
    ['Fastest', 'fastest', false],
  ] as const) {
    it(`${name}: shown once, from the shared words, right under First step`, async () => {
      const html = await draw(at(answer, deadline), { ...words, firstStep: BUILD_STEP, nightBuyNote: true });
      const box = html.slice(html.indexOf('data-testid="instant-box"'));
      expect(count(box, 'data-testid="box-night-buy"')).toBe(1);
      expect(count(textOf(box), INSTANT_NIGHT_BUY_NOTE)).toBe(1);
      expect(textOf(box)).toContain(INSTANT_NIGHT_BUY_TIP);
      const step = box.indexOf('data-testid="box-first-step"');
      const note = box.indexOf('data-testid="box-night-buy"');
      expect(note).toBeGreaterThan(step);
      expect(note).toBeLessThan(box.indexOf('<InstantSteps'));
    });
    it(`${name}: with the hours clause too, ONE merged line under First step (spec-uxpass item 9)`, async () => {
      const html = await draw(at(answer, deadline), { ...words, firstStep: `${BUILD_STEP} ${FIRST_STEP_HOURS}`, nightBuyNote: true });
      const box = textOf(html.slice(html.indexOf('data-testid="instant-box"')));
      expect(count(box, FIRST_STEP_HOURS_NIGHT_BUY)).toBe(1);
      expect(box).not.toContain(FIRST_STEP_HOURS);
      expect(box).not.toContain(INSTANT_NIGHT_BUY_NOTE);
      expect(box).toContain(BUILD_STEP);
      expect(count(html, 'data-testid="box-night-buy"')).toBe(1);
    });
    it(`${name}: not shown when the page says no (no hours, a fresh start, the ascension you are in)`, async () => {
      const html = await draw(at(answer, deadline), { ...words, firstStep: BUILD_STEP, nightBuyNote: false });
      expect(html).not.toContain('data-testid="box-night-buy"');
      expect(html).not.toContain(INSTANT_NIGHT_BUY_NOTE);
    });
  }
  it('the page: shown with the hours that limit the answer and a first ascension that continues the build-up', () => {
    // The note's words come through lib/instantWords.ts mergeFirstStepCaveats (INSTANT_NIGHT_BUY_NOTE, or the merged line).
    expect(script).toMatch(/import \{[^}]*mergeFirstStepCaveats[^}]*\} from '@\/lib\/instantWords'/);
    expect(script).toContain('const stepCaveat = computed(() => mergeFirstStepCaveats(firstStep.value, nightBuyNote.value));');
    expect(script).toMatch(
      /const nightBuyNote = computed\(\(\) =>\s*!!firstStep\.value &&\s*!firstStepWarn\.value &&\s*nightBuyNoteShown\(hoursLimited\.value \? store\.availability : null, firstStepKind\(firstLegs\.value\?\.\[0\]\?\.label\) === 'buildup'\)\s*\);/
    );
  });
  it('never with the build-up-missing warning, fresh or continue (spec-buildupmissing-continue)', () => {
    // The page's rule: !firstStepWarn, and the build-up kind only. A continue warning is a warning line and not the build-up.
    expect(buildUpMissingRestOf(FIRST_STEP_BUILDUP_MISSING_CONTINUE)).not.toBe('');
    expect(buildUpMissingRestOf(FIRST_STEP_BUILDUP_MISSING)).not.toBe('');
    expect(firstStepKind('continue')).not.toBe('buildup');
  });
  it('the kind it keys on: buildup only, never a fresh start or the ascension you are in', () => {
    expect(firstStepKind('buildup')).toBe('buildup');
    for (const l of ['2-sale', '0-sale', '3-sale-tier13', 'continue', null]) expect(firstStepKind(l)).not.toBe('buildup');
  });
  it('type: text-small slate, the "?" tip, no px sizes, caps, medium/semibold or mono; one per box', () => {
    const t = source.slice(0, source.indexOf('<script'));
    const tags = [...t.matchAll(/<p[^>]*data-testid="box-night-buy"[^>]*>[\s\S]*?<\/p>/g)].map(m => m[0]);
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag).toContain('text-small');
      expect(tag).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
      expect(tag).toMatch(/\{\{ stepCaveat\.note \}\}\{\{ ' ' \}\}<HelpTip[^>]*>\{\{ INSTANT_NIGHT_BUY_TIP \}\}<\/HelpTip>/);
    }
  });
});
