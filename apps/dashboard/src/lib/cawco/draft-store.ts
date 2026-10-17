/**
 * Where a conversation's unsent message waits out a reload: IndexedDB, one
 * record per session id, holding everything the composer holds — the text,
 * the images, the file attachments and the canvas. A pin's unsaid words
 * wait here too (preview/pin-drafts.svelte.ts), so it stands outside the
 * transcript: an artifact's own tab, which loads none of the transcript's
 * modules, keeps its pins' drafts through it.
 *
 * IndexedDB rather than localStorage because the attachments are binary and
 * large: images are stored as Blobs, not as base64 strings in a 5 MB string
 * store. The whole database is held under {@link CAP_BYTES}; past it, the
 * drafts edited longest ago are dropped until it fits, never the one being
 * written.
 */

import { newId } from "./id";
import { database, done, result, DRAFTS as STORE } from "./idb";
import type {
  DraftCanvas,
  PendingFile,
  PendingImage,
  PendingText,
} from "./transcript/composer-draft.svelte";

/** A file as a stored draft keeps it: the hub's reference, or its bytes to upload again. */
type StoredFile = Pick<PendingFile, "name" | "mediaType" | "size" | "ref"> & {
  blob?: Blob;
};

/** The most the stored drafts may weigh together, in bytes. */
export const CAP_BYTES = 50 * 1024 * 1024;

interface DraftRecord {
  /** The canvas the message carries; absent on a record stored before canvases. */
  canvas?: DraftCanvas | null;
  /** Absent on a record stored before files could be attached. */
  files?: StoredFile[];
  images: { blob: Blob; mediaType: string; name: string }[];
  sessionId: string;
  /** What the record weighs, for the cap: blob bytes plus two per character. */
  size: number;
  text: string;
  texts: PendingText[];
  /** When it was last written, for eviction. */
  updatedAt: number;
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
  canvas: DraftCanvas | null;
  files: PendingFile[];
  images: PendingImage[];
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
    // A file whose upload a reload cut short is one to try again.
    files: (record.files ?? []).map((file) => ({
      ...file,
      id: newId(),
      progress: file.ref ? 1 : 0,
      ...(file.ref ? {} : { error: "The page reloaded before it finished." }),
    })),
    // Back as its chip: a reload opens nothing over the field by itself.
    canvas: record.canvas ? { ...record.canvas, folded: true } : null,
  };
}

const isEmpty = (draft: DraftContent) =>
  !(
    draft.canvas ||
    draft.text ||
    draft.images.length ||
    draft.texts.length ||
    draft.files.length
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
  // The hub keeps a file it has; only one it does not have keeps its bytes here.
  const files: StoredFile[] = draft.files.map((file) =>
    file.ref
      ? {
          name: file.name,
          mediaType: file.mediaType,
          size: file.size,
          ref: file.ref,
        }
      : {
          name: file.name,
          mediaType: file.mediaType,
          size: file.size,
          blob: file.blob,
        }
  );
  const size =
    images.reduce((sum, image) => sum + image.blob.size, 0) +
    files.reduce((sum, file) => sum + (file.blob?.size ?? 0), 0) +
    2 *
      (draft.text.length +
        (draft.canvas?.thumb?.length ?? 0) +
        draft.texts.reduce((sum, t) => sum + t.content.length, 0));
  const record: DraftRecord = {
    sessionId,
    text: draft.text,
    images,
    texts: draft.texts,
    files,
    canvas: draft.canvas,
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
