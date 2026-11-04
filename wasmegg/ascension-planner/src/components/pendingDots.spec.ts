/**
 * MOVING DOTS ON EVERY "STILL WORKING" LABEL (spec-dots, Jordan 1 Nov 2026: "Can we have all the parts that are
 * searching have a simple '...' repeating (like the searching...) so that the user knows that something is going on
 * and it's not frozen"; his shot: My runs, "Build-up tracker  working it out..." with still dots).
 *
 * A label shown while something runs has its words typed and its dots drawn by components/auto/AnimatedDots.vue (CSS
 * only, aria-hidden, still with reduced motion), as FindBar's "Searching" has since 12 Oct. A string from a module that
 * keeps its "…" (the hashed search and plan files, the store) is drawn through PendingText.vue (lib/pendingWords.ts).
 *
 * 1. A source scan: no pending label in a component, an Insights page or a words file ends in a typed "…" or "...",
 *    except the ones named below, each with why.
 * 2. Each converted label, drawn: its words as they were, then the dots (aria-hidden), and its role / aria-busy kept.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { splitPending } from '@/lib/pendingWords';
import { isWordingOnly, resultCodeInputs } from '@/lib/resultCodeHash';
import AnimatedDots from './auto/AnimatedDots.vue';
import PendingText from './auto/PendingText.vue';
import PanelFold from './auto/PanelFold.vue';
import CollapsibleSection from './auto/CollapsibleSection.vue';
import FollowButton from './FollowButton.vue';
import BuildUpTracker from './myruns/BuildUpTracker.vue';

const SRC = path.resolve(__dirname, '..');
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');

function filesUnder(dir: string, ok: (p: string) => boolean, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) filesUnder(p, ok, out);
    else if (ok(p)) out.push(p);
  }
  return out;
}

/** The source without its comments (HTML, block and line), so a note that quotes an old label is not a label. */
function withoutComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');
}

/** A word that says something is going on, up to a typed ellipsis on the same run of text (not a spread `...x`). */
const PENDING = new RegExp(
  String.raw`\b(?:Loading|Working|working|Checking|checking|Re-checking|Calculating|calculating|Recalculating|Re-planning|` +
    String.raw`Saving|Sending|Searching|Pricing|pricing|Polishing|measuring|Measuring|Benchmarking|Running|Starting|Hiding|` +
    String.raw`Showing|Renaming|Preparing|Uploading|Counting|Finding|Trying|Carrying on|Opening|Waiting|Making|stopping|` +
    String.raw`Stopping|Buying|Exporting|Generating|Fetching|Initializing|Re-checking|One Moment)\b` +
    String.raw`[^"\x60<>\n]{0,140}?(?:…|\.\.\.)(?![A-Za-z0-9_$\[({.])`,
  'g'
);

/**
 * Left as typed, each with why. Classic and the Manual Planner are Joo's (not changed without asking); the rest are
 * not "still working" labels on a page that draws them with Vue.
 */
const ALLOWED: { file: string; text: string; why: string }[] = [
  { file: 'App.vue', text: 'Loading player data...', why: "Manual Planner (Joo's): not changed without asking" },
  { file: 'App.vue', text: 'One Moment...', why: "Manual Planner's loading overlay (Joo's)" },
  { file: 'App.vue', text: 'Fetching your data and crunching the numbers to set up your plan...', why: "Manual Planner's loading overlay (Joo's)" },
  { file: 'components/RecalculationOverlay.vue', text: 'Recalculating...', why: "Manual Planner's recalculation (Joo's)" },
  { file: 'components/LoadingOverlay.vue', text: 'Simulating research sales and 2x earnings windows across thousands of purchase orders to chart your fastest path...', why: "Manual Planner's loading overlay (Joo's)" },
  { file: 'components/auto/AutomaticPlanner.vue', text: 'Form locked while calculating...', why: "Classic (Single run), Joo's planner" },
  { file: 'components/auto/AutomaticPlanner.vue', text: 'Calculating...', why: "Classic (Single run), Joo's planner" },
  { file: 'components/auto/AutomaticPlanner.vue', text: 'Generating Plan...', why: "Classic (Single run), Joo's planner" },
  { file: 'components/auto/AutomaticPlanner.vue', text: 'Saving...', why: "Classic (Single run), Joo's planner" },
  { file: 'components/auto/AutomaticPlanner.vue', text: 'Exporting...', why: "Classic (Single run), Joo's planner" },
  { file: 'components/auto/AscensionOverview.vue', text: 'Saving...', why: "Classic (Single run), Joo's planner" },
  { file: 'components/actions/ResearchActions.vue', text: 'Buying…', why: "Manual Planner (Joo's)" },
  { file: 'components/actions/SmartBuyView.vue', text: 'Buying…', why: "Manual Planner (Joo's)" },
  { file: 'components/actions/QuickBuy.vue', text: 'Buying…', why: "Manual Planner (Joo's)" },
  { file: 'components/auto/InsanePanel.vue', text: 'on a space with long routes "Stopping…" can sit', why: 'a sentence in How it works that quotes the label (drawn by SendingText, moving)' },
  { file: 'components/CustomEggWatcher.vue', text: 'Checking GitHub for custom egg updates…', why: 'shown on a dev build only' },
  // Not a label at all: the run's own aria-label (FindBar draws the dots after the words beside it).
  { file: 'components/auto/FindBar.vue', text: 'running...', why: 'aria-label text, read by a screen reader (the dots are drawn in the label)' },
  { file: 'components/auto/FindBar.vue', text: 'Searching...', why: "the prop's default; FindBar strips the dots and draws AnimatedDots (`runningWords`)" },
];

