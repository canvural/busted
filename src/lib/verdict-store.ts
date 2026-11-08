/**
 * Verdicts on disk (IndexedDB), so they survive the background being shut down and
 * browser restarts. Capped in size and age so it can't grow forever.
 */

export const MAX_ENTRIES = 20_000;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DB_NAME = 'busted';
const STORE = 'verdicts';

interface Row {
  key: string;
  score: number;
  at: number;
}

export interface VerdictStore {
  getMany(keys: readonly string[]): Promise<Map<string, number>>;
  putMany(entries: readonly (readonly [string, number])[]): Promise<void>;
  clear(): Promise<void>;
}

export interface VerdictStoreOptions {
  maxEntries?: number;
  maxAgeMs?: number;
  now?: () => number;
  indexedDB?: IDBFactory;
}

function done(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openVerdictStore(options: VerdictStoreOptions = {}): VerdictStore {
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const maxAgeMs = options.maxAgeMs ?? MAX_AGE_MS;
  const now = options.now ?? Date.now;
  const factory = options.indexedDB ?? globalThis.indexedDB;

  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('at', 'at');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));

  async function prune(database: IDBDatabase): Promise<void> {
    const tx = database.transaction(STORE, 'readwrite');
    const index = tx.objectStore(STORE).index('at');
    // Expired rows first, then the oldest rows above the cap.
    let excess = ((await done(tx.objectStore(STORE).count())) as number) - maxEntries;
    const cutoff = now() - maxAgeMs;
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        const row = c.value as Row;
        if (row.at < cutoff || excess > 0) {
          c.delete();
          excess--;
          c.continue();
        } else {
          resolve();
        }
      };
    });
    await finished(tx);
  }

  return {
    async getMany(keys) {
      const found = new Map<string, number>();
      if (keys.length === 0) return found;
      const database = await open();
      const store = database.transaction(STORE, 'readonly').objectStore(STORE);
      const cutoff = now() - maxAgeMs;
      const rows = (await Promise.all(keys.map((key) => done(store.get(key))))) as (Row | undefined)[];
      for (const row of rows) if (row && row.at >= cutoff) found.set(row.key, row.score);
      return found;
    },

    async putMany(entries) {
      if (entries.length === 0) return;
      const database = await open();
      const tx = database.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const at = now();
      for (const [key, score] of entries) store.put({ key, score, at } satisfies Row);
      await finished(tx);
      await prune(database);
    },

    async clear() {
      const database = await open();
      const tx = database.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await finished(tx);
    },
  };
}
