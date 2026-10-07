/**
 * The instant answer's tables fetched in the background (search/tablePrefetch.ts): once a save is
 * loaded and the page is idle, the files this player's instant answer will read, so it is ready when
 * they open Fastest route or By a date. Once per save and gear stamp in a session; silent on failure.
 */
import { watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import { useInitialStateStore } from '@/stores/initialState';
import { cteFromArtifacts } from 'lib/virtue';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { instantDeliveryScale } from '@/search/leg';
import { gearStamp, gearTableName, tableName } from '@/search/tableGear';
import { prefetchAllowed, prefetchFiles, prefetchPlan } from '@/search/tablePrefetch';
import type { TableEntry } from '@/search/tableBracket';
import type { TableHeader } from '@/search/precomputedTable';

const DONE_KEY = 'aap-table-prefetch';

function done(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DONE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function markDone(key: string): void {
  try {
    sessionStorage.setItem(DONE_KEY, JSON.stringify([...done(), key].slice(-20)));
  } catch {
    // Storage blocked: at worst it is fetched again next time (from the cache).
  }
}

export function useTablePrefetch(): void {
  if (typeof window === 'undefined' || !prefetchAllowed()) return;
  const store = useChainSearchStore();
  const ui = useUIStore();
  const initial = useInitialStateStore();
  const base = `${import.meta.env.BASE_URL}precompute/`;
  let busy = false;

  async function run(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const te = Math.floor(store.currentTE);
      const inputs = store.collectInputs();
      const id = (inputs.context.rawBackup as { eiUserId?: string } | undefined)?.eiUserId;
      if (!(te > 0) || !id) return;
      const res = await fetch(`${base}tables.json`, { cache: 'no-cache' });
      if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) return;
      const entries = (await res.json()) as TableEntry[];
      const k3 = entries.find(e => e.file === 'table.bin')?.k3 as TableHeader['k3'] | undefined;
      if (!k3) return;
      const earnings = store.readInventory().earnings;
      const stamp = gearStamp(inputs, earnings, k3.research);
      const gear = stamp ? await gearTableName(stamp) : null;
      const key = `${await tableName(id)}|${gear ?? ''}`;
      if (done().includes(key)) return;
      markDone(key);
      const player = {
        bonus: earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(earnings)) : 0,
        k: instantDeliveryScale(inputs, k3),
      };
      const own = key.split('|')[0];
      await prefetchFiles(base, prefetchPlan({ entries, own, gear, player, te }));
    } catch {
      // A prefetch that fails changes nothing: the panel fetches what it needs when it opens.
    } finally {
      busy = false;
    }
  }

  // When a save is loaded (a new one too) and the page has settled.
  watch(
    () => [store.currentTE > 0 && !ui.loading, (initial.rawBackup as { eiUserId?: string } | null)?.eiUserId],
    ([ready]) => {
      if (!ready) return;
      const go = () => void run();
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback;
      if (ric) setTimeout(() => ric(go, { timeout: 10000 }), 3000);
      else setTimeout(go, 5000);
    },
    { immediate: true }
  );
}
