/**
 * A result already on the Leaderboard is said so ON LOAD, with no Send button (Jordan, 27 Oct 2026): By a
 * date's share box offered "Send 313 TE by this date" for a run already there, and only the press said
 * "Already on the Leaderboard (sent at 10:48 AM), nothing new stored". The account's own rows (GET /mine,
 * stores/chainSearch.ts `mineRows`) are compared with what the send would carry (search/sentOnBoard.ts).
 * With no rows read (offline, no collector, no code for the account) every surface is as it was.
 *
 * The clock is fixed (Date only) at local noon, and the rows' sent times are set from it, so the line reads
 * "sent at" for a row from earlier today and "sent on" for one from an earlier day whatever the real date
 * (the spec failed once the real clock passed midnight after a fixture sent "today"). A row from an earlier
 * day is still on the board: the line shows either way.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { createShareIdentity, useByDateShare } from '@/composables/useShareResult';
import { useChainSearchStore } from '@/stores/chainSearch';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { Submission } from '@/search/submission';
import type { DeadlineRoute } from '@/search/deadline';
import BoardSubmitButtons from './BoardSubmitButtons.vue';
import UnsentResults from './UnsentResults.vue';

const payload = {
  schema: 8,
  chain: [250, 280, 313],
  finalTE: 313,
  durationDays: 12.34567,
  startLocal: '2026-10-27 08:00',
  timezone: 'America/Chicago',
  artifacts: ['T4L Gusset'],
  currentTE: 240,
  window: '07:00-23:00',
  holdShifts: false,
  firstAscension: 'auto',
  timeOff: [],
  effort: 'deadline',
  chainsPriced: 1234,
  level: 'exhaustive',
  deadline: 1_793_000_000,
} as unknown as Submission;
/** Local noon, in whatever zone the run is in. */
const NOW = new Date(2026, 9, 28, 12, 0).getTime();
const HOUR = 3_600_000;
function rowSent(msAgo: number): BoardRow {
  const receivedAt = new Date(NOW - msAgo).toISOString();
  return { ...(payload as unknown as BoardRow), id: 'row1', receivedAt, yours: true } as BoardRow;
}
/** 10:00 am today, 10:00 am yesterday (Oct 27), five days before (Oct 23). */
const sentToday = rowSent(2 * HOUR);
const sentYesterday = rowSent(26 * HOUR);
const sentDaysAgo = rowSent(5 * 24 * HOUR + 2 * HOUR);
const sentCases = [
  ['earlier today', sentToday, /\(sent at .+\)/],
  ['yesterday', sentYesterday, /\(sent on Oct 27 at .+\)/],
  ['days ago', sentDaysAgo, /\(sent on Oct 23 at .+\)/],
] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  // The header's names (lib/stores/eids.ts) are read from localStorage, which node lacks.
  vi.stubGlobal('localStorage', {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("By a date's Share this result", () => {
  function share(rows: BoardRow[] | null, sentRow: BoardRow = sentToday) {
    const loads: number[] = [];
    const store = {
      leaderboardUrl: 'https://collector.example/',
      mineRows: rows,
      loadMineRows: async () => void loads.push(1),
      deadlineOnBoard: (route: DeadlineRoute) => (rows && route.chain.join() === '250,280,313' ? sentRow : null),
    };
    const result = ref({ deadline: 1_793_000_000, at: 1 });
    const best = ref({ chain: [250, 280, 313] } as unknown as DeadlineRoute);
    const s = useByDateShare(
      store as never,
      createShareIdentity(computed(() => '')),
      result,
      best
    );
    return { s, loads };
  }
  it.each(sentCases)('a result whose row is already on the board (sent %s): the line, before any press', (_, row, when) => {
    const { s, loads } = share([row], row);
    expect(s.onBoardLine.value).toMatch(/^Already on the Leaderboard \(sent .+\)$/);
    expect(s.onBoardLine.value).toMatch(when);
    expect(s.shareMessage.value).toBe('');
    // The rows are asked for as the result shows (once per account: the store keeps them).
    expect(loads.length).toBeGreaterThan(0);
  });
  it('rows not read (offline, no collector): no line, Send as today', () => {
    expect(share(null).s.onBoardLine.value).toBe('');
  });
  it('the panel shows the line in place of the share box, so there is no Send button', () => {
    const src = fs.readFileSync('src/components/auto/DeadlinePanel.vue', 'utf8');
    const line = src.indexOf('v-else-if="best && collectorConfigured && onBoardLine"');
    expect(line).toBeGreaterThan(0);
    // Before the box (the box is the v-else-if after it), and its words are the line itself.
    expect(line).toBeLessThan(src.indexOf('<ShareResult'));
    expect(src).toMatch(/data-testid="share-on-board"[^>]*>\s*\{\{ onBoardLine \}\}/);
    expect(src).toMatch(/onBoardLine,?\s/);
  });
});

describe('Fastest: Share this result', () => {
  const base = {
    optIn: true,
    submitUrl: 'https://collector.example/submit',
    nameToClaim: '',
    claiming: false,
    sending: false,
    alreadySubmitted: false,
    message: '',
    ok: true,
    partial: false,
    pendingTable: false,
    retrying: false,
    preview: () => '',
  };
  it('a result already on the board: the line and no Submit button', async () => {
    const line = 'Already on the Leaderboard (sent at 10:48 AM)';
    const html = await renderHtml(BoardSubmitButtons, { ...base, onBoardLine: line });
    expect(textOf(html)).toContain(line);
    expect(textOf(html)).not.toContain('Submit result');
    expect(textOf(html)).not.toContain('On the board');
  });
  it('otherwise Submit result as before', async () => {
    const html = await renderHtml(BoardSubmitButtons, base);
    expect(textOf(html)).toContain('Submit result');
  });
  it('both depths pass the store’s row found on load', () => {
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue'])
      expect(fs.readFileSync(`src/components/auto/${f}`, 'utf8')).toContain(':on-board-line="fastestOnBoardLine"');
  });
});

describe("My runs' Send it now", () => {
  it.each(sentCases)('a kept result already on the board (sent %s): the line, no Send it now', async (_, row, when) => {
    const p = createPinia();
    setActivePinia(p);
    const store = useChainSearchStore();
    store.pendingSends = [
      { id: 'k1', kind: 'deadline', key: 'deadline:1', label: '313 TE by Oct 30, 2026', createdAt: Date.now(), payload, consent: null },
    ];
    store.mineRows = [row];
    const html = await renderHtml(UnsentResults, { playerId: 'EI1234567890123456' }, {}, [p]);
    const text = textOf(html);
    expect(text).toMatch(/Already on the Leaderboard \(sent .+\)/);
    expect(text).toMatch(when);
    expect(text).not.toContain('Send it now');
    expect(text).not.toContain("This result wasn't sent");
  });
  it('not on the board (or no rows read): Send it now as before', async () => {
    const p = createPinia();
    setActivePinia(p);
    const store = useChainSearchStore();
    store.pendingSends = [
      { id: 'k1', kind: 'deadline', key: 'deadline:1', label: '313 TE by Oct 30, 2026', createdAt: Date.now(), payload, consent: null },
    ];
    const html = await renderHtml(UnsentResults, { playerId: 'EI1234567890123456' }, {}, [p]);
    expect(textOf(html)).toContain('Send it now');
  });
});
