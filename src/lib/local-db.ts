/**
 * Local persistence for the POS.
 *
 * Everything the POS needs during a blackout lives here: the catalog, open
 * orders, cup tokens, inventory ledger entries, and the outbox. It is a single
 * IndexedDB object store keyed `collection:id`, which keeps schema upgrades to
 * one version bump instead of one per collection.
 *
 * Why IndexedDB and not localStorage or SQLite — see /docs/10-offline-first.md.
 * The only rule callers must respect: talk to repositories, never to this file
 * directly, so the storage engine can be swapped without touching features.
 */

export type Collection =
  | 'orders'
  | 'cups'
  | 'payments'
  | 'refunds'
  | 'invoices'
  | 'customers'
  | 'inventoryLevels'
  | 'inventoryTxns'
  | 'transfers'
  | 'outbox'
  | 'audit'
  | 'shifts'
  | 'catalog'
  | 'meta'
  // Admin data. Frontend-only build: these replace what used to live behind
  // /api/bootstrap and the various /api/admin-ish routes — see
  // src/repositories/admin-seed.ts for where they're populated.
  | 'org'
  | 'stores'
  | 'devices'
  | 'staff'
  | 'categories'
  | 'products'
  | 'modifierGroups'
  | 'ingredients'
  | 'recipes'
  | 'discounts'
  | 'taxRates'
  | 'settings'
  | 'productStoreOverrides'
  | 'attendance'
  | 'nooksTransactions';

const DB_NAME = `nookaa-pos-${process.env.NEXT_PUBLIC_ORG_SLUG ?? 'nookaa'}`;
const DB_VERSION = 1;
const STORE = 'records';

export interface LocalStore {
  get<T>(collection: Collection, id: string): Promise<T | undefined>;
  list<T>(collection: Collection): Promise<T[]>;
  put<T>(collection: Collection, id: string, value: T): Promise<void>;
  putMany<T>(collection: Collection, entries: Array<[string, T]>): Promise<void>;
  remove(collection: Collection, id: string): Promise<void>;
  clear(collection: Collection): Promise<void>;
  wipe(): Promise<void>;
}

const key = (collection: Collection, id: string) => `${collection}:${id}`;

/* --------------------------------------------------------------- in-memory */

class MemoryStore implements LocalStore {
  private data = new Map<string, unknown>();

  async get<T>(collection: Collection, id: string) {
    return this.data.get(key(collection, id)) as T | undefined;
  }
  async list<T>(collection: Collection) {
    const prefix = `${collection}:`;
    const out: T[] = [];
    this.data.forEach((value, k) => {
      if (k.startsWith(prefix)) out.push(value as T);
    });
    return out;
  }
  async put<T>(collection: Collection, id: string, value: T) {
    this.data.set(key(collection, id), value);
  }
  async putMany<T>(collection: Collection, entries: Array<[string, T]>) {
    entries.forEach(([id, value]) => this.data.set(key(collection, id), value));
  }
  async remove(collection: Collection, id: string) {
    this.data.delete(key(collection, id));
  }
  async clear(collection: Collection) {
    const prefix = `${collection}:`;
    Array.from(this.data.keys()).forEach((k) => {
      if (k.startsWith(prefix)) this.data.delete(k);
    });
  }
  async wipe() {
    this.data.clear();
  }
}

/* -------------------------------------------------------------- IndexedDB */

class IndexedDbStore implements LocalStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(collection: Collection, id: string) {
    return (await this.tx<T>('readonly', (s) => s.get(key(collection, id)) as IDBRequest<T>)) ?? undefined;
  }

  async list<T>(collection: Collection) {
    const range = IDBKeyRange.bound(`${collection}:`, `${collection}:\uffff`);
    return this.tx<T[]>('readonly', (s) => s.getAll(range) as IDBRequest<T[]>);
  }

  async put<T>(collection: Collection, id: string, value: T) {
    await this.tx('readwrite', (s) => s.put(value, key(collection, id)) as IDBRequest<IDBValidKey>);
  }

  async putMany<T>(collection: Collection, entries: Array<[string, T]>) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      entries.forEach(([id, value]) => store.put(value, key(collection, id)));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async remove(collection: Collection, id: string) {
    await this.tx('readwrite', (s) => s.delete(key(collection, id)) as IDBRequest<undefined>);
  }

  async clear(collection: Collection) {
    const range = IDBKeyRange.bound(`${collection}:`, `${collection}:\uffff`);
    await this.tx('readwrite', (s) => s.delete(range) as IDBRequest<undefined>);
  }

  async wipe() {
    await this.tx('readwrite', (s) => s.clear() as IDBRequest<undefined>);
    this.dbPromise = null;
  }
}

let instance: LocalStore | null = null;

/**
 * IndexedDB on the device, memory during server rendering and in tests.
 * A store that silently drops data is worse than one that admits it, so the
 * memory fallback is only used where persistence is not expected anyway.
 */
export function localStore(): LocalStore {
  if (instance) return instance;
  const hasIdb = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  instance = hasIdb ? new IndexedDbStore() : new MemoryStore();
  return instance;
}

export function resetLocalStoreForTests(store?: LocalStore) {
  instance = store ?? null;
}
