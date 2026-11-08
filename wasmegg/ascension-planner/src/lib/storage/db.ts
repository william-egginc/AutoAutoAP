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

/**
 * How long an open may take before the caller is told there is no database (red team 6 Nov 2026, R1).
 * WebKit can leave `indexedDB.open` unanswered for good (blocked storage, its known hang), and the page's
 * startup awaited it, so My runs and the Auto Planner setup never came. Nothing is deleted or written on a
 * timeout: the open keeps going, and if it answers late the database is used again from the next call.
 */
export const OPEN_TIMEOUT_MS = 5000;

/** An open that passed its timeout and has not answered yet. While it is out, calls fail at once (no-DB
 *  mode) instead of each waiting another 5 s; it clears when that open answers either way. */
let stalledOpen: IDBOpenDBRequest | null = null;

/**
 * How long one transaction may wait for its answer (spec-crosstab, 7 Nov 2026). The open is bounded above, but the
 * database never changes version, so another tab can't block an open: what it CAN hold is a transaction. A tab frozen
 * between its write and its commit (Safari suspends pages) keeps every later transaction on that store waiting, in
 * every tab, and a run's checkpoint write or the page's draft read then never answered. Past this the caller is told
 * the database did not answer and this tab's transaction is aborted (all or nothing, as a failed write). While the
 * database is known not to answer, later calls wait only `STUCK_TX_TIMEOUT_MS`; any answer ends that.
 */
export const TX_TIMEOUT_MS = 30_000;
export const STUCK_TX_TIMEOUT_MS = 5_000;
let txStuck = false;

/**
 * The database did not answer (an open or a transaction past its bound), as opposed to answering with an error or
 * with "no record" (review 7 Nov 2026, finding 2). A caller that read in order to decide what to write
 * (persistence.ts saveCheckpoint) must not take this as "nothing there". Marked on the error itself, so callers need
 * no import from here (specs mock this module).
 */
function noAnswer(message: string): Error {
    return Object.assign(new Error(message), { noAnswer: true });
}

function bounded<T>(tx: IDBTransaction, wait: Promise<T>): Promise<T> {
    const ms = txStuck ? STUCK_TX_TIMEOUT_MS : TX_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            txStuck = true;
            try {
                tx.abort();
            } catch {
                // Already finished.
            }
            reject(noAnswer(`IndexedDB did not answer within ${ms / 1000} s (another tab may be holding it)`));
        }, ms);
    });
    return Promise.race([wait, limit]).then(
        v => {
            clearTimeout(timer);
            txStuck = false;
            return v;
        },
        e => {
            clearTimeout(timer);
            throw e;
        }
    );
}

function openDB(): Promise<IDBDatabase> {
    if (stalledOpen) return Promise.reject(noAnswer('IndexedDB is not answering (an earlier open is still out)'));
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            stalledOpen = request;
            reject(noAnswer(`IndexedDB did not open within ${OPEN_TIMEOUT_MS / 1000} s`));
        }, OPEN_TIMEOUT_MS);
        const settle = () => {
            clearTimeout(timer);
            if (stalledOpen === request) stalledOpen = null;
        };

        request.onerror = () => {
            settle();
            if (!timedOut) reject(request.error);
        };
        request.onsuccess = () => {
            settle();
            const db = request.result;
            // Its caller already went on without it; the next call opens a fresh one.
            if (timedOut) return db.close();
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onblocked = () => console.warn('IndexedDB open is blocked by another tab; waiting.');

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

    await bounded(tx, new Promise<void>((resolve, reject) => {
        const request = store.put({ ...sanitizedPlan, storageKey, partitionHash });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    }));
}

/**
 * Load all plans for a specific partition.
 */
export async function loadLibraryPlans(partitionHash: string): Promise<PlanData[]> {
    const db = await openDB();
    const tx = db.transaction('plans', 'readonly');
    const store = tx.objectStore('plans');

    return bounded(tx, new Promise((resolve, reject) => {
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
    }));
}

/**
 * Delete a plan from the library.
 */
export async function deletePlanFromLibrary(partitionHash: string, planId: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('plans', 'readwrite');
    const store = tx.objectStore('plans');
    const storageKey = `${partitionHash}_${planId}`;

    await bounded(tx, new Promise<void>((resolve, reject) => {
        const request = store.delete(storageKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    }));
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

    // Resolved when the transaction COMMITS, not when the put succeeds: a put can succeed and its
    // transaction still abort (quota, a crash before commit), and a caller that goes on as if it were
    // saved would lose it (the 28-29 Sep edge cases).
    await bounded(tx, new Promise<void>((resolve, reject) => {
        const request = store.put({ key: storageKey, partitionHash, value: sanitizedValue });
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? request.error);
        tx.onabort = () => reject(tx.error ?? new Error('the write was aborted'));
    }));
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
    await bounded(tx, new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('the write was aborted'));
    }));
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
    return bounded(tx, new Promise((resolve, reject) => {
        const request = store.getAll(prefixRange(partitionHash, prefix));
        request.onsuccess = () => resolve((request.result ?? []).map((r: { value: unknown }) => r?.value));
        request.onerror = () => reject(request.error);
    }));
}

/**
 * Load metadata for a partition.
 */
export async function loadMetadata(partitionHash: string, key: string): Promise<any> {
    const db = await openDB();
    const tx = db.transaction('metadata', 'readonly');
    const store = tx.objectStore('metadata');

    const storageKey = `${partitionHash}_${key}`;
    return bounded(tx, new Promise((resolve, reject) => {
        const request = store.get(storageKey);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
    }));
}
