import { describe, it, expect, vi } from 'vitest';
import { sendRunResult, withPrivateDiagnostics } from './sendRun';

vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());

const payload = { chain: [195, 490], finalTE: 490 } as never;

function fakeStore() {
  const sent: { payload: Record<string, unknown>; csv?: string }[] = [];
  return {
    sent,
    store: {
      alreadySubmitted: false,
      buildRunSubmission: () => payload,
      blackBoxMark: vi.fn(),
      blackBoxEnd: vi.fn(),
      diagnosticsLine: () => JSON.stringify({ browser: 'chrome on mac', cores: 8 }),
      exportCsvChunks: vi.fn(() => ['c', 'sv']),
      sendSubmission: async (p: Record<string, unknown>, csv?: Iterable<string>) => {
        sent.push({ payload: p, csv: csv ? [...csv].join('') : undefined });
        return { ok: true, message: 'ok' };
      },
    } as never,
  };
}

describe('diagnostics ride in the submission body, never the CSV', () => {
  it('adds the field only when ticked', async () => {
    const a = fakeStore();
    await sendRunResult(a.store, '', true, () => {}, true);
    expect(a.sent[0].payload.diagnostics).toEqual({ browser: 'chrome on mac', cores: 8 });
    expect(a.sent[0].csv).toBe('csv');
    const b = fakeStore();
    await sendRunResult(b.store, '', true, () => {}, false);
    expect('diagnostics' in b.sent[0].payload).toBe(false);
  });

  it('works without the CSV', async () => {
    const a = fakeStore();
    await sendRunResult(a.store, '', false, () => {}, true);
    expect(a.sent[0].payload.diagnostics).toBeTruthy();
    expect(a.sent[0].csv).toBeUndefined();
  });

  it('leaves the payload alone when the summary is unreadable', () => {
    const s = { diagnosticsLine: () => '' } as never;
    expect(withPrivateDiagnostics(s, payload, true)).toBe(payload);
  });
});
