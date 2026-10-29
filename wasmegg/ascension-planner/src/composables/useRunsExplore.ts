/**
 * My runs › Your runs' chip selection (lib/runsExplore.ts), remembered per account in this browser: read when the
 * account is known (its partition hash, lib/accountHash.ts, never the player ID) and written on every change. With
 * no account (or no storage) the selection lasts for the visit. `initial` (specs) starts from a given selection
 * and is never overwritten by what was stored.
 */
import { ref, watch, type Ref } from 'vue';
import { accountHash } from '@/lib/accountHash';
import { emptyExplore, readExplore, writeExplore, type RunsExplore } from '@/lib/runsExplore';

export function useRunsExplore(o: { playerId: () => string; initial?: Partial<RunsExplore> }): { sel: Ref<RunsExplore> } {
  const sel = ref<RunsExplore>({ ...emptyExplore(), ...o.initial });
  let partition = '';
  if (o.initial) return { sel };
  watch(
    () => o.playerId().trim(),
    async id => {
      const p = id ? await accountHash(id).catch(() => '') : '';
      if (o.playerId().trim() !== id) return;
      partition = p;
      sel.value = readExplore(p);
    },
    { immediate: true }
  );
  watch(sel, s => writeExplore(partition, s), { deep: true });
  return { sel };
}
