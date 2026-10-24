/**
 * Whether the loaded save's gear has an instant answer of its own (search/tablePrefetch.ts
 * `gearCoverage`), for the Science tab's "Any other gear" card. Worked out the way the instant answer
 * looks its tables up (InstantRoute.vue, useTablePrefetch.ts): the table list, the save's own table
 * name and its gear's names. Only while `active()` is true (Science is open), once per save; null
 * until known or when the list can't be read.
 */
import { ref, watch, type Ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { gearStamp, gearTableNames, tableName } from '@/search/tableGear';
import { gearCoverage, type GearCoverage } from '@/search/tablePrefetch';
import { MAXED_TABLE_FILE, type TableEntry } from '@/search/tableBracket';
import type { TableHeader } from '@/search/precomputedTable';

export function useGearCoverage(active: () => boolean): Ref<GearCoverage | null> {
  const store = useChainSearchStore();
  const initial = useInitialStateStore();
  const coverage = ref<GearCoverage | null>(null);
  let doneFor = '';

  async function run(id: string): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}precompute/tables.json`, { cache: 'no-cache' });
      if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) return;
      const entries = (await res.json()) as TableEntry[];
      const k3 = entries.find(e => e.file === MAXED_TABLE_FILE)?.k3 as TableHeader['k3'] | undefined;
      const stamp = k3 ? gearStamp(store.collectInputs(), store.readInventory().earnings, k3.research) : null;
      const gear = stamp ? await gearTableNames(stamp) : [];
      const own = await tableName(id);
      if (doneFor === id) coverage.value = gearCoverage(entries, own, gear);
    } catch {
      // Unknown: the card says nothing about the player's own gear.
    }
  }

  watch(
    () => [active(), (initial.rawBackup as { eiUserId?: string } | null)?.eiUserId] as const,
    ([on, id]) => {
      if (!on || !id || doneFor === id) return;
      doneFor = id;
      coverage.value = null;
      void run(id);
    },
    { immediate: true }
  );
  return coverage;
}
