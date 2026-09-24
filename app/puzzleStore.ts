import { EMPTY_STORED_CATALOG, type StoredCatalog } from "./puzzleCatalog";

// Downloaded puzzles live in IndexedDB, not localStorage: they grow with every published puzzle
// the installed app doesn't ship, and localStorage (~5 MB) also holds everyone's progress.
// The whole StoredCatalog is one record, so the catalog and its downloads always match.
const DB_NAME = "persian-crossword";
const STORE = "kv";
const KEY = "puzzle-catalog";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// No IndexedDB (private windows, old WebViews) or a broken record: start from the built-in
// puzzles only. Downloads then just last until the page closes.
export async function readStoredCatalog(): Promise<StoredCatalog> {
  try {
    if (typeof indexedDB === "undefined") return EMPTY_STORED_CATALOG;
    const value = (await withStore("readonly", (store) => store.get(KEY))) as Partial<StoredCatalog> | undefined;
    if (!value || typeof value.downloaded !== "object" || value.downloaded === null) return EMPTY_STORED_CATALOG;
    return { catalog: value.catalog ?? null, downloaded: value.downloaded };
  } catch (error) {
    console.warn("[puzzleStore] could not read downloaded puzzles", error);
    return EMPTY_STORED_CATALOG;
  }
}

export async function writeStoredCatalog(value: StoredCatalog): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    await withStore("readwrite", (store) => store.put(value, KEY));
  } catch (error) {
    console.warn("[puzzleStore] could not save downloaded puzzles", error);
  }
}
