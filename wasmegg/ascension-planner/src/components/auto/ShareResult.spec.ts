import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import ShareResult from './ShareResult.vue';
import ShareStatus from './ShareStatus.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const nameBox = (html: string) => html.match(/<input[^>]*aria-label="Nickname"[^>]*>/)?.[0] ?? '';
const isDisabled = (tag: string) => /\sdisabled(\s|>|=)/.test(tag);

const base = { optIn: false, anonymous: true, nickname: 'Fliris' };

describe('ShareResult', () => {
  it('shows the heading, the screen intro and its consent wording, and nothing else until ticked', async () => {
    const html = await renderHtml(ShareResult, base, {
      intro: () => h('p', "Sends the best route above to Compare's Egg Day 2027 tab"),
      consent: () => h('span', 'Yes, share this result. This sends the route, its dates and the deadline'),
      opted: () => h('button', 'Send 377 TE by this date'),
    });
    const t = textOf(html);
    expect(t).toContain('Share this result');
    expect(t).toContain("Sends the best route above to Compare's Egg Day 2027 tab");
    expect(t).toContain('This sends the route, its dates and the deadline');
    expect(t).not.toContain('Submit anonymously');
    expect(t).not.toContain('Send my CSV too');
    expect(t).not.toContain('Send 377 TE');
    expect(html).not.toMatch(/data-testid="share-consent"[^>]*checked/);
  });

  it('once ticked: anonymous or named, the CSV and diagnostics boxes, then the screen extras', async () => {
    const html = await renderHtml(
      ShareResult,
      { ...base, optIn: true, anonymous: false, csvDetail: '(12 chains, one row per leg)', nicknameMax: 33 },
      { opted: () => h('button', 'Send 377 TE by this date'), default: () => h('span', 'BUTTONS') }
    );
    const t = textOf(html);
    expect(t).toMatch(
      /Submit anonymously.*Credit me as.*Send my CSV too.*\(12 chains, one row per leg\).*Also send diagnostics.*Send 377 TE by this date.*BUTTONS/
    );
    expect(html).toContain('maxlength="33"');
    expect(html).toContain('value="Fliris"');
    // Named: the box is enabled.
    expect(isDisabled(nameBox(html))).toBe(false);
  });

  it('greys the name box out when anonymous', async () => {
    const html = await renderHtml(ShareResult, { ...base, optIn: true });
    expect(isDisabled(nameBox(html))).toBe(true);
  });

  it('has a default consent line and takes a heading', async () => {
    const t = textOf(await renderHtml(ShareResult, { ...base, heading: 'Share this answer' }));
    expect(t).toContain('Share this answer');
    expect(t).toContain('I acknowledge the following: I want to share this result on the leaderboard.');
  });

  it("words the acknowledgement as Find and submit's, varying only the target or deadline", async () => {
    const target = textOf(await renderHtml(ShareResult, base));
    const deadline = textOf(await renderHtml(ShareResult, { ...base, goalWord: 'deadline' }));
    for (const t of [target, deadline]) {
      expect(t).toContain('I acknowledge the following');
      expect(t).toContain('not my player ID, and never shown');
      expect(t).toContain('plus my CSV if ticked below');
      expect(t).toContain('private diagnostics (never shown)');
    }
    expect(target).toContain('its dates and the target,');
    expect(target).toContain('my best three plans already on the board');
    expect(deadline).toContain('its dates and the deadline,');
    expect(deadline).not.toContain('best three');
    expect(deadline).not.toContain('Yes, share');
  });
});

describe('ShareStatus', () => {
  it('colours thanks green, a refusal red and "Sent, but" amber', async () => {
    expect(await renderHtml(ShareStatus, { message: 'Thanks! On the board.', ok: true })).toContain('text-emerald-700');
    expect(await renderHtml(ShareStatus, { message: 'Not sent: offline', ok: false })).toContain('text-rose-700');
    expect(
      await renderHtml(ShareStatus, { message: 'Sent, but the table did not', ok: true, partial: true })
    ).toContain('text-amber-700');
  });

  it('shows nothing without a message, and Retry the table while the table is pending', async () => {
    expect(textOf(await renderHtml(ShareStatus, { message: '', ok: true }))).toBe('');
    expect(textOf(await renderHtml(ShareStatus, { message: '', ok: true, pendingTable: true }))).toBe(
      'Retry the table'
    );
    expect(textOf(await renderHtml(ShareStatus, { message: '', ok: true, pendingTable: true, retrying: true }))).toBe(
      'Sending the table...'
    );
  });

  it('is a span inside a row of buttons when asked', async () => {
    expect(await renderHtml(ShareStatus, { message: 'x', ok: true, tag: 'span' })).toMatch(/^(<!--\[-->)?<span/);
  });
});
