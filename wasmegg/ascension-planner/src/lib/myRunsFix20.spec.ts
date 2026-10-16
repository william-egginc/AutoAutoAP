/**
 * Fix 20: the main account's runs sent from the PC weren't "looks like yours" on beta (My runs listed 2 runs, and
 * the Fastest tile led with a 26-day-old Exhaustive). The board (GET /all, read 15 Oct) holds them as Egg Day
 * answers NAMED with the PC browser's owner code (`acct`), the same timezone and gear as the save, from TE 191 and
 * the very save loaded here. Made-up fixtures for each cause:
 *
 *   TE        the look-alike TE was the restored Manual draft's (159), not the save's: a 191 row was "above your
 *             save" (both rows listed then started from 159). Fixed in the page (saveTEOf); here, the rule itself.
 *   name      only `nickname || username` counted: a header nickname hid the in-game name the PC sends under.
 *   timezone  an anonymous row from a browser in another timezone (exact key only, kept out) vs one under your name.
 *   gear      a row whose gear differs by one item (a save a step newer): kept out anonymous, in under your name.
 *   credit    a row under another "Credit me as" name: kept out, and the answer says to use one name.
 */
import { describe, expect, it } from 'vitest';
import { isMyRun, missReasons, nameKeys, nearKey, whyNotMine, type LookAlike } from './myRuns';
import { accountKeyOf, type BoardRow } from './leaderboardRank';
import { saveTEOf } from './saveFreshness';
import { buildTile, sourceWords, type SavedDateAnswer } from './savedTiles';
import { renderHtml, textOf } from '@/test/renderComponent';
import SavedTile from '@/components/myruns/SavedTile.vue';

const ZONE = 'America/Denver';
const GEAR = ['T4E Compass', 'T4L Necklace', 'T4L Gusset', 'T4L Totem', 'T4L Cube', 'T4L Metronome', 'T4L Chalice', 'T4L Ankh'];
const GEAR_ONE_UP = GEAR.map(g => (g === 'T4E Compass' ? 'T4L Compass' : g));
const GEAR_TWO_UP = GEAR_ONE_UP.map(g => (g === 'T4L Necklace' ? 'T4E Necklace' : g));
const KEY = accountKeyOf({ timezone: ZONE, artifacts: GEAR });
const EGG_DAY = 1_815_580_800;
/** The loaded save: Oct 15, 2:40 pm Denver. */
const SAVE_AT = Date.parse('2026-10-15T20:40:00Z') / 1000;
const NOW_MS = Date.parse('2026-10-16T03:00:00Z');

/** An Egg Day answer from the PC (Edge), sent today with its own code under the account's in-game name. */
function pc(te: number, over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: `pc${te}aaaaaaaa`,
    nickname: 'MainName',
    acct: 'pc0000000002',
    chain: [205, 248, te],
    finalTE: te,
    durationDays: 200,
    deadline: EGG_DAY,
    deadlineAscendAt: EGG_DAY - 40 * 3600,
    startUtc: '2026-10-15T22:40:00.000Z',
    backupAgeHours: 2,
    timezone: ZONE,
    artifacts: GEAR,
    currentTE: 191,
    backupTE: 191,
    receivedAt: '2026-10-16T02:42:10.000Z',
    level: 'exhaustive',
    effort: 'deadline',
    ...over,
  };
}
/** This browser's view: the save's key, the header's nickname ("Main") and the save's in-game name. */
const look = (o: Partial<LookAlike> = {}): LookAlike => ({
  keys: new Set([KEY]),
  names: nameKeys(['Main', 'MainName']),
  viewerTE: 191,
  ...o,
});
const mine = (r: BoardRow, l: LookAlike) => isMyRun(r, l.keys, l.viewerTE, l.names);