const SCANNED = [
  ...filesUnder(path.join(SRC, 'components'), p => p.endsWith('.vue')),
  ...filesUnder(path.join(SRC, 'explorer'), p => p.endsWith('.vue')),
  path.join(SRC, 'App.vue'),
  ...fs
    .readdirSync(path.join(SRC, 'lib'))
    .filter(f => /Words?\.ts$/.test(f))
    .map(f => path.join(SRC, 'lib', f)),
];

/** Every pending label that still ends in a typed ellipsis: "file: text". */
function typedDots(): string[] {
  const out: string[] = [];
  for (const f of SCANNED) {
    const src = withoutComments(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(PENDING)) {
      const text = m[0].replace(/\s+/g, ' ');
      if (ALLOWED.some(a => a.file === rel(f) && a.text.replace(/\s+/g, ' ').includes(text))) continue;
      out.push(`${rel(f)}: ${text}`);
    }
  }
  return out;
}

describe('pending labels: no typed "…" or "..." (spec-dots, Jordan 1 Nov 2026)', () => {
  it('the scan finds a typed one, and leaves a spread, a comment and a finished label alone', () => {
    const src = `<p>Working out every route…</p> {{ saving ? 'Saving...' : 'Saved' }} <!-- Loading… --> {...rest} Loaded.`;
    expect([...withoutComments(src).matchAll(PENDING)].map(m => m[0])).toEqual(['Working out every route…', 'Saving...']);
  });

  it('every pending label in the components, Insights pages and words files draws its dots (or is named, with why)', () => {
    expect(typedDots()).toEqual([]);
  });

  it('each one named as left is still there (the list stays true)', () => {
    for (const a of ALLOWED) expect(fs.readFileSync(path.join(SRC, a.file), 'utf8'), `${a.file}: ${a.text}`).toContain(a.text);
  });
});

/**
 * Each label converted, in its own words as before (Words owns wording: only the typed "…" / "..." went), with the dots
 * drawn right after them. `then`: what follows the dots, unchanged. Source-level, so every screen is covered; the
 * describe below draws the main ones.
 */
