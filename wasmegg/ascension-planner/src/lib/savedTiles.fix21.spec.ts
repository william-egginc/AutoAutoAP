/**
 * Which answer heads My runs' Egg Day tile (fix 21). On beta the main account's tile showed 197 230 276 310
 * (310 TE, 3.2 d to spare, Exhaustive, from the loaded save) over 197 230 276 311 (311 TE, 30.2 h to spare, sent
 * the same day): the 311's save time, worked out from its plan start less its rounded save age, fell a few minutes
 * outside the 10-minute "same save" window, so only the 310 competed. The rule now, in plain words:
 *
 *   An answer is current when its save is the loaded one or at most 2 hours older (or newer). Current answers rank
 *   ahead of every answer from a save more than 2 hours older. Among current answers, Egg Day: the most TE, then
 *   the most spare, then the stronger pricing, then the newest; Fastest: the soonest finish. With no current
 *   answer, the newest older-save answer shows, flagged "Older save". A current answer from another save says how
 *   much older (or newer) its save is.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import SavedTile from '@/components/myruns/SavedTile.vue';
import type { BoardRow } from './leaderboardRank';
import { CURRENT_SAVE_SECONDS, buildTile, saveGapWords, type SavedDateAnswer, type TileInput } from './savedTiles';

const ZONE = 'America/Denver';
const H = 3600;
const EGG_DAY = 1_815_580_800;
/** The loaded save: Oct 15 at 2:40 pm (Denver). */
const SAVE_AT = Date.parse('2026-10-15T20:40:00Z') / 1000;
const NOW_MS = Date.parse('2026-10-16T03:00:00Z');

/** A board row of the main account; its save time is its plan start less `backupAgeHours`. */
function row(te: number, chain: number[], saveAt: number, over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: `r${te}aaaaaaaa`,
    chain,
    finalTE: te,
    durationDays: 270,
    deadline: EGG_DAY,
    deadlineAscendAt: EGG_DAY - 40 * H,
    startUtc: new Date((saveAt + 0.5 * H) * 1000).toISOString(),
    backupAgeHours: 0.5,
    timezone: ZONE,
    backupTE: 191,
    currentTE: 191,
    receivedAt: '2026-10-15T22:10:00.000Z',
    level: 'thorough',
    yours: true,
    ...over,
  };
}
/** 311 TE, 30.2 h to spare, from a save 4 minutes older than the loaded one. */
const r311 = row(311, [197, 230, 276, 311], SAVE_AT - 4 * 60, { deadlineAscendAt: EGG_DAY - 30.2 * H });
/** 310 TE, 3.2 days to spare, the loaded save, Exhaustive (saved on this device). */
const s310: SavedDateAnswer = {
  savedAt: Date.parse('2026-10-15T21:54:00Z'),
  deadline: EGG_DAY,
  te: 191,
  saveSeconds: SAVE_AT,
  level: 'exhaustive',
  route: { chain: [197, 230, 276, 310], reachAt: EGG_DAY - 3.2 * 86400, spare: 3.2 * 86400 },
};
/** 314 TE in six ascensions, from an Oct 12 save. */
const OCT12 = Date.parse('2026-10-12T22:31:00Z') / 1000;
const r314 = row(314, [195, 216, 239, 262, 286, 314], OCT12, {
  deadlineAscendAt: EGG_DAY - 20 * H,
  backupTE: 190,
  currentTE: 190,
  receivedAt: '2026-10-13T03:19:00.000Z',
});

const date = (o: Partial<TileInput>): TileInput => ({
  goal: 'date',
  target: 490,
  deadline: EGG_DAY,
  nowMs: NOW_MS,
  save: { seconds: SAVE_AT, te: 191 },
  snapshot: null,
  lastChecked: null,
  history: [],
  board: [],
  saved: [],
  ...o,
});

async function render(tile: ReturnType<typeof buildTile>): Promise<string> {
  return textOf(
    await renderHtml(SavedTile, {
      tile,
      goal: tile.goal,
      title: tile.goal === 'date' ? 'Egg Day 2027' : 'Fastest to 490',
      target: 490,
      now: NOW_MS / 1000,
      zone: ZONE,
      standing: '',
      standingLabel: 'Egg Day',
    })
  );
}