describe('the main account’s PC runs', () => {
  const rows = [pc(275, { chain: [275] }), pc(300, { chain: [225, 300] }), pc(307), pc(309, { chain: [199, 221, 270, 309] })];

  it('were out on the draft’s TE (159) and with only the header nickname as a name', () => {
    // Before: viewerTE from the restored Manual draft, names = [nickname || username] = ['Main'].
    const before = look({ viewerTE: 159, names: nameKeys(['Main']) });
    for (const r of rows) {
      expect(mine(r, before)).toBe(false);
      expect(missReasons(r, before)).toEqual(['other-code', 'te']);
    }
  });

  it('are in with the save’s own TE and every name the account goes by', () => {
    for (const r of rows) expect(mine(r, look())).toBe(true);
    // Either fix alone is not enough.
    expect(mine(rows[0], look({ viewerTE: 159 }))).toBe(false);
    expect(mine(rows[0], look({ names: nameKeys(['Main']) }))).toBe(false);
  });

  it('the save’s own TE: per egg the claimed TE or the thresholds passed, capped at 98 (as a sent row’s backupTE)', () => {
    expect(saveTEOf({ virtue: { eovEarned: [40, 40, 40, 40, 31], eggsDelivered: [0, 0, 0, 0, 0] } })).toBe(191);
    expect(saveTEOf({ virtue: { eovEarned: [98, 99, 0, 0, 0], eggsDelivered: [] } })).toBe(196);
    expect(saveTEOf(null)).toBe(0);
    // The restored draft's redacted rawBackup carries no virtue part: no TE, so no TE rule.
    expect(saveTEOf({ game: { permitLevel: 1 } })).toBe(0);
  });
});

describe('each cause, with its "A run of yours isn’t here?" answer', () => {
  const ctx = { ...look(), saveKey: KEY, hasCode: true };
  const why = (r: BoardRow) => whyNotMine(r, ctx).join(' ');

  it('an anonymous row from another browser, same gear, ANOTHER timezone: out (gear alone says little)', () => {
    const r = pc(300, { nickname: undefined, acct: undefined, timezone: 'America/Chicago' });
    expect(mine(r, look())).toBe(false);
    expect(missReasons(r, look())).toEqual(['key']);
    expect(why(r)).toContain('sent with the timezone America/Chicago; your planner is set to America/Denver.');
    expect(why(r)).toContain('A run sent under your name counts with one difference');
  });

  it('the same row under your name: in (the timezone is the one difference)', () => {
    expect(mine(pc(300, { timezone: 'America/Chicago' }), look())).toBe(true);
    expect(mine(pc(300, { acct: undefined, timezone: 'America/Chicago' }), look())).toBe(true);
  });

  it('a named row under another "Credit me as" name: out, and the answer says to use one name', () => {
    const r = pc(300, { nickname: 'PC Credit' });
    expect(mine(r, look())).toBe(false);
    expect(missReasons(r, look())).toEqual(['other-code']);
    expect(why(r)).toContain('as “PC Credit” from another browser or site');
    expect(why(r)).toContain('set the same “Credit me as” name in both browsers');
  });

  it('an anonymous row whose gear differs by ONE item: out; under your name: in; two items or item and zone: out', () => {
    const anon = pc(300, { nickname: undefined, acct: undefined, artifacts: GEAR_ONE_UP });
    expect(mine(anon, look())).toBe(false);
    expect(why(anon)).toContain('it has T4L Compass; your save has T4E Compass');
    expect(why(anon)).toContain('A run sent under your name counts with one difference');
    expect(mine(pc(300, { artifacts: GEAR_ONE_UP }), look())).toBe(true);
    expect(mine(pc(300, { artifacts: GEAR_TWO_UP }), look())).toBe(false);
    expect(mine(pc(300, { artifacts: GEAR_ONE_UP, timezone: 'Europe/London' }), look())).toBe(false);
  });

  it('a row from a TE above the save’s: out, and the answer says to load a fresh save', () => {
    const r = pc(300, { backupTE: 195, currentTE: 195 });
    expect(mine(r, look())).toBe(false);
    expect(why(r)).toContain('above your save’s 191');
    expect(why(r)).toContain('load a fresh save');
  });

  it('someone else’s anonymous row with your exact timezone and gear is still a "maybe" (as before)', () => {
    expect(mine(pc(300, { nickname: undefined, acct: undefined }), look())).toBe(true);
  });
});

