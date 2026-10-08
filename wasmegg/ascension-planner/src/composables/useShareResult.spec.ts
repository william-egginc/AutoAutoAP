import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createShareIdentity, useBoardSubmit, type BoardStore } from './useShareResult';

describe('share identity', () => {
  it('starts unticked and anonymous, with the account name in the box', () => {
    const id = createShareIdentity(ref('Fliris'));
    expect(id.optIn.value).toBe(false);
    expect(id.anonymous.value).toBe(true);
    expect(id.nickname.value).toBe('Fliris');
  });

  it('follows the account name until the player types', async () => {
    const name = ref('');
    const id = createShareIdentity(name);
    name.value = 'Halceyx';
    await nextTick();
    expect(id.nickname.value).toBe('Halceyx');
    id.nickname.value = 'H';
    id.nicknameTouched.value = true;
    name.value = 'Someone else';
    await nextTick();
    expect(id.nickname.value).toBe('H');
  });
});

function fakeStore(over: Partial<BoardStore> = {}) {
  return {
    alreadySubmitted: false,
    bestDays: 0,
    isRunning: false,
    sentRecord: null,
    retryTable: vi.fn(async () => ({ ok: true, message: 'table stored' })),
    nameToClaim: vi.fn((n: string) => (n ? `${n}!` : '')),
    claimName: vi.fn(async () => ({ ok: true, message: 'renamed' })),
    prepareRechecks: vi.fn(async () => undefined),
    ...over,
  } as unknown as BoardStore;
}

describe('board submit', () => {
  it('says a second send would only be a duplicate', () => {
    const s = useBoardSubmit(fakeStore({ alreadySubmitted: true } as never), ref(''), ref(true));
    expect(s.refuseDuplicate()).toBe(true);
    expect(s.submitOk.value).toBe(true);
    expect(s.submitMessage.value).toBe('Already on the board: this result was sent from this browser.');
    const t = useBoardSubmit(fakeStore(), ref(''), ref(true));
    expect(t.refuseDuplicate()).toBe(false);
    expect(t.submitMessage.value).toBe('');
  });

  it('marks "Sent, but ..." as partial', () => {
    const s = useBoardSubmit(fakeStore(), ref(''), ref(false));
    s.submitMessage.value = 'Thanks! Sent, but the table did not arrive.';
    expect(s.submitPartial.value).toBe(true);
    s.submitMessage.value = 'Thanks! Stored.';
    expect(s.submitPartial.value).toBe(false);
  });

  it('retries the table and words the answer', async () => {
    const st = fakeStore();
    const s = useBoardSubmit(st, ref(''), ref(false));
    await s.retryTable();
    expect(s.submitOk.value).toBe(true);
    expect(s.submitMessage.value).toBe('Thanks! Table stored.');
    (st.retryTable as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, message: 'offline' });
    await s.retryTable();
    expect(s.submitMessage.value).toBe('Not sent: offline');
  });

  it('puts the name on the stored row only when there is one', async () => {
    const st = fakeStore();
    const name = ref('Allan');
    const s = useBoardSubmit(st, name, ref(false));
    expect(s.nameToClaim.value).toBe('Allan!');
    await s.claim();
    expect(st.claimName).not.toHaveBeenCalled();
    const st2 = fakeStore({ sentRecord: { id: 'abc' } } as never);
    const s2 = useBoardSubmit(st2, name, ref(false));
    await s2.claim();
    expect(st2.claimName).toHaveBeenCalledWith('abc', 'Allan');
    expect(s2.submitMessage.value).toBe('Done: renamed');
  });

  it('works out the rechecks once consent is given for a finished result', async () => {
    const st = fakeStore({ bestDays: 30 } as never);
    const optIn = ref(false);
    useBoardSubmit(st, ref(''), optIn);
    expect(st.prepareRechecks).not.toHaveBeenCalled();
    optIn.value = true;
    await nextTick();
    expect(st.prepareRechecks).toHaveBeenCalledTimes(1);
  });
});