const CONVERTED: [file: string, words: string, then?: string][] = [
  ['components/myruns/BuildUpTracker.vue', 'Re-planning', "{{ ' ' }}(about half a minute)"],
  ['components/FollowButton.vue', 'Checking'],
  ['components/auto/InstantRoute.vue', ', checking'],
  ['components/auto/InstantRoute.vue', 'Polishing the routes in the background'],
  ['components/auto/InstantRoute.vue', 'Pricing your route on the instant answers for the closest stronger and weaker gear on this site'],
  ['components/auto/InstantRoute.vue', '{{ loadingText }}', '<AnimatedDots v-if="loadingText" />'],
  ['components/myruns/RightNowCard.vue', 'Working out your shifts', "<template v-if=\"simSlow\">{{ ' ' }}(can take a few minutes)</template>"],
  ['components/myruns/RightNowCard.vue', "{{ follow.staleOlder ? ' (older version)' : '' }}, checking"],
  ['components/myruns/RightNowCard.vue', "Working out your route's times from the instant answer's data"],
  ['components/myruns/RightNowCard.vue', 'Working out the instant answer for your setup'],
  ['components/auto/PrestigeByLine.vue', 'Working out how long your next prestige can wait'],
  ['components/auto/InstantIntegrity.vue', 'Checking whether this account can build'],
  ['components/auto/IntegrityNotice.vue', 'Checking whether this account can build'],
  ['components/auto/IntegrityNotice.vue', '<template v-if="ui.loading">Loading'],
  ['components/auto/MaxedWhatIf.vue', 'Finding your route again with maxed gear'],
  ['components/auto/RouteResultCard.vue', 'pricing'],
  ['components/auto/RouteResultCard.vue', '<template v-if="saving">Saving'],
  ['components/auto/RunSaveNotice.vue', 'Re-checking'],
  ['components/auto/SaveFileBar.vue', 'Loading the save'],
  ['components/auto/EntrySaveActions.vue', 'Loading the save'],
  ['components/auto/LeaderboardPanel.vue', '<template v-if="hideAllBusy">Working'],
  ['components/auto/LeaderboardPanel.vue', 'Showing'],
  ['components/auto/LeaderboardPanel.vue', 'text-center">Loading'],
  ['components/auto/LeaderboardRunDetail.vue', 'Showing'],
  ['components/auto/LeaderboardRunDetail.vue', 'Hiding'],
  ['components/auto/SavedRuns.vue', '<template v-if="saving">Saving'],
  ['components/auto/SavedRuns.vue', 'Carrying on'],
  ['components/auto/LatestRunView.vue', 'Working out when each stop happens, on one worker', "{{ ' ' }}about half a minute."],
  ['components/auto/WaitBeforePrestige.vue', 'Stopping after the routes being priced now'],
  ['components/auto/WaitBeforePrestige.vue', 'Trying waits before each prestige', '{{ ` ${done} of at most ${most} routes priced.` }}'],
  ['components/auto/StepAwayOptions.vue', 'Opening the watcher tab'],
  ['components/auto/StepAwayOptions.vue', '{{ phoneLine }}', '<AnimatedDots v-if="phoneSending" />'],
  ['components/auto/BoardSubmitButtons.vue', 'Renaming'],
  ['components/auto/RunSendReport.vue', 'Renaming'],
  ['components/auto/ByDateRouteCard.vue', '<template v-if="saving">Saving'],
  ['components/auto/InsanePanel.vue', '<template v-if="store.isRunning">Running'],
  ['components/auto/InsanePanel.vue', 'Benchmarking'],
  ['components/auto/InsanePanel.vue', "{{ ' ' }}(measuring", ')'],
  ['components/auto/DeadlinePanel.vue', 'measuring'],
  ['components/auto/RunProgressBar.vue', ' (measuring', ')'],
  ['components/auto/RunProgressBar.vue', ' · measuring time left'],
  ['components/myruns/AscensionList.vue', '{{ noShifts(l) }}', '<AnimatedDots v-if="shiftsWorking(l)"'],
  ['components/charts/EChart.vue', 'Loading chart'],
  ['components/myruns/FollowHistory.vue', 'text-slate-500">Loading'],
  ['components/myruns/SaveAgeStrip.vue', 'Loading your save'],
  ['components/science/SweepRunner.vue', 'Loading your latest save'],
  ['components/science/SweepRunner.vue', 'Starting'],
  ['explorer/AccountTopPlans.vue', 'Loading {{ progress }}'],
  ['explorer/ChainExplorer.vue', 'Loading the runs'],
  ['explorer/ChainExplorer.vue', '<template v-if="csvLoadingId === row.id">Loading'],
  ['explorer/FlaggedBoard.vue', 'Loading these runs'],
  ['explorer/SweepCurvesChart.vue', '{{ `Loading ${progress}` }}'],
  ['explorer/SweepUpload.vue', '<template v-if="sending">Sending'],
  ['explorer/SweepUpload.vue', 'Sending the CSV'],
  ['explorer/SweepUpload.vue', '{{ sendMessage }}', '<AnimatedDots v-if="sending && sendMessage === PREPARING" />'],
  ['explorer/WhatWeKnow.vue', 'Counting the Leaderboard'],
];

describe('each converted label: its words, then the drawn dots', () => {
  it.each(CONVERTED)('%s: "%s"', (file, words, then) => {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    if (then?.startsWith('<AnimatedDots')) expect(src).toContain(`${words}${then}`);
    else expect(src).toContain(`${words}<AnimatedDots />${then ?? ''}`);
    expect(src).toMatch(/import AnimatedDots from '(?:@\/components\/auto|\.)\/AnimatedDots\.vue';/);
  });
});

