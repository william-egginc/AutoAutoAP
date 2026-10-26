/**
 * Tap targets on a phone (Jordan's 390 px pass, 23 Oct 2026): below sm every link, button, select and summary row
 * named here is at least 44 px tall; from sm up each one is as it was (`sm:min-h-0`, `sm:pt-0`). Source wiring, by
 * test id or by the words the element holds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './auto/resultCardStyle';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const TAP = 'inline-flex items-center min-h-[44px] sm:min-h-0';
const SUMMARY = 'min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0';

/** The opening tag holding `marker` (an attribute in it). */
function tagWith(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const open = src.lastIndexOf('<', at);
  return src.slice(open, src.indexOf('>', at) + 1);
}
describe('the instant card on a phone', () => {
  const src = read('auto/InstantRoute.vue');
  it('Simulate this plan (both boxes and the counts rows) is 44 px tall', () => {
    const tags = [...src.matchAll(/<button[^>]*>\s*Simulate this plan\s*<\/button>/g)].map(m => m[0]);
    expect(tags).toHaveLength(4);
    for (const t of tags) expect(t).toContain(TAP);
  });
  it('Follow this route: the boxes use the 44 px primary button, the counts rows get 44 px too', () => {
    expect(src.match(/<FollowButton primary|<FollowButton v-if="boxFollowable" primary/g)).toHaveLength(2);
    expect(src.match(/<FollowButton v-if="(?:rowFollowable\(r\)|r\.chain\.length)" class="min-h-\[44px\] sm:min-h-0"/g)).toHaveLength(2);
    expect(read('FollowButton.vue')).toContain("primary ? 'min-h-[44px] sm:min-h-0");
  });
  it('the pointer link (See it ↓) and Show more ascension counts', () => {
    expect(tagWith(read('auto/InstantPointer.vue'), 'data-testid="instant-pointer-link"')).toContain(TAP);
    expect(tagWith(src, 'data-testid="instant-more-counts"')).toContain(TAP);
  });
  it('How this is worked out and What if you had maxed gear? summary rows', () => {
    // A PanelFold since 25 Oct (lib/panelFold.ts `howWorkedOut`): its summary row is PanelFold's, 44 px below sm.
    expect(src).toMatch(/<PanelFold section="howWorkedOut"[^>]*testid="instant-how"/);
    expect(tagWith(read('auto/PanelFold.vue'), ':data-testid="`${id}-summary`"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(read('auto/MaxedWhatIf.vue'), 'data-testid="instant-maxed-what-if-summary"')).toContain(SUMMARY);
  });
  it('the ascensions From … to … boxes and "Include N"', () => {
    expect(tagWith(src, 'data-testid="instant-min-ascensions"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(src, 'data-testid="instant-max-ascensions"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(src, 'data-testid="instant-range-widen"')).toContain('min-h-[44px] sm:min-h-0');
  });
  it('Hide: the button is 44 px round the pill on a phone, centred where the pill was; the pill alone from sm up (26 Oct)', () => {
    const src = read('auto/CollapsibleSection.vue');
    const t = tagWith(src, ':data-testid="`hide-${id}`"');
    // 44 px tall, its top 22 px up: the pill's centre stays on the section's edge, as with -top-2.5 on a 20 px pill.
    expect(t).toContain('absolute -top-[22px] right-2 z-20 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2');
    expect(t).toContain('sm:-top-2.5 sm:right-4 sm:min-h-0 sm:min-w-0 sm:px-0');
    expect(src).toMatch(/<span\s+class="px-2 py-0\.5 rounded-full border border-slate-200 bg-white[^"]*"\s*>Hide<\/span/);
  });
  it('the "?" info icons (HelpTip): 14 px as before, with a 44 px invisible area round them on a phone (26 Oct)', () => {
    const t = tagWith(read('auto/HelpTip.vue'), 'aria-label="What does this mean?"');
    expect(t).toContain('w-3.5 h-3.5');
    expect(t).toContain("relative before:absolute before:-inset-[15px] before:content-[''] sm:before:hidden");
    expect(14 + 2 * 15).toBe(44);
  });
});

describe('the Stronger check and the run controls on a phone', () => {
  it("the result cards' buttons (Build or Simulate this plan, Share, CSV, Save)", () => {
    for (const c of [PRIMARY_BUTTON, SECONDARY_BUTTON]) expect(c).toContain('inline-flex items-center justify-center min-h-[44px] sm:min-h-0');
  });
  it('the acknowledge link, the send tick under Run, and the auto-send-every select', () => {
    expect(tagWith(read('auto/FindBar.vue'), 'data-testid="acknowledge-hint-link"')).toContain(TAP);
    expect(tagWith(read('auto/FindBar.vue'), 'data-testid="run-sends"')).toContain(TAP);
    expect(tagWith(read('auto/StepAwayOptions.vue'), 'data-testid="auto-send-every"')).toContain('min-h-[44px] sm:min-h-0');
  });
});

describe('Right now with no plan', () => {
  it('Work it out › (both lines) is 44 px tall', () => {
    const src = read('myruns/RightNowCard.vue');
    const tags = [...src.matchAll(/<button[^>]*data-testid="now-work-it-out"[^>]*>/g)].map(m => m[0]);
    expect(tags).toHaveLength(2);
    for (const t of tags) expect(t).toContain(TAP);
  });
});

/** Every opening tag that has `marker` in it (an attribute or a class run). */
function tagsWith(src: string, marker: string): string[] {
  const out: string[] = [];
  for (let at = src.indexOf(marker); at > -1; at = src.indexOf(marker, at + 1)) {
    const open = src.lastIndexOf('<', at);
    out.push(src.slice(open, src.indexOf('>', at) + 1));
  }
  return out;
}

describe('the UX review of 25 Oct 2026: the rest of the small targets', () => {
  it('Setup dock: − and + are 44 px squares on a phone, 24 px from sm up; Setup and Done are 44 px tall', () => {
    const src = read('auto/SetupDock.vue');
    // Their :disabled holds a "<" or ">", so each is taken from its "<button" to its label.
    const steps = src.split('<button').filter(b => /^[^]*?aria-label="(?:Fewer|More) workers"/.test(b.split('</button>')[0]));
    expect(steps).toHaveLength(2);
    for (const t of steps) expect(t).toContain('w-11 h-11 sm:w-6 sm:h-6');
    expect(tagWith(src, ':aria-expanded="ui.setupOpen"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(src, '@click="ui.setupOpen = false"')).toContain('min-h-[44px] sm:min-h-0');
  });
  it('the header chevron is 44 px tall on a phone (28 px from sm up)', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');
    expect(tagWith(app, ":aria-label=\"isHeaderCollapsed ? 'Open the top menu'")).toContain('h-11 sm:h-7');
  });
  it('the name pencil (in the shared PlayerIdForm) is 44 px square below sm, from this app’s stylesheet', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');
    const rule = css.slice(css.indexOf('@media (max-width: 639.98px)'));
    expect(rule).toContain('form:has(#playerId) button[aria-label="Edit name"]');
    expect(rule).toContain('min-width: 44px;');
    expect(rule).toContain('min-height: 44px;');
    const form = fs.readFileSync(path.resolve(__dirname, '../../../../ui/components/PlayerIdForm.vue'), 'utf8');
    expect(form).toContain('aria-label="Edit name"');
  });
  it('My runs: the links (Load a fresh one, Run Fast, Work it out again, See the routes, Work out my plan)', () => {
    expect(tagWith(read('myruns/SaveAgeStrip.vue'), 'data-testid="now-save-fresh"')).toContain(TAP);
    const tile = read('myruns/SavedTile.vue');
    expect(tagWith(tile, 'v-if="tile.sure.action && !runFastAbove"')).toContain(TAP);
    expect(tagWith(tile, "@click=\"emit('open', screenOpen)\"")).toContain(TAP);
    expect(tagWith(tile, "@click=\"emit('routes')\"")).toContain(TAP);
    const now = read('myruns/RightNowCard.vue');
    expect(tagWith(now, 'data-testid="now-behind-run-fast"')).toContain(TAP);
    expect(tagWith(now, 'data-testid="now-work-out-plan"')).toContain(TAP);
    expect(tagWith(now, 'data-testid="now-follow-typed-summary"')).toContain(SUMMARY);
    expect(tagWith(now, 'data-testid="now-timeline-summary"')).toContain(SUMMARY);
    // "A run of yours isn't here?" (ux review 26 Oct, row 12: was 264×15).
    expect(tagWith(read('auto/MyRunsMissing.vue'), 'data-testid="my-runs-missing-summary"')).toContain(SUMMARY);
  });
  it('My runs: Try next chips, the Showing buttons, the section summaries and the Your runs chips', () => {
    expect(tagWith(read('myruns/TryNext.vue'), ':data-testid="`now-try-${p.id}`"')).toContain('min-h-[44px] sm:min-h-0');
    const view = read('MyRunsView.vue');
    expect(tagWith(view, ':data-testid="`my-runs-show-${m.id}`"')).toContain('min-h-[44px] sm:min-h-0');
    expect(view).toContain(`const SUMMARY = '${SUMMARY} `);
    const bar = read('myruns/RunsExploreBar.vue');
    expect(bar).toContain("const CHIP = 'min-h-[44px] sm:min-h-[32px] ");
    expect(tagWith(bar, 'data-testid="runs-explore-summary"')).toContain('min-h-[44px]');
    expect(tagWith(bar, 'data-testid="runs-explore-clear"')).toContain('min-h-[44px]');
  });
  it('Setup: Load latest save, Reset to defaults, the days, the device profiles, Make them wait too, time off', () => {
    const src = read('auto/YourSetup.vue');
    expect(tagWith(src, 'data-testid="setup-load-latest"')).toContain('min-h-[44px] sm:min-h-0');
    // Load a save file: a button now, not a heading-looking label (ux review 26 Oct, row 19).
    expect(tagWith(read('auto/SaveFileBar.vue'), 'data-testid="save-file-load"')).toContain('min-h-[44px] sm:min-h-0');
    const resets = tagsWith(src, 'data-testid="setup-reset"');
    expect(resets).toHaveLength(2);
    for (const t of resets) expect(t).toContain(TAP);
    expect(tagWith(src, 'data-testid="setup-day"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(src, 'data-testid="setup-profile"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(src, '@click="store.deferShifts = true"')).toContain(TAP);
    const off = read('auto/TimeOffEditor.vue');
    expect(tagWith(off, ':data-testid="`${kind}-add`"')).toContain('min-h-[44px] sm:min-h-0');
    expect(tagWith(off, 'data-testid="time-off-remove"')).toContain('min-h-[44px] sm:min-h-0');
  });
  it('the leaderboard view chips', () => {
    expect(tagWith(read('auto/LeaderboardPanel.vue'), 'data-testid="board-view-tab"')).toContain('min-h-[44px] sm:min-h-0');
  });
});

describe('nothing floating covers the end of the page on a phone', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');
  const rem = 16;
  it('the Setup pill (1rem up, 44 px buttons in a py-1.5 pill) sits inside the room left under the page', () => {
    const dock = read('auto/SetupDock.vue');
    expect(dock).toContain("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)'");
    expect(tagWith(dock, 'class="flex items-center gap-1 rounded-full bg-indigo-600')).toContain('py-1.5');
    const pillTop = 1 * rem + 44 + 2 * 6; // from the bottom of the screen, on a phone
    const room = Number(app.match(/SETUP_DOCK_CLEARANCE = 'calc\(env\(safe-area-inset-bottom, 0px\) \+ (\d+)rem\)'/)![1]) * rem;
    expect(room).toBeGreaterThanOrEqual(pillTop + 16);
  });
  it('Manual: the notes and stats bubbles (7rem up below md, about 70 px tall) sit inside the 12rem under the page', () => {
    for (const f of ['FloatingNotes.vue', 'FloatingStats.vue']) expect(read(f)).toContain('bottom-28 md:bottom-auto md:top-20');
    expect(app).toContain("? 'pb-48 md:pb-8'");
    expect(app).toContain(": 'pb-48 md:pb-24'");
    const bubbleTop = 7 * rem + 6 + 16 + 4 + 36 + 6; // bottom-28, p-1.5, chevron, mb-1, 36 px icon, p-1.5
    expect(48 * 4).toBeGreaterThanOrEqual(bubbleTop + 8);
  });
});
