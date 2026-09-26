/**
 * Where a conversation's unsent message waits out a reload: IndexedDB, one
 * record per session id, holding everything the composer holds — the text,
 * the images, the file attachments and the element notes.
 *
 * IndexedDB rather than localStorage because the attachments are binary and
 * large: images are stored as Blobs, not as base64 strings in a 5 MB string
 * store. The whole database is held under {@link CAP_BYTES}; past it, the
 * drafts edited longest ago are dropped until it fits, never the one being
 * written.
 */
import type { PendingSelection } from "../preview/selection";
import type { PendingImage, PendingText } from "./composer-draft.svelte";

const DB_NAME = "whiffle";
const DB_VERSION = 1;
const STORE = "drafts";

/** The most the stored drafts may weigh together, in bytes. */
export const CAP_BYTES = 50 * 1024 * 1024;

interface DraftRecord {
  images: { blob: Blob; mediaType: string; name: string }[];
  selections: PendingSelection[];
  sessionId: string;
  /** What the record weighs, for the cap: blob bytes plus two per character. */
  size: number;
  text: string;
  texts: PendingText[];
  /** When it was last written, for eviction. */
  updatedAt: number;
}

let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "sessionId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** base64 (the wire shape) to a Blob, once per image: the same image is re-stored on every save. */
const blobs = new WeakMap<PendingImage, Blob>();
function blobOf(image: PendingImage): Blob {
  let blob = blobs.get(image);
  if (!blob) {
    const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: image.mediaType });
    blobs.set(image, blob);
  }
  return blob;
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** What a stored draft is made of: the composer's own pieces. */
export interface DraftContent {
  images: PendingImage[];
  selections: PendingSelection[];
  text: string;
  texts: PendingText[];
}

/** The draft stored for a conversation, or null. */
export async function loadDraft(
  sessionId: string
): Promise<DraftContent | null> {
  const db = await database();
  const record = await result<DraftRecord | undefined>(
    db.transaction(STORE).objectStore(STORE).get(sessionId)
  );
  if (!record) {
    return null;
  }
  return {
    text: record.text,
    images: await Promise.all(
      record.images.map(async (image) => ({
        name: image.name,
        mediaType: image.mediaType,
        data: await base64Of(image.blob),
      }))
    ),
    texts: record.texts,
    selections: record.selections,
  };
}

const isEmpty = (draft: DraftContent) =>
  !(
    draft.text ||
    draft.images.length ||
    draft.texts.length ||
    draft.selections.length
  );

/**
 * Stores a conversation's draft, or drops its record when the draft is
 * empty, then holds the database under the cap.
 */
export async function saveDraft(
  sessionId: string,
  draft: DraftContent
): Promise<void> {
  const db = await database();
  const transaction = db.transaction(STORE, "readwrite");
  const finished = done(transaction);
  const store = transaction.objectStore(STORE);
  if (isEmpty(draft)) {
    store.delete(sessionId);
    return finished;
  }
  const images = draft.images.map((image) => ({
    name: image.name,
    mediaType: image.mediaType,
    blob: blobOf(image),
  }));
  const { selections } = draft;
  const size =
    images.reduce((sum, image) => sum + image.blob.size, 0) +
    2 *
      (draft.text.length +
        draft.texts.reduce((sum, t) => sum + t.content.length, 0) +
        JSON.stringify(selections).length);
  const record: DraftRecord = {
    sessionId,
    text: draft.text,
    images,
    texts: draft.texts,
    selections,
    size,
    updatedAt: Date.now(),
  };
  store.put(record);
  // Over the cap, the drafts edited longest ago go first; never this one.
  const all = await result<DraftRecord[]>(store.getAll());
  let total = all.reduce((sum, each) => sum + each.size, 0);
  for (const old of all
    .filter((each) => each.sessionId !== sessionId)
    .sort((a, b) => a.updatedAt - b.updatedAt)) {
    if (total <= CAP_BYTES) {
      break;
    }
    store.delete(old.sessionId);
    total -= old.size;
  }
  return finished;
}
