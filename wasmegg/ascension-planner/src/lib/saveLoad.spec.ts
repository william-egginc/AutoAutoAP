/**
 * Loading a save (lib/saveLoad.ts), QA's break-it #1 and #1b (22 Oct 2026): an empty 200 from the forwarder,
 * one that never answers, a garbage body and a wrong player ID each end in one plain sentence, never a
 * made-up account or raw exception text, and App.vue leaves the loaded account alone until a save is in.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ei } from 'lib';
import { ID_NOT_FOUND, LATEST_SAVE_FAILED, SAVE_TIMEOUT_MS, SAVE_UNREACHABLE, SaveLoadError, errorAfterSaveLoaded, requestSave, saveFrom } from './saveLoad';

const ID = 'EI1234567890123456';
const SAVE = { game: { eggsOfProphecy: 1 }, approxTime: 1_760_000_000 } as unknown as ei.IBackup;

afterEach(() => vi.useRealTimers());

async function failure(p: Promise<unknown>): Promise<SaveLoadError> {
  const e = await p.then(
    () => null,
    (x: unknown) => x
  );
  expect(e).toBeInstanceOf(SaveLoadError);
  return e as SaveLoadError;
}

describe('requestSave', () => {
  it('hands back the save when there is one', async () => {
    const { backup } = await requestSave(ID, { request: async () => ({ backup: SAVE }) });
    expect(backup).toBe(SAVE);
  });

  it('an empty 200 (decodes to a response with nothing in it) is the connection, not a save', async () => {
    const e = await failure(requestSave(ID, { request: async () => ({}) }));
    expect(e.kind).toBe('unreachable');
    expect(e.message).toBe(SAVE_UNREACHABLE);
    expect(e.message).toBe("Couldn't load your save. Check your connection and try again.");
  });

  it('a save with nothing in it (default-constructed) is no save either', () => {
    expect(() => saveFrom({ backup: {} })).toThrow(SAVE_UNREACHABLE);
  });

  it('a body that is not a save at all (the decoder throws) is the connection, with no raw text', async () => {
    const e = await failure(
      requestSave(ID, {
        request: async () => {
          throw new Error('Error decoding input as base64: InvalidCharacterError');
        },
      })
    );
    expect(e.message).toBe(SAVE_UNREACHABLE);
    expect(e.message).not.toMatch(/base64|Error/);
  });

  it("a 500 or a dropped connection names neither the forwarder's URL nor the exception", async () => {
    for (const thrown of [
      new Error('HTTP 500: internal'),
      new TypeError('POST https://egg-forwarder.example/ei/bot_first_contact: TypeError: Failed to fetch'),
    ]) {
      const e = await failure(
        requestSave(ID, {
          request: async () => {
            throw thrown;
          },
        })
      );
      expect(e.message).toBe(SAVE_UNREACHABLE);
      expect(e.message).not.toMatch(/https?:|TypeError/);
    }
  });

  it('a wrong player ID (the server says USER_NOT_FOUND, or echoes the ID with no save) says so', async () => {
    for (const data of [{ errorCode: 2 }, { errorMessage: 'user not found' }, { eiUserId: ID }]) {
      const e = await failure(requestSave(ID, { request: async () => data }));
      expect(e.kind).toBe('not-found');
      expect(e.message).toBe(ID_NOT_FOUND);
      expect(e.message).toBe("That player ID wasn't found. Check it and try again.");
    }
  });

  it('a request that never settles is given up on after 20 s, not 30 or 45', async () => {
    vi.useFakeTimers();
    expect(SAVE_TIMEOUT_MS).toBe(20_000);
    const p = requestSave(ID, { request: () => new Promise(() => {}) });
    const settled = vi.fn();
    p.then(settled, settled);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const e = await failure(p);
    expect(e.kind).toBe('unreachable');
  });
});

describe('wiring', () => {
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
  const submit = app.slice(app.indexOf('async function submitPlayerId(id: string) {'));
  const body = submit.slice(0, submit.indexOf('\n}\n'));

  it("App.vue's Load fetches through requestSave and changes nothing before the save is in", () => {
    const fetched = body.indexOf('await requestSave(id)');
    expect(fetched).toBeGreaterThan(0);
    for (const change of [
      'playerId.value = id',
      'savePlayerID(id)',
      'notesStore.$reset()',
      'actionsStore.clearAll(',
      'loadAndSyncBackup(',
    ])
      expect(body.indexOf(change), change).toBeGreaterThan(fetched);
    // The failed branch returns before any of them.
    const failed = body.slice(fetched, body.indexOf('playerId.value = id'));
    expect(failed).toContain('failLoad(id,');
    expect(failed).toContain('return;');
    expect(body).not.toContain('e instanceof Error ? e.message');
    expect(body).not.toContain('backup!');
  });

  it('the error under the ID box carries Try again for a failed load', () => {
    expect(app).toContain('data-testid="page-error-retry"');
    expect(app).toContain('@click="submitPlayerId(loadRetry.id)"');
  });

  it("Joo's fetchPlayerBackup and Quick Continue go through requestSave too", () => {
    const fb = readFileSync(new URL('./modes/fetchBackup.ts', import.meta.url), 'utf8');
    expect(fb).toContain('await requestSave(playerId)');
    expect(fb).not.toContain('requestFirstContact');
    expect(app).not.toContain('requestFirstContact');
    expect(app).toContain('await requestSave(playerId.value)');
  });
});

describe('errorAfterSaveLoaded (QA 24 Oct 2026: the line stayed after a Try again that worked)', () => {
  it('clears a save-load failure once a fresh save is in', () => {
    expect(errorAfterSaveLoaded(LATEST_SAVE_FAILED)).toBe('');
    expect(errorAfterSaveLoaded(SAVE_UNREACHABLE)).toBe('');
    expect(errorAfterSaveLoaded('')).toBe('');
  });
  it('keeps any other error', () => {
    expect(errorAfterSaveLoaded("Couldn't reset. Try again.")).toBe("Couldn't reset. Try again.");
    expect(errorAfterSaveLoaded(ID_NOT_FOUND)).toBe(ID_NOT_FOUND);
  });
});