/**
 * Strings that keep their typed "…" in a module (a result-hash input or the store), drawn by PendingText: the module's
 * line, where it shows. `from`: the module and what it says while working.
 */
const VIA_PENDING_TEXT: [file: string, use: string, from: string][] = [
  ['components/auto/InstantRoute.vue', '<PendingText :text="idle.text" />', 'search/instantDeferral.ts IDLE_LOADING "Loading the instant answer…"'],
  ['components/auto/InstantRoute.vue', '<PendingText :text="saveWaitText" />', 'search/startProvenance.ts startWaitText "Waiting for your save to finish loading before working out the instant answer…"'],
  ['components/auto/DeadlinePanel.vue', '<PendingText :text="instantWait" />', 'search/autoWiden.ts INSTANT_WAIT_STATUS "Checking for an instant answer…"'],
  ['components/auto/DeadlinePanel.vue', '<PendingText :text="autoStatus" />', 'search/autoWiden.ts widenStatus, QUICK_SCAN_STATUS, afterScanStatus, INSTANT_TIMEOUT_STATUS'],
  ['components/auto/DeadlinePanel.vue', '<PendingText :text="quickStatus" :pending="!instantWait && !autoStatus" />', "the panel's own Nearby routes line (no typed dots), else the two above"],
  ['components/auto/RunProgressBar.vue', '<PendingText :text="p.stage" />', 'stores/chainSearch.ts stage, e.g. "stopping after the current batch..."'],
  ['components/auto/BigCsvStatus.vue', '<PendingText :text="s.message" />', 'stores/chainSearch.ts bigCsvState "Making the full CSV...", "Uploading the full CSV..."'],
  ['components/auto/RunSendReport.vue', '<PendingText :text="message" />', 'search/sendRun.ts onStage "Preparing your result...", "Sending..."'],
  ['components/myruns/RightNowCard.vue', '<PendingText :text="optionSub(g)" />', 'lib/planGoals.ts followOptionWords "… · checking…"'],
];

describe('module strings that keep their "…": drawn with the dots where they show', () => {
  it.each(VIA_PENDING_TEXT)('%s: %s (%s)', (file, use) => {
    expect(fs.readFileSync(path.join(SRC, file), 'utf8')).toContain(use);
  });
});

/** The dots, as AnimatedDots draws them. */
const DOTS = 'class="animated-dots" aria-hidden="true"';

describe('the dots themselves', () => {
  it('AnimatedDots is aria-hidden, so a screen reader reads the words and not "dot dot dot"', async () => {
    expect(await renderHtml(AnimatedDots, {})).toContain(DOTS);
  });

  it('splitPending: the words without a trailing "…" or "...", and whether it had one; nothing else changes', () => {
    expect(splitPending('Loading the instant answer…')).toEqual({ words: 'Loading the instant answer', pending: true });
    expect(splitPending('Uploading the full CSV...')).toEqual({ words: 'Uploading the full CSV', pending: true });
    expect(splitPending('following · lands about Nov 4, 2026 · checking…')).toEqual({ words: 'following · lands about Nov 4, 2026 · checking', pending: true });
    expect(splitPending('Not sent: try again.')).toEqual({ words: 'Not sent: try again.', pending: false });
    expect(splitPending('1 … 9 boxes')).toEqual({ words: '1 … 9 boxes', pending: false });
  });

  it('PendingText: the words, then the dots; a finished line as it is', async () => {
    const html = await renderHtml(PendingText, { text: 'Checking for an instant answer…' });
    expect(textOf(html)).toBe('Checking for an instant answer...');
    expect(html).toContain(DOTS);
    expect(html).not.toContain('…');
    const done = await renderHtml(PendingText, { text: 'Reaches 490 on Nov 4 · 5 ascensions' });
    expect(done).not.toContain('animated-dots');
    expect(textOf(done)).toBe('Reaches 490 on Nov 4 · 5 ascensions');
  });
});

