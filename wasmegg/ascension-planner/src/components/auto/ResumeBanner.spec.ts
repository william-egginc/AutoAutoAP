/**
 * RESUME BANNER (ux29-d item 9, 27 Oct 2026): after a reload mid-run, the offer to carry on shows as a slim sticky
 * banner at the top of the Auto Planner too, not only in the panel below. One source: each panel's CarryOnOffer
 * puts its offer in lib/resumeBanner.ts while it is shown, and the banner's Resume calls that offer's own Carry on
 * (the panel's handler). Dismiss hides the banner for that run only; the box below stays.
 */
import fs from 'node:fs';
import path from 'node:path';
import { effectScope, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResumeBanner from './ResumeBanner.vue';
import { bindResumeOffer, currentResumeOffer, dismissResumeOffer, resetResumeBanner } from '@/lib/resumeBanner';
import { renderHtml, textOf } from '@/test/renderComponent';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

afterEach(() => resetResumeBanner());

describe('one source: the panel offer', () => {
  it('is offered while the panel shows its Carry on, with the panel handler; gone when running or none', async () => {
    const carryOn = vi.fn();
    const shown = ref(true);
    const scope = effectScope();
    scope.run(() => bindResumeOffer(() => (shown.value ? { key: 'by-date:1', disabled: false } : null), carryOn));
    expect(currentResumeOffer.value?.key).toBe('by-date:1');
    currentResumeOffer.value!.resume();
    expect(carryOn).toHaveBeenCalledTimes(1);
    // The run starts (the panel hides its box): no offer.
    shown.value = false;
    await nextTick();
    expect(currentResumeOffer.value).toBeNull();
    shown.value = true;
    await nextTick();
    expect(currentResumeOffer.value?.key).toBe('by-date:1');
    // The panel goes away (another screen): no offer.
    scope.stop();
    expect(currentResumeOffer.value).toBeNull();
  });

  it('Dismiss hides it for that run only', async () => {
    const scope = effectScope();
    const key = ref('smart:1');
    scope.run(() => bindResumeOffer(() => ({ key: key.value, disabled: false }), () => {}));
    dismissResumeOffer('smart:1');
    expect(currentResumeOffer.value).toBeNull();
    key.value = 'smart:2'; // a later stop of another run
    await nextTick();
    expect(currentResumeOffer.value?.key).toBe('smart:2');
    scope.stop();
  });
});

describe('the banner', () => {
  it('renders Resume and Dismiss (44 px) when a run is unfinished, nothing otherwise', async () => {
    expect(textOf(await renderHtml(ResumeBanner, {}))).toBe('');
    const scope = effectScope();
    scope.run(() => bindResumeOffer(() => ({ key: 'full:1', disabled: false }), () => {}));
    const html = await renderHtml(ResumeBanner, {});
    expect(textOf(html)).toBe('Your last run stopped. Resume Dismiss');
    expect(html).toContain('data-testid="resume-banner"');
    expect(html.match(/min-h-\[44px\]/g)?.length).toBe(2);
    expect(html).toMatch(/class="sticky /);
    scope.stop();
  });

  it('every search screen offers through CarryOnOffer, whose Resume is its own Carry on; App mounts the banner on the Auto Planner', () => {
    const offer = read('CarryOnOffer.vue');
    expect(offer).toMatch(/useResumeOffer\(/);
    expect(offer).toMatch(/\(\) => emit\('carry-on'\)/);
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue', 'DeadlinePanel.vue']) expect(read(f)).toMatch(/<CarryOnOffer[\s\S]*?:run-key=/);
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.vue'), 'utf8');
    expect(app).toMatch(/<ResumeBanner\s+v-if="plannerTab === 'automatic' && !showRunBar && !myRunsRunning"/);
  });
});
