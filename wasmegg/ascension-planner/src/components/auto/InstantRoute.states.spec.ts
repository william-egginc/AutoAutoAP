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
import CollapsibleSection from './CollapsibleSection.vue';
import InstantIntegrity from './InstantIntegrity.vue';

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
    INSTANT_ONE_LINE: 'These are instant answers, worked out ahead of time.',
    MAX_ASCENSIONS: 12,
    NAMES: { science: 'Science', how: 'How it works', smart: 'Fast' },
    SHARE_WHAT: '',
    SIMULATE_TITLE: '',
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
    loadingText: 'Working out every route…',
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
    plural: (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`,
    pointer: null,
    preferCopy: { chip: '', what: '', line: '', muted: '' },
    preferMargin: { kind: 'off' },
    preferPicked: false,
    preferShowBest: false,
    pressRun: () => {},
    prestige: null,
    boxPrestige: null,
    prestigeFlag: { enabled: { value: false }, beta: true },
    prestigeStatus: 'idle',
    result,
    resultFromBefore: false,
    rowFollowable: () => true,
    run: () => {},
    runBusy: s.waiting,
    saveWaitText: s.saveWait ? 'Waiting for your save to load…' : '',
    savedAt: s.saved ? 1_792_000_000_000 : null,
    seeResult: () => {},
    setInsideHours: () => {},
    shareNote: null,
    shareText: '',
    shareThis: false,
    shareTo: '#search-share-by-date',
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

async function draw(s: State, over: Record<string, unknown> = {}): Promise<string> {
  const ctx = { ...ctxOf(s), ...over };
  const cache: unknown[] = [];
  const app = createSSRApp({ render: () => h(defineComponent({ render: () => render(ctx, cache) })) });
  for (const p of PARTS) app.component(p, stub(p));
  // The integrity line itself: it draws nothing when there is nothing to say, so it is not a stand-in.
  app.component('InstantIntegrity', InstantIntegrity);
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
      const section = tpl.slice(tpl.indexOf('<CollapsibleSection'), tpl.indexOf('</CollapsibleSection>'));
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
    const at = tpl.indexOf('<Teleport');
    expect(tpl.indexOf('<Teleport', at + 1)).toBe(-1);
    // After both sections: a sibling of the card, not inside it.
    expect(at).toBeGreaterThan(tpl.indexOf('data-testid="instant-no-table"'));
    expect(tpl.slice(at, tpl.indexOf('>', at))).toContain('v-if="instantUrl"');
    expect(tpl).toContain('v-if="pointer && result && !noTable && !integrityHold"');
  });
});

// "Prestige at the time shown" on the card itself (the math review's second check, 24 Oct 2026): under each box, in
// the Prestige by line's words, only with hours that limit when a prestige can be made (`hoursLimited`).
describe('the hours note under each box', () => {
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
  const NOTE = 'data-testid="instant-hours-note"';
  for (const [name, answer, deadline] of [
    ['By a date', 'date', true],
    ['Fastest', 'fastest', false],
  ] as const) {
    it(`${name}: shown with hours set, in the Prestige by line's words`, async () => {
      const html = await draw(at(answer, deadline, true));
      expect(html).toContain(NOTE);
      expect(html).toContain(HOURS_NOTE);
      // Small grey text like the one line, after it; no amber box of its own.
      const note = html.slice(html.lastIndexOf('<p', html.indexOf(NOTE)), html.indexOf(NOTE));
      expect(note).toContain('text-slate-600');
      expect(html.indexOf(NOTE)).toBeGreaterThan(html.indexOf('data-testid="instant-one-line"'));
    });
    it(`${name}: hidden without hours, and with hours set to any hour`, async () => {
      expect(await draw(at(answer, deadline, false))).not.toContain(NOTE);
      expect(await draw(at(answer, deadline, true), { hoursLimited: false })).not.toContain(NOTE);
    });
  }
  it('the words are the Prestige by line\'s own constant, not a copy', () => {
    expect(HOURS_NOTE).toBe(
      'With awake hours on, a prestige even a few minutes off the time shown can move your finish by days, so prestige at the time shown.'
    );
    expect(source).toContain("import { HOURS_NOTE } from '@/lib/hoursNote';");
    expect(source.match(/\{\{ HOURS_NOTE \}\}/g)).toHaveLength(2);
    expect(source).not.toContain('a prestige even a few minutes off');
    const line = fs.readFileSync(path.resolve(__dirname, 'PrestigeByLine.vue'), 'utf8');
    expect(line).toContain("import { HOURS_NOTE } from '@/lib/hoursNote';");
  });
});

describe('Every number of ascensions: rounded gaps (UX review, 25 Oct 2026)', () => {
  it('Behind and spare go through roundedGap, the exact figure in the tooltip, and a phone row says "behind"', () => {
    const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
    expect(src).toContain("return r === t ? 'fastest' : '+' + roundedGap(r.seconds - t.seconds);");
    expect(src).toContain('<span class="whitespace-nowrap" :title="days(deadline - r.end)">{{ tableGap(deadline - r.end) }} spare</span>');
    expect(src).toContain('<span v-if="behind(r) !== \'fastest\'" class="min-[30rem]:hidden"> behind</span>');
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
    expect(plain).toContain('8 days to spare');
    expect(plain).not.toContain('data-testid="box-tight"');
    const caveat = await draw(at('date', true), { dateSpare: spareLine(3 * D, true, 'en-US') });
    expect(caveat).toContain('3 days to spare, maybe none on your gear');
    expect(caveat).toContain('data-testid="box-tight"');
    expect(caveat).toMatch(/text-amber-700[^>]*data-testid="box-spare"|data-testid="box-spare"[^>]*text-amber-700/);
    const none = await draw(at('date', true), { dateSpare: spareLine(3 * D, false, 'en-US') });
    expect(none).not.toContain('data-testid="box-tight"');
  });

  it('Fastest: "in N days" without two decimals; no "worked out ahead" badge, the "instant answer" tag stays', async () => {
    const html = await draw(at('fastest', false), {
      boxLead: { chain: [210, 260, 300], legs: [{ endTE: 210 }, { endTE: 260 }, { endTE: 300 }], end: 1, seconds: 1857.95 * D },
    });
    expect(html).toContain('in 1,858 days (5.1 years)');
    expect(html.toLowerCase()).not.toContain('worked out ahead</span');
    expect(html).toContain('data-testid="box-instant"');
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