describe('the labels, drawn', () => {
  const NOW = mt(10, 30, 12, 10);
  const plan = fixturePlan();
  const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });
  const tracker = (state: string, over: Record<string, unknown> = {}) =>
    renderHtml(BuildUpTracker, {
      state,
      open: true,
      result: state === 'ready' ? result : null,
      ticks: new Set<string>(),
      summary: state === 'ready' ? trackerSummary(result, new Set()) : null,
      now: NOW,
      zone: ZONE,
      saveSeconds: mt(10, 30, 12, 5),
      ...over,
    });

  it('Build-up tracker, working: "working it out" then the dots, in the fold\'s hint (Jordan\'s shot)', async () => {
    const html = await tracker('working');
    const hint = html.match(/data-testid="fold-buildUpTracker-hint"[^>]*>([\s\S]*?)<\/span><span aria-hidden="true" class="fold-chevron/);
    expect(hint).not.toBeNull();
    expect(textOf(hint![1])).toBe('working it out...');
    expect(hint![1]).toContain(DOTS);
    expect(html).not.toContain('…');
  });

  it('Build-up tracker, re-planning: "Re-planning", the dots, then " (about half a minute)"; the button stays aria-busy', async () => {
    const replan = { shown: true, working: true, error: '', behind: 7200, offPlan: [], keepsTicks: false };
    const html = await tracker('ready', { replan });
    const b = html.match(/<button[^>]*data-testid="buildup-replan-button"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(b).toMatch(/aria-busy="true"/);
    expect(b).toContain(DOTS);
    expect(textOf(b)).toBe('Re-planning... (about half a minute)');
    expect(b).not.toContain('…');
    const idle = (await tracker('ready', { replan: { ...replan, working: false } })).match(/<button[^>]*data-testid="buildup-replan-button"[^>]*>[\s\S]*?<\/button>/)![0];
    expect(textOf(idle)).toBe('Re-plan from this save');
    expect(idle).not.toContain('animated-dots');
  });

  it('Follow, held while its answer is from before: "Checking" then the dots', async () => {
    const base = { chain: [200, 250, 300], goalKey: 'fastest-490', from: 'answer' };
    const html = await renderHtml(FollowButton, { ...base, stale: true });
    expect(textOf(html)).toBe('Checking...');
    expect(html).toContain(DOTS);
    expect(html).toMatch(/disabled/);
    expect(textOf(await renderHtml(FollowButton, { ...base, stale: false }))).toBe('Follow this route');
  });

  it('a hidden section\'s one line ("working out" while the instant answer is worked out): the words, then the dots', async () => {
    // Hidden (its Show bar), as this browser remembered it.
    const was = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => '1', setItem: () => {} };
    try {
      const html = await renderHtml(CollapsibleSection, { id: 'dots-spec', title: 'Instant answer', summary: 'working out', summaryBusy: true });
      expect(html).toContain('data-testid="show-dots-spec"');
      expect(textOf(html)).toBe('Instant answer working out... Show');
      expect(html).toContain(DOTS);
      expect(html).not.toContain('…');
      const done = await renderHtml(CollapsibleSection, { id: 'dots-spec', title: 'Instant answer', summary: 'Reaches 490 on Nov 4 · 5 ascensions' });
      expect(done).not.toContain('animated-dots');
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = was;
    }
  });

  it('a fold\'s hint marked busy gets the dots; a plain one does not', async () => {
    const busy = await renderHtml(PanelFold, { section: 'buildUpTracker', title: 'Build-up tracker', hint: 'working it out', hintBusy: true });
    expect(busy).toContain(DOTS);
    expect(textOf(busy)).toContain('working it out...');
    const plain = await renderHtml(PanelFold, { section: 'buildUpTracker', title: 'Build-up tracker', hint: '3 of 9 check-ins done' });
    expect(plain).not.toContain('animated-dots');
  });
});

describe('the result code hash is not moved (lib/resultCodeHash.ts, R7 recalc)', () => {
  it('the dots touch no hash input: the helper is a words file, the rest is components and the spec helper', () => {
    const root = path.resolve(SRC, '..');
    const files = new Map<string, string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const r = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(r);
        else if (e.name.endsWith('.ts')) files.set(r, fs.readFileSync(path.join(root, r), 'utf8'));
      }
    };
    walk('src');
    files.set('release.ts', fs.readFileSync(path.join(root, 'release.ts'), 'utf8'));
    const inputs = resultCodeInputs(files);
    expect(isWordingOnly('src/lib/pendingWords.ts')).toBe(true);
    // Every .ts this change adds or edits outside src/components (spec-dots, 1 Nov 2026); the strings that keep their
    // "…" in the hashed search and plan files (search/instantDeferral.ts, autoWiden.ts, startProvenance.ts, sendRun.ts,
    // lib/planGoals.ts) are drawn by PendingText.vue instead of being edited.
    for (const f of ['src/lib/pendingWords.ts', 'src/test/renderComponent.ts']) expect(inputs, f).not.toContain(f);
  });
});
