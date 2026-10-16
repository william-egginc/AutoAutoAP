import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createShareIdentity, useBoardSubmit, useSharedName, type BoardStore } from './useShareResult';
import { useShareNameStore } from '@/stores/shareName';

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

describe('one share name for the account', () => {
  const sharedOf = () => {
    const box = ref<string | undefined>(undefined);
    return { box, name: { get: () => box.value, set: (v: string) => (box.value = v) } };
  };

  it("typed in one screen, it is in the others; anonymous and consent stay each one's own", async () => {
    const { name } = sharedOf();
    const account = ref('Fliris');
    const fastest = createShareIdentity(account, name);
    const byDate = createShareIdentity(account, name);
    expect(byDate.nickname.value).toBe('Fliris');
    // A keystroke in Fastest's box: the model update, then nicknameTyped.
    fastest.nickname.value = 'Fl';
    fastest.nicknameTouched.value = true;
    expect(byDate.nickname.value).toBe('Fl');
    fastest.nickname.value = 'Flo';
    fastest.nicknameTouched.value = true;
    expect(byDate.nickname.value).toBe('Flo');
    // Typing in By a date's box fills Fastest's back.
    byDate.nickname.value = 'Flow';
    byDate.nicknameTouched.value = true;
    expect(fastest.nickname.value).toBe('Flow');
    // The account's name loading late no longer replaces it anywhere.
    account.value = 'Someone';
    await nextTick();
    expect(fastest.nickname.value).toBe('Flow');
    fastest.anonymous.value = false;
    fastest.optIn.value = true;
    expect(byDate.anonymous.value).toBe(true);
    expect(byDate.optIn.value).toBe(false);
  });

  it('anonymous or "Credit me as" is the account\'s one choice on every screen (14 Oct)', () => {
    const { name } = sharedOf();
    const picked = ref<boolean | undefined>(undefined);
    const shared = { ...name, getAnonymous: () => picked.value, setAnonymous: (v: boolean) => (picked.value = v) };
    const fastest = createShareIdentity(ref('Fliris'), shared);
    const byDate = createShareIdentity(ref('Fliris'), shared);
    // Not picked yet: anonymous, as before.
    expect(fastest.anonymous.value).toBe(true);
    expect(byDate.anonymous.value).toBe(true);
    // "Credit me as" on Fastest: By a date has it too, and it is what is kept.
    fastest.anonymous.value = false;
    expect(byDate.anonymous.value).toBe(false);
    expect(picked.value).toBe(false);
    byDate.anonymous.value = true;
    expect(fastest.anonymous.value).toBe(true);
    // A choice kept from an earlier visit is where a new screen starts.
    picked.value = false;
    expect(createShareIdentity(ref(''), shared).anonymous.value).toBe(false);
    // The consent is still the screen's own here (the real screens pass the site's one).
    fastest.optIn.value = true;
    expect(byDate.optIn.value).toBe(false);
  });

  it('useSharedName reads and writes the choice in the account store', () => {
    setActivePinia(createPinia());
    const shared = useSharedName(() => 'test-player-id');
    expect(shared.getAnonymous?.()).toBeUndefined();
    shared.setAnonymous?.(false);
    expect(useShareNameStore().anonymousFor('test-player-id')).toBe(false);
    expect(createShareIdentity(ref(''), shared).anonymous.value).toBe(false);
  });

  it('either order of the model update and nicknameTyped shares the name', () => {
    const { name, box } = sharedOf();
    const id = createShareIdentity(ref(''), name);
    id.nicknameTouched.value = true;
    id.nickname.value = 'A';
    expect(box.value).toBe('A');
  });

  it("a name put back by code (a carried-on run's own) stays that screen's until the player types", () => {
    const { name, box } = sharedOf();
    const byDate = createShareIdentity(ref('Fliris'), name);
    const fastest = createShareIdentity(ref('Fliris'), name);
    byDate.nickname.value = 'Old run name';
    expect(byDate.nickname.value).toBe('Old run name');
    expect(fastest.nickname.value).toBe('Fliris');
    expect(box.value).toBeUndefined();
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

  it('a consent remembered from an earlier visit contacts nothing: rechecks wait for a yes given now', async () => {
    const st = fakeStore({ bestDays: 30 } as never);
    // Agreed on arrival (useShareConsent.ts reads it from storage), and a finished result is on screen.
    const optIn = ref(true);
    useBoardSubmit(st, ref(''), optIn);
    await nextTick();
    expect(st.prepareRechecks).not.toHaveBeenCalled();
    // Withdrawn and ticked again this visit: now it is the player's yes.
    optIn.value = false;
    optIn.value = true;
    await nextTick();
    expect(st.prepareRechecks).toHaveBeenCalledTimes(1);
  });
});
