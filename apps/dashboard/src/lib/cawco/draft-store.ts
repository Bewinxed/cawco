/**
 * Where a conversation's unsent message waits out a reload: IndexedDB, one
 * record per session id, holding everything the composer holds — the text,
 * the images, the file attachments and the canvas. A comment's unsaid words
 * and chips wait here too (preview/comment-drafts.svelte.ts), so it stands
 * outside the transcript: an artifact's own tab, which loads none of the
 * transcript's modules, keeps its comments' drafts through it.
 *
 * IndexedDB rather than localStorage because the attachments are binary and
 * large: images are stored as Blobs, not as base64 strings in a 5 MB string
 * store. The browser's own quota holds the database: a write it refuses
 * (`QuotaExceededError`) drops the draft edited longest ago and is tried
 * again, never dropping the one being written, and each dropped draft is
 * named to the person.
 */

import { isImageMediaType } from "@cawco/core/attachments";
import { transcriptWords } from "@cawco/core/words/transcript";
import { quote } from "@cawco/providers/quote";
import { DraftRecordSchema } from "#lib/cawco/stored-shapes.js";
import { newId } from "#lib/platform/id.js";
import { toast } from "#lib/platform/toasts.js";
import { database, done, result, DRAFTS as STORE } from "./idb";
import type {
  DraftCanvas,
  DraftContent,
  PendingFile,
  PendingImage,
  PendingText,
} from "./transcript/composer-draft.svelte";

/** A file as a stored draft keeps it: the hub's reference, or its bytes to upload again. */
export type StoredFile = Pick<
  PendingFile,
  "name" | "mediaType" | "size" | "ref"
> & {
  blob?: Blob;
};

export interface DraftRecord {
  /** The canvas the message carries; absent on a record stored before canvases. */
  canvas?: DraftCanvas | null;
  /** Absent on a record stored before files could be attached. */
  files?: StoredFile[];
  images: { blob: Blob; mediaType: string; name: string }[];
  sessionId: string;
  /** What the record weighs: blob bytes plus two per character. */
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

/** The draft stored for a conversation, or null. */
export async function loadDraft(
  sessionId: string
): Promise<DraftContent | null> {
  const db = await database();
  const record = DraftRecordSchema.optional()
    .catch(undefined)
    .parse(
      await result(db.transaction(STORE).objectStore(STORE).get(sessionId))
    );
  if (!record) {
    return null;
  }
  return {
    text: record.text,
    // A kept picture of a type no session takes is one its composer would
    // refuse now: it is not put back.
    images: await Promise.all(
      record.images.flatMap(({ name, mediaType, blob }) =>
        isImageMediaType(mediaType)
          ? [base64Of(blob).then((data) => ({ name, mediaType, data }))]
          : []
      )
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

/** Whether `error` is the browser refusing a write for want of room. */
const outOfRoom = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "QuotaExceededError";

/** The draft of the conversation edited longest ago, other than `keep`'s, dropped; null when there is none. */
async function dropOldest(
  db: IDBDatabase,
  keep: string
): Promise<DraftRecord | null> {
  const transaction = db.transaction(STORE, "readwrite");
  const finished = done(transaction);
  const store = transaction.objectStore(STORE);
  const [oldest] = (await result(store.getAll()))
    .flatMap((one: unknown) => {
      const read = DraftRecordSchema.safeParse(one);
      return read.success && read.data.sessionId !== keep ? [read.data] : [];
    })
    .sort((a, b) => a.updatedAt - b.updatedAt);
  if (oldest) {
    store.delete(oldest.sessionId);
  }
  await finished;
  return oldest ?? null;
}

/**
 * Stores a conversation's draft, or drops its record when the draft is
 * empty. A write the browser refuses for want of room drops the oldest
 * other draft and is tried again, until it is kept or no other draft is left
 * to drop.
 */
export async function saveDraft(
  sessionId: string,
  draft: DraftContent
): Promise<void> {
  const db = await database();
  if (isEmpty(draft)) {
    const transaction = db.transaction(STORE, "readwrite");
    const finished = done(transaction);
    transaction.objectStore(STORE).delete(sessionId);
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
  const dropped: DraftRecord[] = [];
  for (;;) {
    const transaction = db.transaction(STORE, "readwrite");
    const finished = done(transaction);
    transaction.objectStore(STORE).put(record);
    try {
      await finished;
      break;
    } catch (error) {
      // The request's error may reach the transaction's handler before the abort that carries the cause.
      const old =
        outOfRoom(error) || outOfRoom(transaction.error)
          ? await dropOldest(db, sessionId)
          : null;
      if (!old) {
        throw error;
      }
      dropped.push(old);
    }
  }
  for (const old of dropped) {
    const first = quote(old.text);
    toast.info(
      transcriptWords.draftDropped(
        first ? `"${first}"` : "a draft with attachments and no words"
      )
    );
  }
}
