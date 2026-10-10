/**
 * @module StorageDB
 * @description Native IndexedDB wrapper for Ascension Planner.
 * Supports partitioned storage using SHA-256 hashes of Player IDs.
 */

const DB_NAME = 'AscensionPlannerDB';
const DB_VERSION = 1;

export interface PlanData {
    id: string;
    name: string;
    timestamp: number;
    data: any; // Full exported plan data
}

/**
 * Hash a string using SHA-256.
 */
export async function hashID(id: string): Promise<string> {
    if (!id) return 'anonymous';
    const msgUint8 = new TextEncoder().encode(id.toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('plans')) {
                db.createObjectStore('plans', { keyPath: 'storageKey' });
            }
            if (!db.objectStoreNames.contains('metadata')) {
                db.createObjectStore('metadata', { keyPath: 'key' });
            }
        };
    });
}

/**
 * Save a plan to the library.
 * storageKey = hash(EID) + "_" + UUID
 */
export async function savePlanToLibrary(partitionHash: string, plan: PlanData): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('plans', 'readwrite');
    const store = tx.objectStore('plans');

    const storageKey = `${partitionHash}_${plan.id}`;
    // Sanitize data through JSON round-trip to avoid DataCloneError with complex Vue Proxies
    const sanitizedPlan = JSON.parse(JSON.stringify(plan));

    await new Promise<void>((resolve, reject) => {
        const request = store.put({ ...sanitizedPlan, storageKey, partitionHash });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Load all plans for a specific partition.
 */
export async function loadLibraryPlans(partitionHash: string): Promise<PlanData[]> {
    const db = await openDB();
    const tx = db.transaction('plans', 'readonly');
    const store = tx.objectStore('plans');

    return new Promise((resolve, reject) => {
        const plans: PlanData[] = [];
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                if (cursor.value.partitionHash === partitionHash) {
                    plans.push(cursor.value);
                }
                cursor.continue();
            } else {
                resolve(plans.sort((a, b) => b.timestamp - a.timestamp));
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a plan from the library.
 */
export async function deletePlanFromLibrary(partitionHash: string, planId: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('plans', 'readwrite');
    const store = tx.objectStore('plans');
    const storageKey = `${partitionHash}_${planId}`;

    await new Promise<void>((resolve, reject) => {
        const request = store.delete(storageKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Save metadata (Active Draft, currentPlanId, etc.) for a partition.
 */
export async function saveMetadata(partitionHash: string, key: string, value: any): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');

    const storageKey = `${partitionHash}_${key}`;
    // Sanitize data through JSON round-trip to avoid DataCloneError with complex Vue Proxies
    const sanitizedValue = JSON.parse(JSON.stringify(value));

    await new Promise<void>((resolve, reject) => {
        const request = store.put({ key: storageKey, partitionHash, value: sanitizedValue });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Write several metadata records, and delete the records under any prefixes given, in ONE
 * transaction: all of it lands or none of it does.
 *
 * `raw` values skip the JSON round-trip `saveMetadata` does: they must already be plain data
 * (arrays, numbers, strings, typed arrays, ArrayBuffers -- nothing reactive). A checkpoint part is
 * that, and for 100,000 routes the round-trip was a ~150 MB copy and most of a second's stall on
 * the main thread, every 30 s (the 9 Oct crash investigation). `null` deletes the record.
 */
export async function putMetadataRecords(
    partitionHash: string,
    records: { key: string; value: unknown; raw?: boolean }[],
    deletePrefixes: string[] = []
): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');
    for (const prefix of deletePrefixes) store.delete(prefixRange(partitionHash, prefix));
    for (const { key, value, raw } of records) {
        const storageKey = `${partitionHash}_${key}`;
        if (value === null) store.delete(storageKey);
        else store.put({ key: storageKey, partitionHash, value: raw ? value : JSON.parse(JSON.stringify(value)) });
    }
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('the write was aborted'));
    });
}

/** Every key from `${hash}_${prefix}` up to the end of that prefix. */
function prefixRange(partitionHash: string, prefix: string): IDBKeyRange {
    const from = `${partitionHash}_${prefix}`;
    return IDBKeyRange.bound(from, `${from}￿`);
}

/** Every metadata value whose key starts with `prefix`, in key order. */
export async function loadMetadataPrefix(partitionHash: string, prefix: string): Promise<unknown[]> {
    const db = await openDB();
    const tx = db.transaction('metadata', 'readonly');
    const store = tx.objectStore('metadata');
    return new Promise((resolve, reject) => {
        const request = store.getAll(prefixRange(partitionHash, prefix));
        request.onsuccess = () => resolve((request.result ?? []).map((r: { value: unknown }) => r?.value));
        request.onerror = () => reject(request.error);
    });
}

/**
 * Load metadata for a partition.
 */
export async function loadMetadata(partitionHash: string, key: string): Promise<any> {
    const db = await openDB();
    const tx = db.transaction('metadata', 'readonly');
    const store = tx.objectStore('metadata');

    const storageKey = `${partitionHash}_${key}`;
    return new Promise((resolve, reject) => {
        const request = store.get(storageKey);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
    });
}