describe('the Egg Day tile: the most TE among current answers', () => {
  it('311 (30.2 h spare, a save 4 minutes older) leads 310 (3.2 d spare, the loaded save), and says which save', async () => {
    const tile = buildTile(date({ board: [r311], saved: [s310] }));
    expect(tile.answer?.endTE).toBe(311);
    expect(tile.answer?.chain).toEqual([197, 230, 276, 311]);
    expect(tile.answer?.spareHours).toBeCloseTo(30.2, 5);
    expect(tile.olderSave).toBe(false);
    expect(tile.saveGapSeconds).toBe(-240);
    expect(saveGapWords(tile.saveGapSeconds!)).toBe('4 min older than the one loaded');
    const t = await render(tile);
    expect(t).toContain('from your save of Oct 15 at 2:36 pm, 4 min older than the one loaded');
    expect(t).not.toContain('Older save than the one you loaded');
    // The 311's save is current, so the TE hasn't "moved".
    expect(tile.sure?.reason).not.toBe('your TE has moved since');
  });

  it('the loaded save’s own answer says nothing about another save', async () => {
    const tile = buildTile(date({ saved: [s310] }));
    expect(tile.answer?.endTE).toBe(310);
    expect(tile.saveGapSeconds).toBeNull();
    const t = await render(tile);
    expect(t).toContain('from your save of Oct 15 at 2:40 pm ·');
    expect(t).not.toContain('than the one loaded');
  });

  it('314 from an Oct 12 save ranks below the current answers', () => {
    const tile = buildTile(date({ board: [r314, r311], saved: [s310] }));
    expect(tile.answer?.endTE).toBe(311);
    expect(tile.olderSave).toBe(false);
  });

  it('alone, the Oct 12 314 shows, flagged Older save, without the "minutes older" words', async () => {
    const tile = buildTile(date({ board: [r314] }));
    expect(tile.answer?.endTE).toBe(314);
    expect(tile.olderSave).toBe(true);
    expect(tile.saveGapSeconds).toBeNull();
    const t = await render(tile);
    expect(t).toContain('Older save than the one you loaded.');
    expect(t).not.toContain('than the one loaded,');
  });

  it('within 2 hours a save is current: the 314 would lead from a save 1 h older; not from 2 h 1 min older', () => {
    const hourOld = row(314, r314.chain, SAVE_AT - H, { deadlineAscendAt: EGG_DAY - 20 * H });
    const t1 = buildTile(date({ board: [hourOld, r311], saved: [s310] }));
    expect(t1.answer?.endTE).toBe(314);
    expect(saveGapWords(t1.saveGapSeconds!)).toBe('1 h older than the one loaded');
    const tooOld = row(314, r314.chain, SAVE_AT - CURRENT_SAVE_SECONDS - 60, { deadlineAscendAt: EGG_DAY - 20 * H });
    expect(buildTile(date({ board: [tooOld, r311], saved: [s310] })).answer?.endTE).toBe(311);
  });

  it('same TE: the most spare wins', () => {
    const r310b = row(310, [197, 230, 276, 310], SAVE_AT - 4 * 60, { deadlineAscendAt: EGG_DAY - 10 * H, level: 'exhaustive' });
    const tile = buildTile(date({ board: [r310b], saved: [s310] }));
    expect(tile.answer?.source).toBe('saved');
    expect(tile.answer?.spareHours).toBeCloseTo(3.2 * 24, 5);
  });

  it('a newer save than the one loaded is current too, and says so', () => {
    const newer = row(311, [197, 230, 276, 311], SAVE_AT + 50 * 60, { deadlineAscendAt: EGG_DAY - 30.2 * H });
    const tile = buildTile(date({ board: [newer], saved: [s310] }));
    expect(tile.answer?.endTE).toBe(311);
    expect(saveGapWords(tile.saveGapSeconds!)).toBe('50 min newer than the one loaded');
  });
});

describe('the Fastest tile: still the soonest finish', () => {
  const race = (end: number, saveAt: number, id: string): BoardRow =>
    row(490, [197, 230, 276, 490], saveAt, {
      id,
      deadline: undefined,
      deadlineAscendAt: undefined,
      durationDays: (end - (saveAt + 0.5 * H)) / 86400,
    });
  const fast = (o: Partial<TileInput>): TileInput => date({ goal: 'fastest', deadline: null, ...o });

  it('the soonest current answer leads, wherever it came from', () => {
    const soon = SAVE_AT + 30 * 86400;
    const tile = buildTile(
      fast({
        lastChecked: { at: NOW_MS - H * 1000, chain: [197, 230, 490], end: soon + 86400, endTE: 490 },
        board: [race(soon, SAVE_AT - 4 * 60, 'soonaaaaaaaa')],
      })
    );
    expect(tile.answer?.source).toBe('board');
    expect(Math.round(tile.answer!.end)).toBe(Math.round(soon));
    expect(tile.saveGapSeconds).toBe(-240);
  });

  it('a sooner finish from an Oct 12 save does not lead a current answer', () => {
    const tile = buildTile(
      fast({
        lastChecked: { at: NOW_MS - H * 1000, chain: [197, 230, 490], end: SAVE_AT + 40 * 86400, endTE: 490 },
        board: [race(SAVE_AT + 20 * 86400, OCT12, 'oldaaaaaaaaa')],
      })
    );
    expect(tile.answer?.source).toBe('lastChecked');
    expect(tile.olderSave).toBe(false);
  });
});