describe('nearKey', () => {
  const k = (zone: string, gear: string[]) => accountKeyOf({ timezone: zone, artifacts: gear });
  it('one step: the timezone, or one gear item; not both, not two items, not empty gear', () => {
    expect(nearKey(KEY, KEY)).toBe(true);
    expect(nearKey(k('Europe/London', GEAR), KEY)).toBe(true);
    expect(nearKey(k(ZONE, GEAR_ONE_UP), KEY)).toBe(true);
    expect(nearKey(k(ZONE, [...GEAR, 'T4L Feather']), KEY)).toBe(true);
    expect(nearKey(k(ZONE, GEAR_TWO_UP), KEY)).toBe(false);
    expect(nearKey(k('Europe/London', GEAR_ONE_UP), KEY)).toBe(false);
    expect(nearKey(k(ZONE, []), k(ZONE, ['T4L Ankh']))).toBe(false);
  });
});

describe('the Egg Day and Fastest tiles prefer the newest answer for the loaded save', () => {
  /** A By a date answer saved on this device 26 days ago, from an older save. */
  const old: SavedDateAnswer = {
    savedAt: Date.parse('2026-09-19T06:28:00Z'),
    deadline: EGG_DAY,
    te: 159,
    saveSeconds: Date.parse('2026-09-19T05:00:00Z') / 1000,
    level: 'exhaustive',
    route: { chain: [200, 292], reachAt: EGG_DAY - 99 * 3600, spare: 99 * 3600 },
  };
  const base = {
    nowMs: NOW_MS,
    save: { seconds: SAVE_AT, te: 191 },
    snapshot: null,
    lastChecked: null,
    history: [],
  };

  it('Egg Day: today’s board run from the PC, off this very save, leads; it says where it came from', async () => {
    const tile = buildTile({ ...base, goal: 'date', target: 490, deadline: EGG_DAY, board: [pc(309)], saved: [old] });
    expect(tile.answer?.endTE).toBe(309);
    expect(tile.answer?.source).toBe('board');
    expect(tile.olderSave).toBe(false);
    expect(sourceWords(tile.answer!)).toBe('from your board run sent from another browser');
    const html = await renderHtml(SavedTile, {
      tile,
      goal: 'date',
      title: 'Egg Day 2027',
      target: 490,
      now: NOW_MS / 1000,
      zone: ZONE,
      standing: '',
      standingLabel: 'Egg Day',
    });
    expect(textOf(html)).toContain('Exhaustive · from your board run sent from another browser');
    // This browser's own board run says so too, without "another browser".
    const own = buildTile({ ...base, goal: 'date', target: 490, deadline: EGG_DAY, board: [pc(309, { yours: true })], saved: [old] });
    expect(sourceWords(own.answer!)).toBe('from your board run');
    // Without the PC row, the old answer still shows, flagged as an older save.
    const alone = buildTile({ ...base, goal: 'date', target: 490, deadline: EGG_DAY, board: [], saved: [old] });
    expect(alone.answer?.source).toBe('saved');
    expect(alone.olderSave).toBe(true);
  });

  it('Fastest: with nothing from this save, the newest answer leads, not the 26-day-old Exhaustive', () => {
    const sep19: BoardRow = {
      id: 'sep19aaaaaa',
      chain: [292, 490],
      finalTE: 490,
      durationDays: 30,
      startLocal: '2026-09-19 00:30',
      timezone: ZONE,
      artifacts: GEAR,
      currentTE: 159,
      receivedAt: '2026-09-19T06:28:00Z',
      effort: 'exhaustive',
    };
    const oct13: BoardRow = {
      ...pc(490, { deadline: undefined, deadlineAscendAt: undefined }),
      id: 'oct13aaaaaa',
      chain: [195, 216, 239, 262, 286, 330, 490],
      durationDays: 40,
      startUtc: '2026-10-12T22:31:00.000Z',
      backupAgeHours: 1.8,
      backupTE: 190,
      receivedAt: '2026-10-13T03:19:00.000Z',
      level: 'thorough',
    };
    const tile = buildTile({ ...base, goal: 'fastest', target: 490, deadline: null, board: [sep19, oct13], saved: [] });
    expect(tile.answer?.chain).toEqual(oct13.chain);
    expect(tile.olderSave).toBe(true);
    expect(sourceWords(tile.answer!)).toBe('from your board run sent from another browser');
  });
});
