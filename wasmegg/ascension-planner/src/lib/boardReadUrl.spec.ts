/**
 * VITE_BOARD_SUBMIT_URL also names where the board is READ (spec-betaboard, Jordan, 16 Nov 2026): egg-beta sent runs to
 * the test collector but read /all, /mine and /flagged from the live one, so its runs never showed on the board Jordan
 * saw. With the setting, the Leaderboard, My Runs, the flagged board, hide-from-public, the rechecks and the Explorer
 * read the same collector the sends go to; follow, prefs, answers, sync, calendar and the beacon stay on VITE_SUBMIT_URL.
 * Unset, nothing changes.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardReadBaseOf, TEST_BOARD_LABEL } from './boardSubmitUrl';
import { resolveCollectorBase, watchCollectorBase } from '@/explorer/collector';

const LIVE = 'https://live-collector.test/submit';
const BOARD = 'https://board-collector.test';
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
afterEach(() => vi.unstubAllEnvs());

describe('the board read base', () => {
  it('is the board collector without /submit when the build has one, else the submit URL without /submit', () => {
    expect(boardReadBaseOf(BOARD, LIVE)).toBe(BOARD);
    expect(boardReadBaseOf(`${BOARD}/submit`, LIVE)).toBe(BOARD);
    expect(boardReadBaseOf(` ${BOARD}/ `, LIVE)).toBe(BOARD);
    expect(boardReadBaseOf('', LIVE)).toBe('https://live-collector.test');
    expect(boardReadBaseOf(undefined, LIVE)).toBe('https://live-collector.test');
    expect(boardReadBaseOf(undefined, '')).toBe('');
  });
  it('the label is the words Test board', () => {
    expect(TEST_BOARD_LABEL).toBe('Test board');
  });
});

describe('the Explorer reads the board collector too', () => {
  it('resolveCollectorBase: the board setting wins over VITE_SUBMIT_URL; ?collector= still wins over both', () => {
    vi.stubEnv('VITE_SUBMIT_URL', LIVE);
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', BOARD);
    expect(resolveCollectorBase('')).toBe(BOARD);
    expect(resolveCollectorBase('?collector=https://c.example.dev')).toBe('https://c.example.dev');
  });
  it('unset: the live collector, as before', () => {
    vi.stubEnv('VITE_SUBMIT_URL', LIVE);
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', '');
    expect(resolveCollectorBase('')).toBe('https://live-collector.test');
  });
});

describe('where the store reads', () => {
  it('Leaderboard, My Runs and the rechecks take their base from the send URL; nothing else of the board still reads submitUrl', () => {
    const s = src('../stores/chainSearch.ts');
    expect(s).toMatch(/const leaderboardUrl = computed\(\(\) => sendUrl\.replace\(/);
    expect(s).toContain("fetchMineRows(sendUrl.replace(/\\/submit\\/?$/, ''), token)");
    const recheck = s.slice(s.indexOf('async function fetchRecheckPlans'), s.indexOf('async function fetchRecheckPlans') + 200);
    expect(recheck).toContain('const base = sendUrl.replace(');
    // Follow, prefs, answers, sync, the watch link and the beacon keep the plain submit URL.
    expect(s).toContain("collector: () => submitUrl.replace(/\\/submit\\/?$/, '')");
    expect(s).toContain('runBeaconRunStarted(submitUrl)');
  });
  it('the Explorer\'s early /all fetch is for the board collector too', () => {
    expect(src('../../vite.config.ts')).toContain('collectorEarlyStart(env.VITE_BOARD_SUBMIT_URL || env.VITE_SUBMIT_URL)');
  });
});

describe('the Test board label', () => {
  it('sits on the Leaderboard panel and on My Runs\' board part, shown only with the board setting', () => {
    const label = src('../components/auto/TestBoardLabel.vue');
    expect(label).toContain('boardSendSeparate');
    expect(label).toContain('TEST_BOARD_LABEL');
    expect(label).toContain('data-testid="test-board-label"');
    expect(src('../components/auto/LeaderboardPanel.vue')).toContain('<TestBoardLabel');
    expect(src('../components/MyRunsView.vue')).toContain('<TestBoardLabel');
  });
});

describe('code review round 2, C6.3: the phone watch page reads the collector the run reports to', () => {
  it('watchCollectorBase is the submit collector (never the board one) unless ?collector= names another', () => {
    vi.stubEnv('VITE_SUBMIT_URL', LIVE);
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', BOARD);
    expect(watchCollectorBase('')).toBe('https://live-collector.test');
    expect(watchCollectorBase('?x=1')).toBe('https://live-collector.test');
    expect(watchCollectorBase('?collector=https://c.example.dev')).toBe('https://c.example.dev');
    expect(watchCollectorBase('?collector=javascript:alert(1)')).toBeNull();
    // The Explorer keeps its board preference.
    expect(resolveCollectorBase('')).toBe(BOARD);
  });
  it('without a submit URL there is no watch collector, board URL or not', () => {
    vi.stubEnv('VITE_SUBMIT_URL', '');
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', BOARD);
    expect(watchCollectorBase('')).toBeNull();
  });
  it('phone.ts uses it and no longer imports resolveCollectorBase', () => {
    const phone = src('../watch/phone.ts');
    expect(phone).toContain('watchCollectorBase(location.search)');
    expect(phone).not.toContain('resolveCollectorBase');
  });
});
