import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import RoutesToTry from './RoutesToTry.vue';
import { h } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';

// Source-level checks (no DOM env) that the instant-answer follow is wired where the behaviour lives:
// the rule itself is lib/limitsFollow.spec.ts, the store's follow chainSearch.limitsFollow.spec.ts.
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const panel = read('./ChainSearchPanel.vue');
const insane = read('./InsanePanel.vue');
const byDate = read('./DeadlinePanel.vue');
const store = read('../../stores/chainSearch.ts');

describe('Fastest, Nearby routes: the Limits box', () => {
  it('each input marks its own field set by hand', () => {
    expect(panel).toMatch(
      /v-model\.number="store\.minPrestiges"[\s\S]{0,400}@input="store\.markLimitTouched\('min'\)"/
    );
    expect(panel).toMatch(
      /v-model\.number="store\.maxPrestiges"[\s\S]{0,400}@input="store\.markLimitTouched\('max'\)"/
    );
  });
  it('shows the grey hint while they follow', () => {
    expect(panel).toContain('data-testid="limits-follow-hint"');
    expect(panel).toContain('limitsHint(store.limitsFollowing)');
    expect(panel).toMatch(
      /limits-follow-hint"[^>]*>|class="[^"]*text-slate-400[^"]*" data-testid="limits-follow-hint"/
    );
  });
  it('the longer-route hint sets them on purpose (no plain writes left)', () => {
    expect(panel).toContain('store.setLimits(plan.minPrestiges, plan.maxPrestiges)');
    expect(panel).not.toMatch(/store\.(min|max)Prestiges = /);
  });
  it('the store follows suggestedCount only while idle, and a carry-on puts its run’s limits back', () => {
    expect(store).toMatch(/watch\(\s*\[suggestedCount, busy, limitsTouched\]/);
    expect(store).toContain('followLimits(now, suggestedCount.value, limitsTouched.value, !busy.value)');
    expect(store).toContain('limits: searchSpace.value ? null : { min: runLimits.min, max: runLimits.max }');
    expect(store).toMatch(
      /const kept = checkpointLimits\(resumeFrom\);\s*if \(kept\) setLimits\(kept\.min, kept\.max\);/
    );
  });
  it('the carry-on box says when it will search under its own limits', () => {
    expect(panel).toContain('resumableLimitsNote');
    expect(panel).toContain('carryOnLimitsNote(checkpointLimits(r)');
  });
});

describe('Exhaustive on Fastest: chain 1 follows the instant answer’s count until set', () => {
  it('the Ascensions box typed in stops the default from following', () => {
    expect(insane).toContain('@input="markAscTouched"');
    expect(insane).toMatch(/if \(kept\.ascTouched\.value\) return;/);
    expect(insane).toContain('store.suggestedCount ?? 6');
  });
  it('the hint beside Ascensions', () => {
    expect(insane).toMatch(/v-if="chain1FromInstant"[^>]*data-testid="asc-follow-hint"\s*>\(from the instant answer\)/);
  });
});

describe('By a date, Exhaustive: box 1 follows the best By a date route’s count', () => {
  it('from stronger.instant.date, only while idle, not for a request', () => {
    expect(byDate).toContain('stronger.instant.date?.chain.length');
    expect(byDate).toMatch(
      /if \(!ascFollows\.value \|\| linked\.value \|\| store\.deadlineRunning \|\| store\.preparing\) return;/
    );
    expect(byDate).toMatch(
      /watch\(\[followCount, \(\) => store\.deadlineRunning, \(\) => store\.preparing\], followDateBest/
    );
  });
  it("with no instant answer, follows the count of an answer it can centre on (the quick scan's)", () => {
    expect(byDate).toContain('const followCount = computed(() => dateBestCount.value ?? answerBestCount.value);');
    expect(byDate).toContain('canCentreOn({ answer, deadline: deadline.value, currentTE: store.currentTE })');
    expect(byDate).toContain('const n = boxCountFromBest(followCount.value);');
  });
  it('every path that sets the boxes on purpose stops it', () => {
    for (const fn of [
      'function typedRow',
      'function addChain',
      'function applyRequest',
      'function openInAdvanced',
      'function checkByDate',
      'function setRowAsc',
      'function removeRow',
      'function fillFromSpec',
    ]) {
      const at = byDate.indexOf(fn);
      expect(at, fn).toBeGreaterThan(0);
      expect(byDate.slice(at, at + 900), fn).toContain('ascFollows.value = false');
    }
    expect(byDate).toContain('@asc="setRowAsc"');
    expect(byDate).toContain('@remove="removeRow"');
  });
  it('the hint sits beside Box 1’s Ascensions (RoutesToTry slot)', () => {
    expect(byDate).toMatch(
      /#asc-after="\{ k \}"[\s\S]{0,200}k === 0 && boxFromInstant[\s\S]{0,200}\(from the instant answer\)/
    );
  });
  it('RoutesToTry renders the asc-after slot right after the Ascensions box', async () => {
    const html = await renderHtml(
      RoutesToTry,
      {
        rows: [{ asc: 6, text: '' }],
        sliders: [{ widthIx: 3, stepIx: 1, halfWidth: 10, step: 2 }],
        problems: [''],
        summaries: ['x'],
        disabled: false,
        currentTE: 305,
        finalTE: 490,
        maxAsc: 8,
        minRows: 1,
        placeholder: '',
        sliderLead: 'Suggest a space tries',
      },
      { 'asc-after': ({ k }: { k: number }) => (k === 0 ? h('span', '(from the instant answer)') : null) }
    );
    expect(textOf(html)).toMatch(/Box 1 Ascensions \(from the instant answer\) Suggest a space/);
  });
});
