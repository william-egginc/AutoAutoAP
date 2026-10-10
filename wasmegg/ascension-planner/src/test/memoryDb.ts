/**
 * lib/storage/db.ts in memory, for the specs that mock it: the metadata calls the search's stores use,
 * keyed `${hash}/${key}` in a Map the spec owns. Values go through `structuredClone`, as IndexedDB's
 * own put does (so an ArrayBuffer survives, and nothing is shared with the caller); `saveMetadata`
 * also does its JSON round-trip, as the real one does.
 */
export function memoryDbModule(db: Map<string, unknown>) {
  const at = (hash: string, key: string) => `${hash}/${key}`;
  return {
    saveMetadata: async (hash: string, key: string, value: unknown) => {
      db.set(at(hash, key), JSON.parse(JSON.stringify(value)));
    },
    loadMetadata: async (hash: string, key: string) => db.get(at(hash, key)) ?? null,
    putMetadataRecords: async (
      hash: string,
      records: { key: string; value: unknown; raw?: boolean }[],
      deletePrefixes: string[] = []
    ) => {
      for (const prefix of deletePrefixes)
        for (const k of [...db.keys()]) if (k.startsWith(at(hash, prefix))) db.delete(k);
      for (const { key, value, raw } of records) {
        if (value === null) db.delete(at(hash, key));
        else db.set(at(hash, key), raw ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
      }
    },
    loadMetadataPrefix: async (hash: string, prefix: string) =>
      [...db.keys()]
        .filter(k => k.startsWith(at(hash, prefix)))
        .sort()
        .map(k => db.get(k)),
    hashID: async (id: string) => id,
  };
}
