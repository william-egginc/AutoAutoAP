/**
 * "Put my name on it" for a By a date / Egg Day send (Jordan, 22 Nov 2026: "YES! great idea", as Fastest and Chain Finder have it).
 * The row is the account's own on the board (`store.deadlineOnBoard`, read from GET /mine, so it is there after a reload too);
 * the rename is the same POST /claim as Fastest's (`store.claimName`). Offered only for a row with an id and no name:
 * with a name chosen it renames, with none chosen it opens the sharing setting on "Credit me as".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createShareIdentity, useByDateShare } from './useShareResult';
import { useChainSearchStore } from '@/stores/chainSearch';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('store.claimableName: the name a row on the board would be given', () => {
  const store = () => {
    setActivePinia(createPinia());
    return useChainSearchStore();
  };
  it('a name when the row has an id and a different name (or none)', () => {
    const s = store();
    expect(s.claimableName({ id: 'r1', nickname: '' }, 'Fliris')).toBe('Fliris');
    expect(s.claimableName({ id: 'r1' }, '  Fliris  ')).toBe('Fliris');
    expect(s.claimableName({ id: 'r1', nickname: 'Old' }, 'Fliris')).toBe('Fliris');
  });
  it('nothing when there is no row, no id, no name, or the row already carries it', () => {
    const s = store();
    expect(s.claimableName(null, 'Fliris')).toBe('');
    expect(s.claimableName({ nickname: '' }, 'Fliris')).toBe('');
    expect(s.claimableName({ id: 'r1', nickname: '' }, '   ')).toBe('');
    expect(s.claimableName({ id: 'r1', nickname: 'Fliris' }, 'Fliris')).toBe('');
  });
  it('a player id typed as the name is scrubbed, as everywhere else', () => {
    const s = store();
    expect(s.claimableName({ id: 'r1', nickname: '' }, 'EI1234567890123456')).not.toContain('1234567890123456');
  });
});

describe('useByDateShare: the name on a row already on the board', () => {
  const setup = (row: { id?: string; nickname?: string } | null, name: string, anonymous: boolean) => {
    const identity = createShareIdentity(ref(name));
    identity.anonymous.value = anonymous;
    const claimName = vi.fn(async () => ({ ok: true, message: 'your name is on it now: Fliris. Refresh the Leaderboard to see it there.' }));
    const loadMineRows = vi.fn(async () => {});
    const store = {
      leaderboardUrl: 'https://collector.example/',
      deadlineOnBoard: () => row,
      claimableName: (r: { id?: string; nickname?: string } | null, n: string) =>
        r?.id && n.trim() && n.trim() !== (r.nickname ?? '') ? n.trim() : '',
      claimName,
      loadMineRows,
    };
    const best = ref({ chain: [1, 2] } as never);
    const result = ref({ deadline: 1, at: 2 });
    const share = useByDateShare(store as never, identity, result, best);
    return { share, claimName, loadMineRows };
  };

  it('a row sent anonymously with a name chosen: Put my name on it renames it', async () => {
    const { share, claimName } = setup({ id: 'r1', nickname: '' }, 'Fliris', false);
    expect(share.nameToClaim.value).toBe('Fliris');
    expect(share.offerName.value).toBe(false);
    await share.claim();
    expect(claimName).toHaveBeenCalledWith('r1', 'Fliris');
    expect(share.shareOk.value).toBe(true);
    expect(share.shareMessage.value).toMatch(/^Done: your name is on it now/);
    // The row is now on the board under that name: nothing more to offer.
    expect(share.nameToClaim.value).toBe('');
    expect(share.offerName.value).toBe(false);
  });

  it('a row sent anonymously with no name chosen: the button opens the setting instead', () => {
    const { share } = setup({ id: 'r1', nickname: '' }, 'Fliris', true);
    expect(share.nameToClaim.value).toBe('');
    expect(share.offerName.value).toBe(true);
  });

  it('a row that already has a name, or has no id, or is not on the board: no button', () => {
    expect(setup({ id: 'r1', nickname: 'Fliris' }, 'Fliris', false).share.offerName.value).toBe(false);
    expect(setup({ id: 'r1', nickname: 'Fliris' }, 'Fliris', false).share.nameToClaim.value).toBe('');
    expect(setup({ nickname: '' }, 'Fliris', false).share.nameToClaim.value).toBe('');
    expect(setup({ nickname: '' }, 'Fliris', true).share.offerName.value).toBe(false);
    expect(setup(null, 'Fliris', false).share.offerName.value).toBe(false);
  });

  it('a refused claim says so and keeps offering it', async () => {
    const { share, claimName } = setup({ id: 'r1', nickname: '' }, 'Fliris', false);
    claimName.mockResolvedValueOnce({ ok: false, message: 'could not reach the planner\'s server.' } as never);
    await share.claim();
    expect(share.shareOk.value).toBe(false);
    expect(share.shareMessage.value).toMatch(/^Not renamed: /);
    expect(share.nameToClaim.value).toBe('Fliris');
    await nextTick();
  });
});

describe('DeadlinePanel shows it', () => {
  const panel = read('../components/auto/DeadlinePanel.vue');
  it('on the already-on-the-board line, with the rename and the one that opens the setting', () => {
    expect(panel).toContain('nameToClaim');
    expect(panel).toContain('offerName');
    expect(panel).toContain('data-testid="by-date-claim"');
    expect(panel).toContain('data-testid="by-date-name-it"');
    expect(panel).toContain('Put my name on it');
  });
  it('the sharing setting is reachable from there (the box is shown while naming)', () => {
    expect(panel).toContain('namingOpen');
  });
  it('with no name chosen the click opens "Credit me as" itself, so the disabled button is never left unexplained (QA, 22 Nov 2026)', () => {
    expect(panel).toContain('@click="nameIt"');
    expect(panel).toMatch(/<ShareResult\s+v-else-if="best && collectorConfigured"\s+:ref="bindShareBox"/);
    expect(panel).toMatch(/async function nameIt\(\)[\s\S]*?namingOpen\.value = true;[\s\S]*?await nextTick\(\);[\s\S]*?shareBox\?\.openForName\(\)/);
    const box = read('../components/auto/ShareResult.vue');
    expect(box).toMatch(/defineExpose\(\{[^}]*openForName/);
  });
});
