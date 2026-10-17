/**
 * The dashboard's own IndexedDB database, `cawco`, opened once for every
 * store in it: what a reload must not lose. `drafts` (draft-store.ts), a
 * conversation's unsent words; `sends` (send-store.ts), a message sent and
 * not yet taken by the hub. One opener for both, because a second one at
 * another version would block on the first.
 */

const DB_NAME = "cawco";
/** 1: `drafts`. 2: `sends` beside it. */
const DB_VERSION = 2;

export const DRAFTS = "drafts";
export const SENDS = "sends";

let opening: Promise<IDBDatabase> | null = null;

export function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS)) {
        db.createObjectStore(DRAFTS, { keyPath: "sessionId" });
      }
      if (!db.objectStoreNames.contains(SENDS)) {
        db.createObjectStore(SENDS, { keyPath: "commandId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // A browser that refuses the database (private mode) keeps nothing; said once here.
  opening.catch((error: unknown) => {
    console.warn(
      "[idb] IndexedDB refused to open; drafts and unsent messages are not kept",
      error
    );
  });
  return opening;
}

export function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
